import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
  ResumeArtifactSchema,
  ResumeLibrarySchema,
  ResumeProfileSchema,
  ResumeRevisionSchema,
  type ResumeArtifact,
  type ResumeLibrary,
  type ResumeProfile,
  type ResumeRevision,
} from '@job-harness/resume-contracts';
import type {
  ResumeProfileListInput,
  ResumeStorePort,
  ResumeStoreReadPort,
  ResumeStoreTransactionPort,
} from '@job-harness/resume-application';
import { migrateSqliteDatabase } from './schema';

type Row = Record<string, unknown>;

function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

function json(value: unknown): unknown {
  return JSON.parse(String(value));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

class SqliteResumeSession implements ResumeStoreTransactionPort {
  constructor(private readonly db: DatabaseSync) {}

  async getLibrary(libraryId: string): Promise<ResumeLibrary | null> {
    const row = this.db.prepare('SELECT document_json FROM resume_libraries WHERE id = ?').get(libraryId) as Row | undefined;
    return row ? ResumeLibrarySchema.parse(json(row.document_json)) : null;
  }

  async listProfiles(input: ResumeProfileListInput = {}): Promise<readonly ResumeProfile[]> {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (input.libraryId) { where.push('library_id = ?'); params.push(input.libraryId); }
    if (!input.includeArchived) where.push('archived_at IS NULL');
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT profile_json FROM resume_profiles${clause} ORDER BY updated_at DESC, id`).all(...params) as Row[];
    return rows.map((row) => ResumeProfileSchema.parse(json(row.profile_json)));
  }

  async getProfile(profileId: string): Promise<ResumeProfile | null> {
    const row = this.db.prepare('SELECT profile_json FROM resume_profiles WHERE id = ?').get(profileId) as Row | undefined;
    return row ? ResumeProfileSchema.parse(json(row.profile_json)) : null;
  }

  async listRevisions(profileId: string): Promise<readonly ResumeRevision[]> {
    const rows = this.db.prepare('SELECT snapshot_json, id, profile_id, revision_number, library_id, library_version, profile_version, content_hash, created_at, created_by, note FROM resume_revisions WHERE profile_id = ? ORDER BY revision_number DESC').all(profileId) as Row[];
    return rows.map((row) => this.revisionFromRow(row));
  }

  async getRevision(revisionId: string): Promise<ResumeRevision | null> {
    const row = this.db.prepare('SELECT snapshot_json, id, profile_id, revision_number, library_id, library_version, profile_version, content_hash, created_at, created_by, note FROM resume_revisions WHERE id = ?').get(revisionId) as Row | undefined;
    return row ? this.revisionFromRow(row) : null;
  }

  private revisionFromRow(row: Row): ResumeRevision {
    return ResumeRevisionSchema.parse({
      id: row.id,
      profileId: row.profile_id,
      revisionNumber: Number(row.revision_number),
      libraryId: row.library_id,
      libraryVersion: Number(row.library_version),
      profileVersion: Number(row.profile_version),
      resolvedDocumentSnapshot: json(row.snapshot_json),
      contentHash: row.content_hash,
      createdAt: row.created_at,
      createdBy: row.created_by,
      note: row.note,
    });
  }

  async listArtifacts(revisionId: string): Promise<readonly ResumeArtifact[]> {
    const rows = this.db.prepare('SELECT * FROM resume_artifacts WHERE revision_id = ? ORDER BY created_at, id').all(revisionId) as Row[];
    return rows.map((row) => this.artifactFromRow(row));
  }

  async getArtifact(artifactId: string): Promise<ResumeArtifact | null> {
    const row = this.db.prepare('SELECT * FROM resume_artifacts WHERE id = ?').get(artifactId) as Row | undefined;
    return row ? this.artifactFromRow(row) : null;
  }

  private artifactFromRow(row: Row): ResumeArtifact {
    return ResumeArtifactSchema.parse({
      id: row.id,
      revisionId: row.revision_id,
      kind: row.kind,
      mimeType: row.mime_type,
      storageUri: row.storage_uri,
      sha256: row.sha256,
      byteSize: Number(row.byte_size),
      rendererId: row.renderer_id,
      rendererVersion: row.renderer_version,
      createdAt: row.created_at,
    });
  }

  async upsertLibrary(input: ResumeLibrary): Promise<ResumeLibrary> {
    const library = ResumeLibrarySchema.parse(input);
    const existing = await this.getLibrary(library.id);
    if (existing) {
      if (existing.version > library.version) throw new Error(`Cannot downgrade ResumeLibrary '${library.id}' from v${existing.version} to v${library.version}`);
      if (existing.version === library.version && !sameJson(existing, library)) throw new Error(`ResumeLibrary '${library.id}' v${library.version} content conflict`);
    }
    this.db.prepare(`INSERT INTO resume_libraries(id,schema_version,version,document_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET schema_version=excluded.schema_version,version=excluded.version,document_json=excluded.document_json,updated_at=excluded.updated_at`)
      .run(library.id, library.schemaVersion, library.version, JSON.stringify(library), library.createdAt, library.updatedAt);
    return (await this.getLibrary(library.id))!;
  }

  async upsertProfile(input: ResumeProfile): Promise<ResumeProfile> {
    const profile = ResumeProfileSchema.parse(input);
    const library = await this.getLibrary(profile.libraryId);
    if (!library) throw new Error(`ResumeLibrary '${profile.libraryId}' not found for ResumeProfile '${profile.id}'`);
    const existing = await this.getProfile(profile.id);
    if (existing) {
      if (existing.version > profile.version) throw new Error(`Cannot downgrade ResumeProfile '${profile.id}' from v${existing.version} to v${profile.version}`);
      if (existing.version === profile.version && !sameJson(existing, profile)) throw new Error(`ResumeProfile '${profile.id}' v${profile.version} content conflict`);
    }
    this.db.prepare(`INSERT INTO resume_profiles(id,library_id,version,locale,template_id,profile_json,created_at,updated_at,archived_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET library_id=excluded.library_id,version=excluded.version,locale=excluded.locale,template_id=excluded.template_id,profile_json=excluded.profile_json,updated_at=excluded.updated_at,archived_at=excluded.archived_at`)
      .run(profile.id, profile.libraryId, profile.version, profile.locale, profile.templateId, JSON.stringify(profile), profile.createdAt, profile.updatedAt, profile.archivedAt);
    return (await this.getProfile(profile.id))!;
  }

  async insertRevision(input: ResumeRevision): Promise<void> {
    const revision = ResumeRevisionSchema.parse(input);
    this.db.prepare(`INSERT INTO resume_revisions(id,profile_id,revision_number,library_id,library_version,profile_version,snapshot_json,content_hash,created_at,created_by,note)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      revision.id, revision.profileId, revision.revisionNumber, revision.libraryId, revision.libraryVersion,
      revision.profileVersion, JSON.stringify(revision.resolvedDocumentSnapshot), revision.contentHash,
      revision.createdAt, revision.createdBy, revision.note,
    );
  }

  async insertArtifact(input: ResumeArtifact): Promise<void> {
    const artifact = ResumeArtifactSchema.parse(input);
    this.db.prepare(`INSERT INTO resume_artifacts(id,revision_id,kind,mime_type,storage_uri,sha256,byte_size,renderer_id,renderer_version,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      artifact.id, artifact.revisionId, artifact.kind, artifact.mimeType, artifact.storageUri,
      artifact.sha256, artifact.byteSize, artifact.rendererId, artifact.rendererVersion, artifact.createdAt,
    );
  }
}

export class SqliteResumeStore implements ResumeStorePort {
  private readonly readDb: DatabaseSync;
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(readonly databasePath: string) {
    this.readDb = openDatabase(databasePath);
    migrateSqliteDatabase(this.readDb);
  }

  close(): void { this.readDb.close(); }

  private readSession(): ResumeStoreReadPort { return new SqliteResumeSession(this.readDb); }
  getLibrary(libraryId: string) { return this.readSession().getLibrary(libraryId); }
  listProfiles(input?: ResumeProfileListInput) { return this.readSession().listProfiles(input); }
  getProfile(profileId: string) { return this.readSession().getProfile(profileId); }
  listRevisions(profileId: string) { return this.readSession().listRevisions(profileId); }
  getRevision(revisionId: string) { return this.readSession().getRevision(revisionId); }
  listArtifacts(revisionId: string) { return this.readSession().listArtifacts(revisionId); }
  getArtifact(artifactId: string) { return this.readSession().getArtifact(artifactId); }

  async transaction<T>(work: (tx: ResumeStoreTransactionPort) => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.transactionTail;
    this.transactionTail = previous.then(() => gate);
    await previous;
    const db = openDatabase(this.databasePath);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = await work(new SqliteResumeSession(db));
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
}
