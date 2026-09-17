import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteCareerStore, SQLITE_SCHEMA_VERSION } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe('SQLite v8 Apply Executor control-plane migration', () => {
  it('adds executor registrations, leased attempts and append-oriented events', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-v8-apply-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');
    const initial = new SqliteCareerStore(databasePath);
    initial.close();

    const downgrade = new DatabaseSync(databasePath);
    try {
      downgrade.exec('DROP TABLE execution_events');
      downgrade.exec('DROP TABLE execution_attempts');
      downgrade.exec('DROP TABLE executor_registrations');
      downgrade.exec('PRAGMA user_version = 7');
    } finally { downgrade.close(); }

    const migrated = new SqliteCareerStore(databasePath);
    migrated.close();

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(verify.prepare('PRAGMA user_version').get()).toEqual({ user_version: SQLITE_SCHEMA_VERSION });
      for (const table of ['executor_registrations', 'execution_attempts', 'execution_events']) {
        expect(verify.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)).toEqual({ name: table });
      }
      expect(verify.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='execution_attempts_one_active_per_intent_idx'").get())
        .toEqual({ name: 'execution_attempts_one_active_per_intent_idx' });
      const attemptColumns = (verify.prepare('PRAGMA table_info(execution_attempts)').all() as Array<Record<string, unknown>>).map((row) => row.name);
      expect(attemptColumns).toContain('lease_token_hash');
      expect(attemptColumns).toContain('bundle_hash');
      expect(attemptColumns).toContain('dispatch_request_hash');
      expect(verify.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(verify.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    } finally { verify.close(); }
  });
});
