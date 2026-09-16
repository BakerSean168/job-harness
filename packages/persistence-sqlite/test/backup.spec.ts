import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteBackup } from '../src';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('SQLite online backup', () => {
  it('captures committed WAL data into a standalone consistent database', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'job-harness-backup-'));
    dirs.push(dir);
    const source = join(dir, 'source.db');
    const destination = join(dir, 'backup.db');
    const writer = new DatabaseSync(source);
    try {
      writer.exec('PRAGMA journal_mode = WAL');
      writer.exec('CREATE TABLE sample(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
      writer.prepare('INSERT INTO sample(value) VALUES(?)').run('first');
      writer.prepare('INSERT INTO sample(value) VALUES(?)').run('second');
      createSqliteBackup(source, destination);
    } finally {
      writer.close();
    }

    const backup = new DatabaseSync(destination, { readOnly: true });
    try {
      expect(backup.prepare('SELECT value FROM sample ORDER BY id').all()).toEqual([
        { value: 'first' },
        { value: 'second' },
      ]);
      expect(backup.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    } finally {
      backup.close();
    }
    expect(() => createSqliteBackup(source, destination)).toThrow(/already exists/);
  });
});
