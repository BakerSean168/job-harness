import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteCareerStore, SQLITE_SCHEMA_VERSION } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe('SQLite v9 browser session handoff migration', () => {
  it('adds an explicit sanitized browser handoff projection to execution attempts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-v9-handoff-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');
    const current = new SqliteCareerStore(databasePath);
    current.close();

    const downgrade = new DatabaseSync(databasePath);
    try {
      downgrade.exec('ALTER TABLE execution_attempts DROP COLUMN browser_session_handoff_json');
      downgrade.exec('PRAGMA user_version = 8');
    } finally { downgrade.close(); }

    const migrated = new SqliteCareerStore(databasePath);
    migrated.close();

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(verify.prepare('PRAGMA user_version').get()).toEqual({ user_version: SQLITE_SCHEMA_VERSION });
      const columns = (verify.prepare('PRAGMA table_info(execution_attempts)').all() as Array<Record<string, unknown>>).map((row) => row.name);
      expect(columns).toContain('browser_session_handoff_json');
      expect(verify.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(verify.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    } finally { verify.close(); }
  });
});
