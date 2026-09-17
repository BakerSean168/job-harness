import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteCareerStore, SQLITE_SCHEMA_VERSION } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe('SQLite v10 submit-safety migration', () => {
  it('adds immutable review snapshots and short-lived submit authorizations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-v10-submit-safety-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');
    const store = new SqliteCareerStore(databasePath);
    store.close();

    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: SQLITE_SCHEMA_VERSION });
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('execution_review_snapshots','submit_authorizations') ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
      expect(tables).toEqual(['execution_review_snapshots','submit_authorizations']);
      const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('execution_review_snapshots','submit_authorizations') ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
      expect(indexes).toContain('execution_review_snapshots_attempt_idx');
      expect(indexes).toContain('submit_authorizations_one_active_per_attempt_idx');
      expect(indexes).toContain('submit_authorizations_expiry_idx');
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    } finally { db.close(); }
  });
});
