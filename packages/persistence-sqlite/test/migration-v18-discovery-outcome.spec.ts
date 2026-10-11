import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateSqliteDatabase, SQLITE_SCHEMA_VERSION } from '../src/schema';

let dir: string | null = null;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe('SQLite v18 DiscoveryRun outcome migration', () => {
  it('classifies historical completed runs as succeeded and open runs as running', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-v18-discovery-'));
    const path = join(dir, 'career.db');
    const db = new DatabaseSync(path);
    try {
      db.exec(`
        CREATE TABLE discovery_runs (
          id TEXT PRIMARY KEY,
          campaign_id TEXT,
          executor TEXT NOT NULL,
          context_snapshot_json TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          candidate_count INTEGER NOT NULL DEFAULT 0,
          inserted_count INTEGER NOT NULL DEFAULT 0,
          duplicate_count INTEGER NOT NULL DEFAULT 0,
          rejected_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO discovery_runs VALUES
          ('run-complete', NULL, 'manual', '{}', '2026-09-20T08:00:00.000Z', '2026-09-20T08:05:00.000Z', 5, 3, 2, 0),
          ('run-open', NULL, 'manual', '{}', '2026-09-20T09:00:00.000Z', NULL, 0, 0, 0, 0);
        PRAGMA user_version = 17;
      `);

      migrateSqliteDatabase(db);
      expect(Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)).toBe(SQLITE_SCHEMA_VERSION);

      const complete = db.prepare('SELECT status,failure_code,failure_reason FROM discovery_runs WHERE id=?').get('run-complete') as Record<string, unknown>;
      expect(complete).toMatchObject({ status: 'succeeded', failure_code: null, failure_reason: null });

      const open = db.prepare('SELECT status,failure_code,failure_reason FROM discovery_runs WHERE id=?').get('run-open') as Record<string, unknown>;
      expect(open).toMatchObject({ status: 'running', failure_code: null, failure_reason: null });

      const columns = (db.prepare('PRAGMA table_info(discovery_runs)').all() as Array<{ name: string }>).map((row) => row.name);
      expect(columns).toEqual(expect.arrayContaining(['status', 'failure_code', 'failure_reason']));

      expect(() => migrateSqliteDatabase(db)).not.toThrow();
    } finally {
      db.close();
    }
  });
});
