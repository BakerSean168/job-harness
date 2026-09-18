import { DatabaseSync } from 'node:sqlite';
import { EmailApplicationPackageSchema, EmailSendAuthorizationSchema, type EmailApplicationPackage, type EmailSendAuthorization } from '@job-harness/contracts';
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

function authorizationFromRow(row: Row): EmailSendAuthorization {
  return EmailSendAuthorizationSchema.parse({
    id: row.id,
    packageId: row.package_id,
    draftHash: row.draft_hash,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    revokedAt: row.revoked_at,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
  });
}

function fromRow(row: Row): EmailApplicationPackage {
  return EmailApplicationPackageSchema.parse({
    id: row.id,
    intentId: row.intent_id,
    jobId: row.job_id,
    listingId: row.listing_id,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    draftHash: row.draft_hash,
    resumeProfileId: row.resume_profile_id,
    resumeRevisionId: row.resume_revision_id,
    resumeArtifactId: row.resume_artifact_id,
    attachmentFileName: row.attachment_file_name,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  });
}

export interface EmailApplicationPackageStorePort {
  get(packageId: string): Promise<EmailApplicationPackage | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<EmailApplicationPackage | null>;
  insert(value: EmailApplicationPackage): Promise<EmailApplicationPackage>;
  issueAuthorization(value: EmailSendAuthorization): Promise<EmailSendAuthorization>;
  listActiveAuthorizations(now: string, limit: number): Promise<EmailSendAuthorization[]>;
  consumeAuthorization(input: { packageId: string; authorizationId: string; draftHash: string; now: string }): Promise<EmailSendAuthorization>;
}

export class SqliteEmailApplicationPackageStore implements EmailApplicationPackageStorePort {
  private readonly db: DatabaseSync;
  constructor(databasePath: string) { this.db = openDatabase(databasePath); }

  async get(packageId: string): Promise<EmailApplicationPackage | null> {
    const row = this.db.prepare('SELECT * FROM email_application_packages WHERE id = ?').get(packageId) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<EmailApplicationPackage | null> {
    const row = this.db.prepare('SELECT * FROM email_application_packages WHERE idempotency_key = ?').get(idempotencyKey) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  async insert(value: EmailApplicationPackage): Promise<EmailApplicationPackage> {
    const parsed = EmailApplicationPackageSchema.parse(value);
    this.db.prepare(`INSERT INTO email_application_packages(
      id,intent_id,job_id,listing_id,recipient,subject,body,draft_hash,resume_profile_id,resume_revision_id,resume_artifact_id,attachment_file_name,idempotency_key,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      parsed.id, parsed.intentId, parsed.jobId, parsed.listingId, parsed.recipient, parsed.subject, parsed.body, parsed.draftHash,
      parsed.resumeProfileId, parsed.resumeRevisionId, parsed.resumeArtifactId, parsed.attachmentFileName, parsed.idempotencyKey, parsed.createdAt,
    );
    return parsed;
  }

  async issueAuthorization(value: EmailSendAuthorization): Promise<EmailSendAuthorization> {
    const parsed = EmailSendAuthorizationSchema.parse(value);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db.prepare('SELECT * FROM email_send_authorizations WHERE package_id=? AND idempotency_key=?').get(parsed.packageId, parsed.idempotencyKey) as Row | undefined;
      if (existing) {
        const current = authorizationFromRow(existing);
        if (current.requestHash !== parsed.requestHash) throw new Error(`Email send authorization idempotency key '${parsed.idempotencyKey}' was reused with different input`);
        this.db.exec('COMMIT');
        return current;
      }
      this.db.prepare("UPDATE email_send_authorizations SET status='revoked',revoked_at=? WHERE package_id=? AND status='active' AND expires_at <= ?")
        .run(parsed.issuedAt, parsed.packageId, parsed.issuedAt);
      const active = this.db.prepare("SELECT id FROM email_send_authorizations WHERE package_id=? AND status='active' LIMIT 1").get(parsed.packageId) as Row | undefined;
      if (active) throw new Error(`EmailApplicationPackage '${parsed.packageId}' already has an active send authorization`);
      this.db.prepare(`INSERT INTO email_send_authorizations(
        id,package_id,draft_hash,status,issued_at,expires_at,consumed_at,revoked_at,idempotency_key,request_hash
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
        parsed.id, parsed.packageId, parsed.draftHash, parsed.status, parsed.issuedAt, parsed.expiresAt, parsed.consumedAt, parsed.revokedAt, parsed.idempotencyKey, parsed.requestHash,
      );
      this.db.exec('COMMIT');
      return parsed;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async listActiveAuthorizations(now: string, limit: number): Promise<EmailSendAuthorization[]> {
    const rows = this.db.prepare("SELECT * FROM email_send_authorizations WHERE status='active' AND expires_at > ? ORDER BY issued_at ASC,id ASC LIMIT ?").all(now, limit) as Row[];
    return rows.map(authorizationFromRow);
  }

  async consumeAuthorization(input: { packageId: string; authorizationId: string; draftHash: string; now: string }): Promise<EmailSendAuthorization> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT * FROM email_send_authorizations WHERE id=? AND package_id=?').get(input.authorizationId, input.packageId) as Row | undefined;
      if (!row) throw new Error(`Email send authorization '${input.authorizationId}' was not found`);
      const current = authorizationFromRow(row);
      if (current.status !== 'active') throw new Error(`Email send authorization '${current.id}' is '${current.status}'`);
      if (current.draftHash !== input.draftHash) throw new Error('Email send authorization draft hash does not match the immutable package');
      if (Date.parse(current.expiresAt) <= Date.parse(input.now)) {
        this.db.prepare("UPDATE email_send_authorizations SET status='revoked',revoked_at=? WHERE id=? AND status='active'").run(input.now, current.id);
        this.db.exec('COMMIT');
        throw new Error(`Email send authorization '${current.id}' expired at ${current.expiresAt}`);
      }
      this.db.prepare("UPDATE email_send_authorizations SET status='consumed',consumed_at=? WHERE id=? AND status='active'").run(input.now, current.id);
      const consumed = authorizationFromRow(this.db.prepare('SELECT * FROM email_send_authorizations WHERE id=?').get(current.id) as Row);
      this.db.exec('COMMIT');
      return consumed;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  close(): void { this.db.close(); }
}
