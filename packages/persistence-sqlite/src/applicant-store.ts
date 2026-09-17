import { DatabaseSync } from 'node:sqlite';
import {
  ApplicantProfileRevisionSchema,
  ApplicantProfileSchema,
  ApplicationAnswerSetRevisionSchema,
  ApplicationAnswerSetSchema,
  type ApplicantProfile,
  type ApplicantProfileRevision,
  type ApplicationAnswerSet,
  type ApplicationAnswerSetRevision,
} from '@job-harness/applicant-contracts';
import type {
  ApplicantStorePort,
  ApplicantStoreReadPort,
  ApplicantStoreTransactionPort,
} from '@job-harness/applicant-application';
import { migrateSqliteDatabase } from './schema';

type Row = Record<string, unknown>;
const parseJson = (value: unknown) => JSON.parse(String(value)) as unknown;

function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

class SqliteApplicantSession implements ApplicantStoreTransactionPort {
  constructor(private readonly db: DatabaseSync) {}

  async getProfile(profileId: string): Promise<ApplicantProfile | null> {
    const row = this.db.prepare('SELECT document_json FROM applicant_profiles WHERE id = ?').get(profileId) as Row | undefined;
    return row ? ApplicantProfileSchema.parse(parseJson(row.document_json)) : null;
  }
  async getDefaultProfile(): Promise<ApplicantProfile | null> {
    const row = this.db.prepare('SELECT document_json FROM applicant_profiles WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1').get() as Row | undefined;
    return row ? ApplicantProfileSchema.parse(parseJson(row.document_json)) : null;
  }
  async getProfileRevision(revisionId: string): Promise<ApplicantProfileRevision | null> {
    const row = this.db.prepare('SELECT * FROM applicant_profile_revisions WHERE id = ?').get(revisionId) as Row | undefined;
    return row ? ApplicantProfileRevisionSchema.parse({ id: row.id, profileId: row.profile_id, revisionNumber: Number(row.revision_number), profileVersion: Number(row.profile_version), snapshot: parseJson(row.snapshot_json), contentHash: row.content_hash, createdAt: row.created_at, createdBy: row.created_by }) : null;
  }
  async getLatestProfileRevision(profileId: string): Promise<ApplicantProfileRevision | null> {
    const row = this.db.prepare('SELECT * FROM applicant_profile_revisions WHERE profile_id = ? ORDER BY revision_number DESC LIMIT 1').get(profileId) as Row | undefined;
    return row ? this.getProfileRevision(String(row.id)) : null;
  }
  async getAnswerSet(answerSetId: string): Promise<ApplicationAnswerSet | null> {
    const row = this.db.prepare('SELECT document_json FROM application_answer_sets WHERE id = ?').get(answerSetId) as Row | undefined;
    return row ? ApplicationAnswerSetSchema.parse(parseJson(row.document_json)) : null;
  }
  async getDefaultAnswerSet(): Promise<ApplicationAnswerSet | null> {
    const row = this.db.prepare('SELECT document_json FROM application_answer_sets WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1').get() as Row | undefined;
    return row ? ApplicationAnswerSetSchema.parse(parseJson(row.document_json)) : null;
  }
  async getAnswerSetRevision(revisionId: string): Promise<ApplicationAnswerSetRevision | null> {
    const row = this.db.prepare('SELECT * FROM application_answer_set_revisions WHERE id = ?').get(revisionId) as Row | undefined;
    return row ? ApplicationAnswerSetRevisionSchema.parse({ id: row.id, answerSetId: row.answer_set_id, revisionNumber: Number(row.revision_number), answerSetVersion: Number(row.answer_set_version), snapshot: parseJson(row.snapshot_json), contentHash: row.content_hash, createdAt: row.created_at, createdBy: row.created_by }) : null;
  }
  async getLatestAnswerSetRevision(answerSetId: string): Promise<ApplicationAnswerSetRevision | null> {
    const row = this.db.prepare('SELECT * FROM application_answer_set_revisions WHERE answer_set_id = ? ORDER BY revision_number DESC LIMIT 1').get(answerSetId) as Row | undefined;
    return row ? this.getAnswerSetRevision(String(row.id)) : null;
  }

