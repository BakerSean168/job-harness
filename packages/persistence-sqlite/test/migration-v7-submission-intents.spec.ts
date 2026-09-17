import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteCareerStore, SQLITE_SCHEMA_VERSION } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe('SQLite v7 SubmissionIntent migration', () => {
  it('adds durable external-submission intent/outbox state without disturbing existing career data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-v7-intents-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');
    const initial = new SqliteCareerStore(databasePath);
    initial.close();

    const downgrade = new DatabaseSync(databasePath);
    try {
      downgrade.exec('DROP TABLE submission_intents');
      downgrade.exec('PRAGMA user_version = 6');
    } finally { downgrade.close(); }

    const migrated = new SqliteCareerStore(databasePath);
    migrated.close();

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(verify.prepare('PRAGMA user_version').get()).toEqual({ user_version: SQLITE_SCHEMA_VERSION });
      expect(verify.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='submission_intents'").get()).toEqual({ name: 'submission_intents' });
      expect(verify.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='submission_intents_status_updated_idx'").get()).toEqual({ name: 'submission_intents_status_updated_idx' });
      expect((verify.prepare('PRAGMA table_info(submission_intents)').all() as Array<Record<string, unknown>>).map((row) => row.name)).toContain('executor_session_id');
      expect(verify.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(verify.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    } finally { verify.close(); }
  });
});
