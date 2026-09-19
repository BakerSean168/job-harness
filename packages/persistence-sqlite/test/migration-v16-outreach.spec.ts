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

describe('SQLite v16 Job outreach events', () => {
  it('creates the durable recruiter-contact ledger with idempotency and lookup indexes', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-v16-'));
    const db = new DatabaseSync(join(dir, 'career.db'));
    try {
      migrateSqliteDatabase(db);
      expect(Number((db.prepare('PRAGMA user_version').get() as any).user_version)).toBe(SQLITE_SCHEMA_VERSION);
      const columns = (db.prepare('PRAGMA table_info(job_outreach_events)').all() as any[]).map((row) => row.name);
      expect(columns).toEqual(expect.arrayContaining([
        'id', 'job_id', 'listing_id', 'channel', 'type', 'occurred_at', 'actor',
        'resume_profile_id', 'message', 'external_thread_url', 'metadata_json',
        'idempotency_key', 'created_at',
      ]));
      const indexes = (db.prepare('PRAGMA index_list(job_outreach_events)').all() as any[]).map((row) => row.name);
      expect(indexes).toEqual(expect.arrayContaining([
        'job_outreach_events_job_occurred_idx',
        'job_outreach_events_channel_occurred_idx',
        'job_outreach_events_type_occurred_idx',
      ]));
    } finally {
      db.close();
    }
  });
});
