import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateSqliteDatabase, SQLITE_SCHEMA_VERSION } from '../src/schema';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });

describe('SQLite v13 email send authorization migration', () => {
  it('creates short-lived send authorization storage and one-active-per-package guard', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-v13-email-auth-'));
    const db = new DatabaseSync(join(dir, 'career.db'));
    try {
      migrateSqliteDatabase(db);
      expect(SQLITE_SCHEMA_VERSION).toBe(13);
      expect(Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)).toBe(13);
      const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='email_send_authorizations'").get() as { sql?: string } | undefined;
      expect(String(table?.sql ?? '')).toContain("status TEXT NOT NULL CHECK(status IN ('active','consumed','revoked'))");
      expect(String(table?.sql ?? '')).toContain('request_hash TEXT NOT NULL');
      const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='email_send_authorizations'").all() as Array<{ name: string }>).map((row) => row.name);
      expect(indexes).toContain('email_send_authorizations_status_expiry_idx');
      expect(indexes).toContain('email_send_authorizations_one_active_per_package_idx');
    } finally { db.close(); }
  });
});
