import { DatabaseSync } from 'node:sqlite';
import {
  ExecutionAttemptSchema,
  ExecutionEventSchema,
  ExecutorRegistrationSchema,
  ReviewSnapshotSchema,
  SubmitAuthorizationSchema,
  ListExecutionAttemptsOutputSchema,
  ListExecutorsOutputSchema,
  type ExecutionAttempt,
  type ExecutionEvent,
  type ExecutorRegistration,
  type ListExecutionAttemptsInput,
  type ListExecutorsInput,
  type ReviewSnapshot,
  type SubmitAuthorization,
} from '@job-harness/apply-contracts';
import { ApplyConflictError, ApplyLeaseLostError, ApplyNotFoundError, type AppendExecutionEventInput, type ApplyStorePort, type AttemptMutation } from '@job-harness/apply-runtime';
import { migrateSqliteDatabase } from './schema';

type Row = Record<string, unknown>;

function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  migrateSqliteDatabase(db);
  return db;
}

function json<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

class ApplySession {
  constructor(readonly db: DatabaseSync) {}

  executorFromRow(row: Row): ExecutorRegistration {
    return ExecutorRegistrationSchema.parse({
      executorId: row.id,
      name: row.name,
      version: row.version,
      hostLabel: row.host_label,
      status: row.status,
      browserBackends: json(row.browser_backends_json),
      adapterIds: json(row.adapter_ids_json),
      executionModes: json(row.execution_modes_json),
      capabilities: json(row.capabilities_json),
      maxConcurrency: row.max_concurrency,
      lastHeartbeatAt: row.last_heartbeat_at,
      metadata: json(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  attemptFromRow(row: Row): ExecutionAttempt {
    return ExecutionAttemptSchema.parse({
      id: row.id,
      intentId: row.intent_id,
      executorId: row.executor_id,
      requiredAdapterId: row.required_adapter_id,
      adapterId: row.adapter_id,
      adapterVersion: row.adapter_version,
      preferredBrowserBackend: row.preferred_browser_backend,
      browserBackend: row.browser_backend,
      browserSessionHandoff: row.browser_session_handoff_json == null ? null : json(row.browser_session_handoff_json),
      executionMode: row.execution_mode,
      state: row.state,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at,
      lastHeartbeatAt: row.last_heartbeat_at,
      checkpoint: row.checkpoint,
      externalEffectState: row.external_effect_state,
      requiredCapabilities: json(row.required_capabilities_json),
      policySnapshot: json(row.policy_snapshot_json),
      bundle: json(row.bundle_json),
      bundleHash: row.bundle_hash,
      dispatchRequestHash: row.dispatch_request_hash,
      reviewHash: row.review_hash,
      submitAuthorizationId: row.submit_authorization_id,
      errorCode: row.error_code,
      errorSummary: row.error_summary,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  eventFromRow(row: Row): ExecutionEvent {
    return ExecutionEventSchema.parse({
      id: row.id,
      attemptId: row.attempt_id,
      sequence: row.sequence,
      type: row.type,
      occurredAt: row.occurred_at,
      checkpoint: row.checkpoint,
      payload: json(row.payload_json),
    });
  }

  reviewSnapshotFromRow(row: Row): ReviewSnapshot {
    return ReviewSnapshotSchema.parse({
      id: row.id,
      attemptId: row.attempt_id,
      bundleHash: row.bundle_hash,
      browserSessionRef: row.browser_session_ref,
      formStateHash: row.form_state_hash,
      formVersion: row.form_version,
      catalogVersion: row.catalog_version,
      siteAdapterId: row.site_adapter_id,
      siteAdapterVersion: row.site_adapter_version,
      summary: json(row.summary_json),
      reviewHash: row.review_hash,
      createdAt: row.created_at,
    });
  }

  submitAuthorizationFromRow(row: Row): SubmitAuthorization {
    return SubmitAuthorizationSchema.parse({
      id: row.id,
      attemptId: row.attempt_id,
      reviewSnapshotId: row.review_snapshot_id,
      reviewHash: row.review_hash,
      actor: row.actor,
      status: row.status,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      revokedAt: row.revoked_at,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
    });
  }

  getExecutor(id: string): ExecutorRegistration | null {
    const row = this.db.prepare('SELECT * FROM executor_registrations WHERE id = ?').get(id) as Row | undefined;
    return row ? this.executorFromRow(row) : null;
  }

  getAttempt(id: string): ExecutionAttempt | null {
    const row = this.db.prepare('SELECT * FROM execution_attempts WHERE id = ?').get(id) as Row | undefined;
    return row ? this.attemptFromRow(row) : null;
  }

  appendEvent(event: AppendExecutionEventInput): ExecutionEvent {
    const sequence = Number((this.db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM execution_events WHERE attempt_id = ?').get(event.attemptId) as Row).n);
    this.db.prepare(`INSERT INTO execution_events(id,attempt_id,sequence,type,occurred_at,checkpoint,payload_json)
      VALUES(?,?,?,?,?,?,?)`).run(event.id, event.attemptId, sequence, event.type, event.occurredAt, event.checkpoint, JSON.stringify(event.payload));
    return this.eventFromRow(this.db.prepare('SELECT * FROM execution_events WHERE id = ?').get(event.id) as Row);
  }

  applyMutation(attemptId: string, mutation: AttemptMutation): void {
    const current = this.db.prepare('SELECT * FROM execution_attempts WHERE id = ?').get(attemptId) as Row | undefined;
    if (!current) return;
    const fields: Array<[string, unknown]> = [];
    const add = (column: string, key: keyof AttemptMutation) => {
      if (Object.prototype.hasOwnProperty.call(mutation, key)) fields.push([column, mutation[key]]);
    };
    add('state', 'state');
    add('executor_id', 'executorId');
    add('adapter_id', 'adapterId');
    add('adapter_version', 'adapterVersion');
    add('browser_backend', 'browserBackend');
    if (Object.prototype.hasOwnProperty.call(mutation, 'browserSessionHandoff')) fields.push(['browser_session_handoff_json', mutation.browserSessionHandoff == null ? null : JSON.stringify(mutation.browserSessionHandoff)]);
    add('lease_owner', 'leaseOwner');
    add('lease_token_hash', 'leaseTokenHash');
    add('lease_expires_at', 'leaseExpiresAt');
    add('last_heartbeat_at', 'lastHeartbeatAt');
    add('checkpoint', 'checkpoint');
    add('external_effect_state', 'externalEffectState');
    add('review_hash', 'reviewHash');
    add('submit_authorization_id', 'submitAuthorizationId');
    add('error_code', 'errorCode');
    add('error_summary', 'errorSummary');
    add('started_at', 'startedAt');
    add('completed_at', 'completedAt');
    fields.push(['updated_at', mutation.updatedAt]);
    const sql = `UPDATE execution_attempts SET ${fields.map(([column]) => `${column}=?`).join(',')} WHERE id=?`;
    this.db.prepare(sql).run(...fields.map(([, value]) => value as string | number | null), attemptId);
  }
}

export class SqliteApplyStore implements ApplyStorePort {
  private readonly readDb: DatabaseSync;
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(readonly databasePath: string) {
    this.readDb = openDatabase(databasePath);
  }

  close(): void { this.readDb.close(); }

  async withTransaction<T>(work: (session: ApplySession) => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.transactionTail;
    this.transactionTail = previous.then(() => gate);
    await previous;
    const db = openDatabase(this.databasePath);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = await work(new ApplySession(db));
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      db.close();
      release();
    }
  }

  async listExecutors(input: ListExecutorsInput) {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (input.statuses?.length) {
      where.push(`status IN (${input.statuses.map(() => '?').join(',')})`);
      params.push(...input.statuses);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number((this.readDb.prepare(`SELECT COUNT(*) AS n FROM executor_registrations ${clause}`).get(...params) as Row).n);
    const rows = this.readDb.prepare(`SELECT * FROM executor_registrations ${clause} ORDER BY last_heartbeat_at DESC, id LIMIT ? OFFSET ?`).all(
      ...params, input.limit ?? 50, input.offset ?? 0,
    ) as Row[];
    const session = new ApplySession(this.readDb);
    return ListExecutorsOutputSchema.parse({ items: rows.map((row) => session.executorFromRow(row)), total });
  }

  async getExecutor(executorId: string) { return new ApplySession(this.readDb).getExecutor(executorId); }

  async upsertExecutor(executor: ExecutorRegistration) {
    return this.withTransaction((session) => {
      const db = session.db;
      db.prepare(`INSERT INTO executor_registrations(
        id,name,version,host_label,status,browser_backends_json,adapter_ids_json,execution_modes_json,capabilities_json,
        max_concurrency,last_heartbeat_at,metadata_json,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,version=excluded.version,host_label=excluded.host_label,status=excluded.status,
        browser_backends_json=excluded.browser_backends_json,adapter_ids_json=excluded.adapter_ids_json,
        execution_modes_json=excluded.execution_modes_json,capabilities_json=excluded.capabilities_json,
        max_concurrency=excluded.max_concurrency,last_heartbeat_at=excluded.last_heartbeat_at,metadata_json=excluded.metadata_json,
        updated_at=excluded.updated_at`).run(
        executor.executorId, executor.name, executor.version, executor.hostLabel, executor.status,
        JSON.stringify(executor.browserBackends), JSON.stringify(executor.adapterIds), JSON.stringify(executor.executionModes),
        JSON.stringify(executor.capabilities), executor.maxConcurrency, executor.lastHeartbeatAt, JSON.stringify(executor.metadata),
        executor.createdAt, executor.updatedAt,
      );
      return session.getExecutor(executor.executorId)!;
    });
  }

  async listAttempts(input: ListExecutionAttemptsInput) {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (input.states?.length) { where.push(`state IN (${input.states.map(() => '?').join(',')})`); params.push(...input.states); }
    if (input.intentId) { where.push('intent_id = ?'); params.push(input.intentId); }
    if (input.executorId) { where.push('executor_id = ?'); params.push(input.executorId); }
    if (input.externalEffectStates?.length) {
      where.push(`external_effect_state IN (${input.externalEffectStates.map(() => '?').join(',')})`);
      params.push(...input.externalEffectStates);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number((this.readDb.prepare(`SELECT COUNT(*) AS n FROM execution_attempts ${clause}`).get(...params) as Row).n);
    const rows = this.readDb.prepare(`SELECT * FROM execution_attempts ${clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`).all(
      ...params, input.limit ?? 50, input.offset ?? 0,
    ) as Row[];
    const session = new ApplySession(this.readDb);
    return ListExecutionAttemptsOutputSchema.parse({ items: rows.map((row) => session.attemptFromRow(row)), total });
  }

  async getAttempt(attemptId: string) { return new ApplySession(this.readDb).getAttempt(attemptId); }

  async listEvents(attemptId: string) {
    const rows = this.readDb.prepare('SELECT * FROM execution_events WHERE attempt_id = ? ORDER BY sequence').all(attemptId) as Row[];
    const session = new ApplySession(this.readDb);
    return rows.map((row) => session.eventFromRow(row));
  }

  async findAttemptByIdempotencyKey(key: string) {
    const row = this.readDb.prepare('SELECT * FROM execution_attempts WHERE idempotency_key = ?').get(key) as Row | undefined;
    return row ? new ApplySession(this.readDb).attemptFromRow(row) : null;
  }

  async findActiveAttemptByIntent(intentId: string) {
    const row = this.readDb.prepare(`SELECT * FROM execution_attempts WHERE intent_id = ? AND state IN ('queued','claimed','running','waiting_for_user') ORDER BY created_at DESC LIMIT 1`).get(intentId) as Row | undefined;
    return row ? new ApplySession(this.readDb).attemptFromRow(row) : null;
  }

  async insertAttempt(attempt: ExecutionAttempt, initialEvent: AppendExecutionEventInput) {
    return this.withTransaction((session) => {
      const db = session.db;
      const intent = db.prepare('SELECT status FROM submission_intents WHERE id = ?').get(attempt.intentId) as Row | undefined;
      if (!intent) throw new ApplyNotFoundError('SubmissionIntent', attempt.intentId);
      if (String(intent.status) !== 'planned') throw new ApplyConflictError(`SubmissionIntent '${attempt.intentId}' is '${String(intent.status)}' and cannot be dispatched`);
      db.prepare(`INSERT INTO execution_attempts(
        id,intent_id,executor_id,required_adapter_id,adapter_id,adapter_version,preferred_browser_backend,browser_backend,browser_session_handoff_json,
        execution_mode,state,lease_owner,lease_token_hash,lease_expires_at,last_heartbeat_at,checkpoint,external_effect_state,
        required_capabilities_json,policy_snapshot_json,bundle_json,bundle_hash,dispatch_request_hash,review_hash,submit_authorization_id,
        error_code,error_summary,started_at,completed_at,idempotency_key,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        attempt.id, attempt.intentId, attempt.executorId, attempt.requiredAdapterId, attempt.adapterId, attempt.adapterVersion,
        attempt.preferredBrowserBackend, attempt.browserBackend, attempt.browserSessionHandoff == null ? null : JSON.stringify(attempt.browserSessionHandoff), attempt.executionMode, attempt.state, attempt.leaseOwner, null,
        attempt.leaseExpiresAt, attempt.lastHeartbeatAt, attempt.checkpoint, attempt.externalEffectState,
        JSON.stringify(attempt.requiredCapabilities), JSON.stringify(attempt.policySnapshot), JSON.stringify(attempt.bundle),
        attempt.bundleHash, attempt.dispatchRequestHash, attempt.reviewHash, attempt.submitAuthorizationId, attempt.errorCode,
        attempt.errorSummary, attempt.startedAt, attempt.completedAt, attempt.idempotencyKey, attempt.createdAt, attempt.updatedAt,
      );
      session.appendEvent(initialEvent);
      return session.getAttempt(attempt.id)!;
    });
  }

  async countLeasedAttempts(executorId: string, at: string) {
    return Number((this.readDb.prepare(`SELECT COUNT(*) AS n FROM execution_attempts
      WHERE executor_id = ? AND state IN ('claimed','running') AND lease_expires_at IS NOT NULL AND lease_expires_at > ?`).get(executorId, at) as Row).n);
  }

  async hasValidLease(input: Parameters<ApplyStorePort['hasValidLease']>[0]) {
    if (!input.allowedStates.length) return false;
    const placeholders = input.allowedStates.map(() => '?').join(',');
    const row = this.readDb.prepare(`SELECT 1 AS ok FROM execution_attempts WHERE id=? AND executor_id=? AND lease_owner=? AND lease_token_hash=?
      AND lease_expires_at IS NOT NULL AND lease_expires_at > ? AND state IN (${placeholders}) LIMIT 1`).get(
      input.attemptId, input.executorId, input.executorId, input.leaseTokenHash, input.now, ...input.allowedStates,
    ) as Row | undefined;
    return Boolean(row);
  }

  async createReviewSnapshot(input: Parameters<ApplyStorePort['createReviewSnapshot']>[0]) {
    return this.withTransaction((session) => {
      const attemptRow = session.db.prepare('SELECT * FROM execution_attempts WHERE id=?').get(input.snapshot.attemptId) as Row | undefined;
      if (!attemptRow) throw new ApplyNotFoundError('ExecutionAttempt', input.snapshot.attemptId);
      const attempt = session.attemptFromRow(attemptRow);
      const lease = session.db.prepare(`SELECT 1 AS ok FROM execution_attempts
        WHERE id=? AND executor_id=? AND lease_owner=? AND lease_token_hash=? AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
          AND state='running' AND external_effect_state='not_crossed' LIMIT 1`).get(
          attempt.id, input.executorId, input.executorId, input.leaseTokenHash, input.now,
        ) as Row | undefined;
      if (!lease) throw new ApplyLeaseLostError(attempt.id);
      if (attempt.bundleHash !== input.snapshot.bundleHash) throw new ApplyConflictError('ReviewSnapshot bundle hash does not match the frozen ApplyBundle');
      const existing = session.db.prepare('SELECT * FROM execution_review_snapshots WHERE attempt_id=? AND review_hash=?').get(attempt.id, input.snapshot.reviewHash) as Row | undefined;
      if (existing) return session.reviewSnapshotFromRow(existing);
      session.db.prepare(`INSERT INTO execution_review_snapshots(
        id,attempt_id,bundle_hash,browser_session_ref,form_state_hash,form_version,catalog_version,site_adapter_id,site_adapter_version,summary_json,review_hash,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        input.snapshot.id, attempt.id, input.snapshot.bundleHash, input.snapshot.browserSessionRef, input.snapshot.formStateHash,
        input.snapshot.formVersion, input.snapshot.catalogVersion, input.snapshot.siteAdapterId, input.snapshot.siteAdapterVersion,
        JSON.stringify(input.snapshot.summary), input.snapshot.reviewHash, input.snapshot.createdAt,
      );
      return input.snapshot;
    });
  }

  async listReviewSnapshots(attemptId: string, limit: number) {
    const rows = this.readDb.prepare('SELECT * FROM execution_review_snapshots WHERE attempt_id=? ORDER BY created_at DESC,id DESC LIMIT ?').all(attemptId, limit) as Row[];
    const session = new ApplySession(this.readDb);
    return rows.map((row) => session.reviewSnapshotFromRow(row));
  }

  async getReviewSnapshot(snapshotId: string) {
    const row = this.readDb.prepare('SELECT * FROM execution_review_snapshots WHERE id=?').get(snapshotId) as Row | undefined;
    return row ? new ApplySession(this.readDb).reviewSnapshotFromRow(row) : null;
  }

  async issueSubmitAuthorization(authorization: SubmitAuthorization) {
    return this.withTransaction((session) => {
      const existing = session.db.prepare('SELECT * FROM submit_authorizations WHERE attempt_id=? AND idempotency_key=?').get(authorization.attemptId, authorization.idempotencyKey) as Row | undefined;
      if (existing) {
        const parsed = session.submitAuthorizationFromRow(existing);
        if (parsed.requestHash !== authorization.requestHash) throw new ApplyConflictError(`SubmitAuthorization idempotency key '${authorization.idempotencyKey}' was reused with different input`);
        return parsed;
      }
      const attemptRow = session.db.prepare('SELECT * FROM execution_attempts WHERE id=?').get(authorization.attemptId) as Row | undefined;
      if (!attemptRow) throw new ApplyNotFoundError('ExecutionAttempt', authorization.attemptId);
      const attempt = session.attemptFromRow(attemptRow);
      if (attempt.state !== 'waiting_for_user') throw new ApplyConflictError(`ExecutionAttempt '${attempt.id}' must be waiting_for_user before submit can be authorized`);
      if (attempt.externalEffectState !== 'not_crossed') throw new ApplyConflictError(`ExecutionAttempt '${attempt.id}' already crossed the external-effect boundary`);
      const snapshotRow = session.db.prepare('SELECT * FROM execution_review_snapshots WHERE id=? AND attempt_id=?').get(authorization.reviewSnapshotId, attempt.id) as Row | undefined;
      if (!snapshotRow) throw new ApplyNotFoundError('ReviewSnapshot', authorization.reviewSnapshotId);
      const snapshot = session.reviewSnapshotFromRow(snapshotRow);
      if (snapshot.reviewHash !== authorization.reviewHash) throw new ApplyConflictError('SubmitAuthorization review hash does not match ReviewSnapshot');
      if (!snapshot.summary.readyForSubmit) throw new ApplyConflictError('ReviewSnapshot is not ready for submit authorization');
      if (snapshot.bundleHash !== attempt.bundleHash) throw new ApplyConflictError('ReviewSnapshot was created for a different ApplyBundle');
      if (snapshot.browserSessionRef && snapshot.browserSessionRef !== attempt.browserSessionHandoff?.sessionRef) {
        throw new ApplyConflictError('ReviewSnapshot browser session does not match the retained review session');
      }
      // Expired authorizations are no longer executable. Revoke them lazily in the
      // same transaction so a fresh human authorization can be issued without a
      // maintenance job racing the partial unique index.
      session.db.prepare("UPDATE submit_authorizations SET status='revoked',revoked_at=? WHERE attempt_id=? AND status='active' AND expires_at <= ?")
        .run(authorization.issuedAt, attempt.id, authorization.issuedAt);
      const active = session.db.prepare("SELECT id FROM submit_authorizations WHERE attempt_id=? AND status='active' LIMIT 1").get(attempt.id) as Row | undefined;
      if (active) throw new ApplyConflictError(`ExecutionAttempt '${attempt.id}' already has an active SubmitAuthorization`);
      session.db.prepare(`INSERT INTO submit_authorizations(
        id,attempt_id,review_snapshot_id,review_hash,actor,status,issued_at,expires_at,consumed_at,revoked_at,idempotency_key,request_hash
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        authorization.id, authorization.attemptId, authorization.reviewSnapshotId, authorization.reviewHash, authorization.actor,
        authorization.status, authorization.issuedAt, authorization.expiresAt, authorization.consumedAt, authorization.revokedAt,
        authorization.idempotencyKey, authorization.requestHash,
      );
      session.applyMutation(attempt.id, {
        reviewHash: snapshot.reviewHash,
        submitAuthorizationId: authorization.id,
        updatedAt: authorization.issuedAt,
      });
      return authorization;
    });
  }

  async listSubmitAuthorizations(attemptId: string, limit: number) {
    const rows = this.readDb.prepare('SELECT * FROM submit_authorizations WHERE attempt_id=? ORDER BY issued_at DESC,id DESC LIMIT ?').all(attemptId, limit) as Row[];
    const session = new ApplySession(this.readDb);
    return rows.map((row) => session.submitAuthorizationFromRow(row));
  }

  async getSubmitAuthorization(authorizationId: string) {
    const row = this.readDb.prepare('SELECT * FROM submit_authorizations WHERE id=?').get(authorizationId) as Row | undefined;
    return row ? new ApplySession(this.readDb).submitAuthorizationFromRow(row) : null;
  }

  async revokeSubmitAuthorization(input: Parameters<ApplyStorePort['revokeSubmitAuthorization']>[0]) {
    return this.withTransaction((session) => {
      const row = session.db.prepare('SELECT * FROM submit_authorizations WHERE id=? AND attempt_id=?').get(input.authorizationId, input.attemptId) as Row | undefined;
      if (!row) throw new ApplyNotFoundError('SubmitAuthorization', input.authorizationId);
      const current = session.submitAuthorizationFromRow(row);
      if (current.status === 'revoked') return current;
      if (current.status !== 'active') throw new ApplyConflictError(`SubmitAuthorization '${current.id}' is '${current.status}' and cannot be revoked`);
      session.db.prepare("UPDATE submit_authorizations SET status='revoked',revoked_at=? WHERE id=?").run(input.now, current.id);
      session.db.prepare("UPDATE execution_attempts SET submit_authorization_id=NULL,updated_at=? WHERE id=? AND submit_authorization_id=? AND external_effect_state='not_crossed'")
        .run(input.now, current.attemptId, current.id);
      return session.submitAuthorizationFromRow(session.db.prepare('SELECT * FROM submit_authorizations WHERE id=?').get(current.id) as Row);
    });
  }

  async validateSubmitAuthorization(input: Parameters<ApplyStorePort['validateSubmitAuthorization']>[0]) {
    const attemptRow = this.readDb.prepare('SELECT * FROM execution_attempts WHERE id=?').get(input.attemptId) as Row | undefined;
    if (!attemptRow) throw new ApplyNotFoundError('ExecutionAttempt', input.attemptId);
    const session = new ApplySession(this.readDb);
    const attempt = session.attemptFromRow(attemptRow);
    const lease = this.readDb.prepare(`SELECT 1 AS ok FROM execution_attempts WHERE id=? AND executor_id=? AND lease_owner=? AND lease_token_hash=?
      AND lease_expires_at IS NOT NULL AND lease_expires_at > ? AND state='running' AND external_effect_state='not_crossed' LIMIT 1`).get(
      attempt.id, input.executorId, input.executorId, input.leaseTokenHash, input.now,
    ) as Row | undefined;
    if (!lease) throw new ApplyLeaseLostError(attempt.id);
    const authRow = this.readDb.prepare('SELECT * FROM submit_authorizations WHERE id=? AND attempt_id=?').get(input.authorizationId, attempt.id) as Row | undefined;
    if (!authRow) throw new ApplyNotFoundError('SubmitAuthorization', input.authorizationId);
    const authorization = session.submitAuthorizationFromRow(authRow);
    if (authorization.status !== 'active') throw new ApplyConflictError(`SubmitAuthorization '${authorization.id}' is '${authorization.status}'`);
    if (Date.parse(authorization.expiresAt) <= Date.parse(input.now)) throw new ApplyConflictError(`SubmitAuthorization '${authorization.id}' expired at ${authorization.expiresAt}`);
    const snapshotRow = this.readDb.prepare('SELECT * FROM execution_review_snapshots WHERE id=? AND attempt_id=?').get(authorization.reviewSnapshotId, attempt.id) as Row | undefined;
    if (!snapshotRow) throw new ApplyNotFoundError('ReviewSnapshot', authorization.reviewSnapshotId);
    const snapshot = session.reviewSnapshotFromRow(snapshotRow);
    if (snapshot.reviewHash !== authorization.reviewHash || snapshot.formStateHash !== input.formStateHash) {
      throw new ApplyConflictError('Current form state no longer matches the authorized ReviewSnapshot');
    }
    if (snapshot.browserSessionRef && snapshot.browserSessionRef !== attempt.browserSessionHandoff?.sessionRef) {
      throw new ApplyConflictError('Current browser session no longer matches the authorized ReviewSnapshot');
    }
    return { attempt, authorization, snapshot };
  }

  async consumeAndMarkSubmitBoundary(input: Parameters<ApplyStorePort['consumeAndMarkSubmitBoundary']>[0]) {
    return this.withTransaction((session) => {
      const attemptRow = session.db.prepare('SELECT * FROM execution_attempts WHERE id=?').get(input.attemptId) as Row | undefined;
      if (!attemptRow) throw new ApplyNotFoundError('ExecutionAttempt', input.attemptId);
      const attempt = session.attemptFromRow(attemptRow);
      const lease = session.db.prepare(`SELECT 1 AS ok FROM execution_attempts WHERE id=? AND executor_id=? AND lease_owner=? AND lease_token_hash=?
        AND lease_expires_at IS NOT NULL AND lease_expires_at > ? AND state='running' AND external_effect_state='not_crossed' LIMIT 1`).get(
        attempt.id, input.executorId, input.executorId, input.leaseTokenHash, input.now,
      ) as Row | undefined;
      if (!lease) throw new ApplyLeaseLostError(attempt.id);
      const authRow = session.db.prepare('SELECT * FROM submit_authorizations WHERE id=? AND attempt_id=?').get(input.authorizationId, attempt.id) as Row | undefined;
      if (!authRow) throw new ApplyNotFoundError('SubmitAuthorization', input.authorizationId);
      const authorization = session.submitAuthorizationFromRow(authRow);
      if (authorization.status !== 'active') throw new ApplyConflictError(`SubmitAuthorization '${authorization.id}' is '${authorization.status}'`);
      if (Date.parse(authorization.expiresAt) <= Date.parse(input.now)) throw new ApplyConflictError(`SubmitAuthorization '${authorization.id}' expired at ${authorization.expiresAt}`);
      const snapshotRow = session.db.prepare('SELECT * FROM execution_review_snapshots WHERE id=? AND attempt_id=?').get(authorization.reviewSnapshotId, attempt.id) as Row | undefined;
      if (!snapshotRow) throw new ApplyNotFoundError('ReviewSnapshot', authorization.reviewSnapshotId);
      const snapshot = session.reviewSnapshotFromRow(snapshotRow);
      if (snapshot.reviewHash !== authorization.reviewHash || snapshot.formStateHash !== input.formStateHash) {
        throw new ApplyConflictError('Current form state no longer matches the authorized ReviewSnapshot');
      }
      if (snapshot.browserSessionRef && snapshot.browserSessionRef !== attempt.browserSessionHandoff?.sessionRef) {
        throw new ApplyConflictError('Current browser session no longer matches the authorized ReviewSnapshot');
      }
      session.db.prepare("UPDATE submit_authorizations SET status='consumed',consumed_at=? WHERE id=? AND status='active'").run(input.now, authorization.id);
      const consumedRow = session.db.prepare('SELECT * FROM submit_authorizations WHERE id=?').get(authorization.id) as Row;
      const consumed = session.submitAuthorizationFromRow(consumedRow);
      if (consumed.status !== 'consumed') throw new ApplyConflictError(`SubmitAuthorization '${authorization.id}' could not be consumed`);
      session.applyMutation(attempt.id, {
        reviewHash: snapshot.reviewHash,
        submitAuthorizationId: authorization.id,
        externalEffectState: 'crossed',
        checkpoint: 'submit-triggered',
        updatedAt: input.now,
      });
      session.appendEvent({
        id: input.authorizedEventId,
        attemptId: attempt.id,
        type: 'submit_authorized',
        occurredAt: input.now,
        checkpoint: 'submit-authorized',
        payload: { submitAuthorizationId: authorization.id, reviewSnapshotId: snapshot.id, reviewHash: snapshot.reviewHash },
      });
      session.appendEvent({
        id: input.triggeredEventId,
        attemptId: attempt.id,
        type: 'submit_triggered',
        occurredAt: input.now,
        checkpoint: 'submit-triggered',
        payload: { submitAuthorizationId: authorization.id },
      });
      const updatedAttempt = session.attemptFromRow(session.db.prepare('SELECT * FROM execution_attempts WHERE id=?').get(attempt.id) as Row);
      return { attempt: updatedAttempt, authorization: consumed, snapshot };
    });
  }

  async completeSubmitSuccess(input: Parameters<ApplyStorePort['completeSubmitSuccess']>[0]) {
    return this.withTransaction((session) => {
      const attemptRow = session.db.prepare('SELECT * FROM execution_attempts WHERE id=?').get(input.attemptId) as Row | undefined;
      if (!attemptRow) throw new ApplyNotFoundError('ExecutionAttempt', input.attemptId);
      const current = session.attemptFromRow(attemptRow);
      if (current.state === 'completed' && current.externalEffectState === 'crossed') return current;
      const lease = session.db.prepare(`SELECT 1 AS ok FROM execution_attempts WHERE id=? AND executor_id=? AND lease_owner=? AND lease_token_hash=?
        AND lease_expires_at IS NOT NULL AND lease_expires_at > ? AND state='running' AND external_effect_state='crossed' LIMIT 1`).get(
        current.id, input.executorId, input.executorId, input.leaseTokenHash, input.now,
      ) as Row | undefined;
      if (!lease) throw new ApplyLeaseLostError(current.id);
      session.applyMutation(current.id, {
        state: 'completed', leaseOwner: null, leaseTokenHash: null, leaseExpiresAt: null, browserSessionHandoff: null,
        completedAt: input.now, errorCode: null, errorSummary: null, updatedAt: input.now,
      });
      session.appendEvent({ id: input.eventIdFactory(), attemptId: current.id, type: 'external_success_observed', occurredAt: input.now, checkpoint: 'external-success', payload: input.payload });
      session.appendEvent({ id: input.eventIdFactory(), attemptId: current.id, type: 'attempt_completed', occurredAt: input.now, checkpoint: 'external-success', payload: {} });
      return session.attemptFromRow(session.db.prepare('SELECT * FROM execution_attempts WHERE id=?').get(current.id) as Row);
    });
  }

  async failSubmitAttempt(input: Parameters<ApplyStorePort['failSubmitAttempt']>[0]) {
    return this.withTransaction((session) => {
      const attemptRow = session.db.prepare('SELECT * FROM execution_attempts WHERE id=?').get(input.attemptId) as Row | undefined;
      if (!attemptRow) throw new ApplyNotFoundError('ExecutionAttempt', input.attemptId);
      const current = session.attemptFromRow(attemptRow);
      const lease = session.db.prepare(`SELECT 1 AS ok FROM execution_attempts WHERE id=? AND executor_id=? AND lease_owner=? AND lease_token_hash=?
        AND lease_expires_at IS NOT NULL AND lease_expires_at > ? AND state='running' AND external_effect_state='crossed' LIMIT 1`).get(
        current.id, input.executorId, input.executorId, input.leaseTokenHash, input.now,
      ) as Row | undefined;
      if (!lease) throw new ApplyLeaseLostError(current.id);
      session.applyMutation(current.id, {
        state: 'failed', leaseOwner: null, leaseTokenHash: null, leaseExpiresAt: null, browserSessionHandoff: null,
        externalEffectState: input.externalEffectState, completedAt: input.now, errorCode: input.errorCode, errorSummary: input.errorSummary, updatedAt: input.now,
      });
      session.appendEvent({ id: input.eventId, attemptId: current.id, type: 'attempt_failed', occurredAt: input.now, checkpoint: 'external-failure', payload: input.payload });
      return session.attemptFromRow(session.db.prepare('SELECT * FROM execution_attempts WHERE id=?').get(current.id) as Row);
    });
  }

  async abandonExpiredAttempts(input: Parameters<ApplyStorePort['abandonExpiredAttempts']>[0]) {
    return this.withTransaction((session) => {
      const rows = session.db.prepare(`SELECT * FROM execution_attempts
        WHERE state IN ('claimed','running') AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
        ORDER BY lease_expires_at, id LIMIT ?`).all(input.now, input.limit) as Row[];
      const abandoned: ExecutionAttempt[] = [];
      for (const row of rows) {
        const attempt = session.attemptFromRow(row);
        session.applyMutation(attempt.id, {
          state: 'abandoned',
          leaseOwner: null,
          leaseTokenHash: null,
          leaseExpiresAt: null,
          completedAt: input.now,
          errorCode: 'lease_expired',
          errorSummary: 'Worker lease expired before the attempt reached a durable terminal result',
          updatedAt: input.now,
        });
        session.appendEvent({
          id: input.eventIdFactory(),
          attemptId: attempt.id,
          type: 'attempt_abandoned',
          occurredAt: input.now,
          checkpoint: attempt.checkpoint,
          payload: { reason: 'lease_expired', externalEffectState: attempt.externalEffectState },
        });
        abandoned.push(session.getAttempt(attempt.id)!);
      }
      return abandoned;
    });
  }

  async tryClaimAttempt(input: Parameters<ApplyStorePort['tryClaimAttempt']>[0]) {
    return this.withTransaction((session) => {
      const db = session.db;
      const result = db.prepare(`UPDATE execution_attempts SET
        state='claimed',executor_id=?,lease_owner=?,lease_token_hash=?,lease_expires_at=?,last_heartbeat_at=?,updated_at=?
        WHERE id=? AND state='queued' AND external_effect_state='not_crossed'`).run(
        input.executorId, input.executorId, input.leaseTokenHash, input.leaseExpiresAt, input.now, input.now, input.attemptId,
      );
      if (Number(result.changes) !== 1) return null;
      session.appendEvent(input.event);
      return session.getAttempt(input.attemptId);
    });
  }

  async mutateWithLease(input: Parameters<ApplyStorePort['mutateWithLease']>[0]) {
    return this.withTransaction((session) => {
      const db = session.db;
      const placeholders = input.allowedStates.map(() => '?').join(',');
      const row = db.prepare(`SELECT id FROM execution_attempts WHERE id=? AND executor_id=? AND lease_owner=? AND lease_token_hash=?
        AND lease_expires_at IS NOT NULL AND lease_expires_at > ? AND state IN (${placeholders})`).get(
        input.attemptId, input.executorId, input.executorId, input.leaseTokenHash, input.now, ...input.allowedStates,
      ) as Row | undefined;
      if (!row) return null;
      session.applyMutation(input.attemptId, input.mutation);
      if (input.event) session.appendEvent(input.event);
      return session.getAttempt(input.attemptId);
    });
  }

  async mutateWithoutLease(input: Parameters<ApplyStorePort['mutateWithoutLease']>[0]) {
    return this.withTransaction((session) => {
      const db = session.db;
      const placeholders = input.allowedStates.map(() => '?').join(',');
      const row = db.prepare(`SELECT id FROM execution_attempts WHERE id=? AND state IN (${placeholders})`).get(
        input.attemptId, ...input.allowedStates,
      ) as Row | undefined;
      if (!row) return null;
      session.applyMutation(input.attemptId, input.mutation);
      session.appendEvent(input.event);
      return session.getAttempt(input.attemptId);
    });
  }
}
