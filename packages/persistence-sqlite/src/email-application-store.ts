import { DatabaseSync } from 'node:sqlite';
import { EmailApplicationPackageSchema, type EmailApplicationPackage } from '@job-harness/contracts';
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

  close(): void { this.db.close(); }
}
