import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateSqliteDatabase, SQLITE_SCHEMA_VERSION } from '../src/schema';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });

describe('SQLite v15 Campaign education constraint', () => {
  it('adds education_json without changing existing Campaign semantics', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-v15-'));
    const db = new DatabaseSync(join(dir, 'career.db'));
    try {
      migrateSqliteDatabase(db);
      expect(Number((db.prepare('PRAGMA user_version').get() as any).user_version)).toBe(SQLITE_SCHEMA_VERSION);
      const columns = (db.prepare('PRAGMA table_info(campaigns)').all() as any[]).map((row) => row.name);
      expect(columns).toContain('education_json');
      db.prepare(`INSERT INTO campaigns(id,name,target_roles_json,cities_json,graduation_years_json,experience_json,keywords_json,exclusions_json,sources_json,resume_profile_ids_json,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('c1','AI','["Agent"]','[]','[2026]','["经验不限"]','[]','[]','[]','[]','active','2026-09-18T00:00:00.000Z','2026-09-18T00:00:00.000Z');
      expect((db.prepare('SELECT education_json FROM campaigns WHERE id=?').get('c1') as any).education_json).toBe('[]');
    } finally { db.close(); }
  });
});
