import { DatabaseSync } from 'node:sqlite';
import {
  ExecutionAttemptSchema,
  ExecutionEventSchema,
  ExecutorRegistrationSchema,
  ListExecutionAttemptsOutputSchema,
  ListExecutorsOutputSchema,
  type ExecutionAttempt,
  type ExecutionEvent,
  type ExecutorRegistration,
  type ListExecutionAttemptsInput,
  type ListExecutorsInput,
} from '@job-harness/apply-contracts';
import { ApplyConflictError, ApplyNotFoundError, type AppendExecutionEventInput, type ApplyStorePort, type AttemptMutation } from '@job-harness/apply-runtime';
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
        id,intent_id,executor_id,required_adapter_id,adapter_id,adapter_version,preferred_browser_backend,browser_backend,
        execution_mode,state,lease_owner,lease_token_hash,lease_expires_at,last_heartbeat_at,checkpoint,external_effect_state,
        required_capabilities_json,policy_snapshot_json,bundle_json,bundle_hash,dispatch_request_hash,review_hash,submit_authorization_id,
        error_code,error_summary,started_at,completed_at,idempotency_key,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        attempt.id, attempt.intentId, attempt.executorId, attempt.requiredAdapterId, attempt.adapterId, attempt.adapterVersion,
        attempt.preferredBrowserBackend, attempt.browserBackend, attempt.executionMode, attempt.state, attempt.leaseOwner, null,
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
