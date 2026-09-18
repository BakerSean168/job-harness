import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateSqliteDatabase, SQLITE_SCHEMA_VERSION } from '../src/schema';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });

describe('SQLite v12 email application package migration', () => {
  it('creates the immutable email package table and advances user_version to 12', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-v12-email-'));
    const db = new DatabaseSync(join(dir, 'career.db'));
    try {
      migrateSqliteDatabase(db);
      expect(SQLITE_SCHEMA_VERSION).toBe(12);
      const version = Number((db.prepare('PRAGMA user_version').get() as Record<string, unknown>).user_version);
      expect(version).toBe(12);
      const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='email_application_packages'").get() as Record<string, unknown> | undefined;
      expect(String(row?.sql ?? '')).toContain('draft_hash TEXT NOT NULL');
      expect(String(row?.sql ?? '')).toContain('intent_id TEXT NOT NULL UNIQUE');
      expect(String(row?.sql ?? '')).toContain('resume_artifact_id TEXT NOT NULL');
    } finally { db.close(); }
  });
});
