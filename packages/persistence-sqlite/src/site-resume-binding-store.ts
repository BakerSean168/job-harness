import { DatabaseSync } from 'node:sqlite';
import {
  SiteResumeBindingSchema,
  type ListSiteResumeBindingsInput,
  type SiteResumeBinding,
} from '@job-harness/contracts';
import { migrateSqliteDatabase } from './schema';

type Row = Record<string, unknown>;

function fromRow(row: Row): SiteResumeBinding {
  return SiteResumeBindingSchema.parse({
    id: row.id,
    siteFamily: row.site_family,
    browserAgentId: row.browser_agent_id,
    profileId: row.profile_id,
    resumeRevisionId: row.resume_revision_id,
    resumeArtifactId: row.resume_artifact_id,
    externalResumeLabel: row.external_resume_label,
    assurance: row.assurance,
    characterizationRunId: row.characterization_run_id,
    characterizationFormStateHash: row.characterization_form_state_hash,
    characterizationObservedAt: row.characterization_observed_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    revokeIdempotencyKey: row.revoke_idempotency_key,
    revokeRequestHash: row.revoke_request_hash,
  });
}

function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  migrateSqliteDatabase(db);
  return db;
}

export interface SiteResumeBindingStorePort {
  list(input: ListSiteResumeBindingsInput): Promise<SiteResumeBinding[]>;
  get(id: string): Promise<SiteResumeBinding | null>;
  findByIdempotencyKey(siteFamily: string, browserAgentId: string, idempotencyKey: string): Promise<SiteResumeBinding | null>;
  insert(binding: SiteResumeBinding): Promise<SiteResumeBinding>;
  revoke(id: string, input: { now: string; idempotencyKey: string; requestHash: string }): Promise<SiteResumeBinding>;
}

export class SqliteSiteResumeBindingStore implements SiteResumeBindingStorePort {
  private readonly db: DatabaseSync;
  constructor(databasePath: string) { this.db = openDatabase(databasePath); }

  async list(input: ListSiteResumeBindingsInput): Promise<SiteResumeBinding[]> {
    const where: string[] = [];
    const params: string[] = [];
    if (input.siteFamily) { where.push('site_family=?'); params.push(input.siteFamily); }
    if (input.browserAgentId) { where.push('browser_agent_id=?'); params.push(input.browserAgentId); }
    if (input.profileId) { where.push('profile_id=?'); params.push(input.profileId); }
    if (!input.includeRevoked) where.push("status='active'");
    const sql = `SELECT * FROM site_resume_bindings${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC,id DESC`;
    return (this.db.prepare(sql).all(...params) as Row[]).map(fromRow);
  }

  async get(id: string): Promise<SiteResumeBinding | null> {
    const row = this.db.prepare('SELECT * FROM site_resume_bindings WHERE id=?').get(id) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  async findByIdempotencyKey(siteFamily: string, browserAgentId: string, idempotencyKey: string): Promise<SiteResumeBinding | null> {
    const row = this.db.prepare('SELECT * FROM site_resume_bindings WHERE site_family=? AND browser_agent_id=? AND idempotency_key=?').get(siteFamily, browserAgentId, idempotencyKey) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  async insert(binding: SiteResumeBinding): Promise<SiteResumeBinding> {
    const parsed = SiteResumeBindingSchema.parse(binding);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const active = this.db.prepare("SELECT id FROM site_resume_bindings WHERE site_family=? AND browser_agent_id=? AND profile_id=? AND status='active' LIMIT 1").get(parsed.siteFamily, parsed.browserAgentId, parsed.profileId) as Row | undefined;
      if (active) throw new Error(`Profile '${parsed.profileId}' already has an active ${parsed.siteFamily} resume binding for browser agent '${parsed.browserAgentId}'`);
      this.db.prepare(`INSERT INTO site_resume_bindings(
        id,site_family,browser_agent_id,profile_id,resume_revision_id,resume_artifact_id,external_resume_label,assurance,
        characterization_run_id,characterization_form_state_hash,characterization_observed_at,status,created_at,updated_at,revoked_at,idempotency_key,request_hash,revoke_idempotency_key,revoke_request_hash
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        parsed.id, parsed.siteFamily, parsed.browserAgentId, parsed.profileId, parsed.resumeRevisionId, parsed.resumeArtifactId,
        parsed.externalResumeLabel, parsed.assurance, parsed.characterizationRunId, parsed.characterizationFormStateHash,
        parsed.characterizationObservedAt, parsed.status, parsed.createdAt, parsed.updatedAt, parsed.revokedAt,
        parsed.idempotencyKey, parsed.requestHash, parsed.revokeIdempotencyKey, parsed.revokeRequestHash,
      );
      this.db.exec('COMMIT');
      return parsed;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async revoke(id: string, input: { now: string; idempotencyKey: string; requestHash: string }): Promise<SiteResumeBinding> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT * FROM site_resume_bindings WHERE id=?').get(id) as Row | undefined;
      if (!row) throw new Error(`SiteResumeBinding '${id}' was not found`);
      const current = fromRow(row);
      if (current.status === 'revoked') {
        if (current.revokeIdempotencyKey !== input.idempotencyKey || current.revokeRequestHash !== input.requestHash) {
          throw new Error(`SiteResumeBinding '${id}' is already revoked by a different request`);
        }
        this.db.exec('COMMIT');
        return current;
      }
      this.db.prepare("UPDATE site_resume_bindings SET status='revoked',revoked_at=?,updated_at=?,revoke_idempotency_key=?,revoke_request_hash=? WHERE id=? AND status='active'")
        .run(input.now, input.now, input.idempotencyKey, input.requestHash, id);
      const updated = fromRow(this.db.prepare('SELECT * FROM site_resume_bindings WHERE id=?').get(id) as Row);
      this.db.exec('COMMIT');
      return updated;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void { this.db.close(); }
}
