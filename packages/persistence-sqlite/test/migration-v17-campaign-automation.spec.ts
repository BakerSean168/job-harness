import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CampaignAutomationPolicySchema } from '@job-harness/contracts';
import { migrateSqliteDatabase, SQLITE_SCHEMA_VERSION } from '../src/schema';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });

describe('SQLite v17 Campaign automation policy', () => {
  it('adds automation_json and preserves safe defaults for existing Campaigns', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-v17-'));
    const db = new DatabaseSync(join(dir, 'career.db'));
    try {
      migrateSqliteDatabase(db);
      expect(Number((db.prepare('PRAGMA user_version').get() as any).user_version)).toBe(SQLITE_SCHEMA_VERSION);
      const columns = (db.prepare('PRAGMA table_info(campaigns)').all() as any[]).map((row) => row.name);
      expect(columns).toContain('automation_json');
      db.prepare(`INSERT INTO campaigns(id,name,target_roles_json,cities_json,graduation_years_json,experience_json,education_json,keywords_json,exclusions_json,sources_json,resume_profile_ids_json,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('c1','AI','["Agent"]','[]','[2026]','["经验不限"]','["本科"]','[]','[]','[]','[]','active','2026-09-20T00:00:00.000Z','2026-09-20T00:00:00.000Z');
      const row = db.prepare('SELECT automation_json FROM campaigns WHERE id=?').get('c1') as any;
      expect(row.automation_json).toBe('{}');
      expect(CampaignAutomationPolicySchema.parse(JSON.parse(row.automation_json))).toEqual({
        collection: { enabled: true },
        outreach: { enabled: true, autoStartEnabled: false, greetingEnabled: true, recruiterInboxEnabled: true, resumeFollowupEnabled: true, maxExternalEffectsPerRun: 20 },
        officialSite: { prepareEnabled: true, fillEnabled: true, submitEnabled: false, preferredResumeProfileId: null },
        email: { draftEnabled: true, sendEnabled: false, preferredResumeProfileId: null },
      });
    } finally { db.close(); }
  });
});
