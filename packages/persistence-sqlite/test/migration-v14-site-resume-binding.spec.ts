import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateSqliteDatabase, SQLITE_SCHEMA_VERSION } from '../src/schema';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });

describe('SQLite v14 site resume binding migration', () => {
  it('creates audited site-managed resume bindings with one active mapping per site/agent/profile', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-v14-site-resume-'));
    const db = new DatabaseSync(join(dir, 'career.db'));
    try {
      migrateSqliteDatabase(db);
      expect(SQLITE_SCHEMA_VERSION).toBe(15);
      expect(Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)).toBe(SQLITE_SCHEMA_VERSION);
      const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='site_resume_bindings'").get() as { sql?: string } | undefined;
      expect(String(table?.sql ?? '')).toContain("site_family TEXT NOT NULL CHECK(site_family IN ('zhilian','liepin'))");
      expect(String(table?.sql ?? '')).toContain("assurance TEXT NOT NULL CHECK(assurance='user-confirmed-label')");
      const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='site_resume_bindings'").all() as Array<{ name: string }>).map((row) => row.name);
      expect(indexes).toContain('site_resume_bindings_lookup_idx');
      expect(indexes).toContain('site_resume_bindings_one_active_profile_idx');
      expect(indexes).toContain('site_resume_bindings_one_active_label_idx');
      expect(indexes).toContain('site_resume_bindings_revoke_idempotency_idx');
    } finally { db.close(); }
  });
});