  async upsertProfile(input: ApplicantProfile, isDefault: boolean): Promise<ApplicantProfile> {
    const profile = ApplicantProfileSchema.parse(input);
    if (isDefault) this.db.prepare('UPDATE applicant_profiles SET is_default = 0 WHERE is_default = 1 AND id <> ?').run(profile.id);
    this.db.prepare(`INSERT INTO applicant_profiles(id,version,document_json,is_default,created_at,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,document_json=excluded.document_json,is_default=excluded.is_default,updated_at=excluded.updated_at`)
      .run(profile.id, profile.version, JSON.stringify(profile), isDefault ? 1 : 0, profile.createdAt, profile.updatedAt);
    return (await this.getProfile(profile.id))!;
  }
  async insertProfileRevision(input: ApplicantProfileRevision): Promise<void> {
    const revision = ApplicantProfileRevisionSchema.parse(input);
    this.db.prepare(`INSERT INTO applicant_profile_revisions(id,profile_id,revision_number,profile_version,snapshot_json,content_hash,created_at,created_by)
      VALUES(?,?,?,?,?,?,?,?)`).run(revision.id, revision.profileId, revision.revisionNumber, revision.profileVersion, JSON.stringify(revision.snapshot), revision.contentHash, revision.createdAt, revision.createdBy);
  }
  async upsertAnswerSet(input: ApplicationAnswerSet, isDefault: boolean): Promise<ApplicationAnswerSet> {
    const set = ApplicationAnswerSetSchema.parse(input);
    if (isDefault) this.db.prepare('UPDATE application_answer_sets SET is_default = 0 WHERE is_default = 1 AND id <> ?').run(set.id);
    this.db.prepare(`INSERT INTO application_answer_sets(id,version,document_json,is_default,created_at,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,document_json=excluded.document_json,is_default=excluded.is_default,updated_at=excluded.updated_at`)
      .run(set.id, set.version, JSON.stringify(set), isDefault ? 1 : 0, set.createdAt, set.updatedAt);
    return (await this.getAnswerSet(set.id))!;
  }
  async insertAnswerSetRevision(input: ApplicationAnswerSetRevision): Promise<void> {
    const revision = ApplicationAnswerSetRevisionSchema.parse(input);
    this.db.prepare(`INSERT INTO application_answer_set_revisions(id,answer_set_id,revision_number,answer_set_version,snapshot_json,content_hash,created_at,created_by)
      VALUES(?,?,?,?,?,?,?,?)`).run(revision.id, revision.answerSetId, revision.revisionNumber, revision.answerSetVersion, JSON.stringify(revision.snapshot), revision.contentHash, revision.createdAt, revision.createdBy);
  }
}

export class SqliteApplicantStore implements ApplicantStorePort {
  private readonly readDb: DatabaseSync;
  private transactionTail: Promise<void> = Promise.resolve();
  constructor(readonly databasePath: string) { this.readDb = openDatabase(databasePath); migrateSqliteDatabase(this.readDb); }
  close(): void { this.readDb.close(); }
  private readSession(): ApplicantStoreReadPort { return new SqliteApplicantSession(this.readDb); }
  getProfile(id: string) { return this.readSession().getProfile(id); }
  getDefaultProfile() { return this.readSession().getDefaultProfile(); }
  getProfileRevision(id: string) { return this.readSession().getProfileRevision(id); }
  getLatestProfileRevision(id: string) { return this.readSession().getLatestProfileRevision(id); }
  getAnswerSet(id: string) { return this.readSession().getAnswerSet(id); }
  getDefaultAnswerSet() { return this.readSession().getDefaultAnswerSet(); }
  getAnswerSetRevision(id: string) { return this.readSession().getAnswerSetRevision(id); }
  getLatestAnswerSetRevision(id: string) { return this.readSession().getLatestAnswerSetRevision(id); }
  async transaction<T>(work: (tx: ApplicantStoreTransactionPort) => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.transactionTail; this.transactionTail = previous.then(() => gate); await previous;
    const db = openDatabase(this.databasePath); db.exec('BEGIN IMMEDIATE');
    try { const result = await work(new SqliteApplicantSession(db)); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
    finally { db.close(); release(); }
  }
}
