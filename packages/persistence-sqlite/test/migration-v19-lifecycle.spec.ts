import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { runCampaignLifecycleSweep, SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true }))); });

describe('SQLite v19 listing lifecycle migration', () => {
  it('upgrades legacy v18 rows losslessly; dry-run refuses to mutate a pre-v19 database', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'jh-migrate-v19-'));
    dirs.push(folder);
    const databasePath = join(folder, 'career.db');
    const store = new SqliteCareerStore(databasePath);
    const career = createCareerApplicationService(store, { now: () => '2026-10-01T00:00:00Z' });
    await career.campaigns.upsertCampaign({
      id: 'grad', name: 'Graduate jobs', targetRoles: ['Frontend'],
      cities: [], graduationYears: [2026], experience: [], keywords: [], exclusions: [],
      sources: ['official'], resumeProfileIds: [], status: 'active',
    });
    const run = await career.discovery.beginDiscoveryRun({
      campaignId: 'grad', executor: 'manual', contextSnapshot: {},
      idempotencyKey: 'init-legacy', startedAt: '2026-10-01T00:00:00Z',
    });
    const result = await career.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Legacy Corp', title: 'Frontend Developer', city: 'Hangzhou',
      observedAt: '2026-10-01T00:00:00Z', discoveryRunId: run.id,
      listings: [{ sourceKind: 'official', identityKind: 'url',
        url: 'https://example.com/jobs/legacy', status: 'active' }],
    }] });
    const id = result.items[0]!.jobId!;
    store.close();
    const db = new DatabaseSync(databasePath);
    try {
      for (const column of ['closing_policy','application_deadline_json','last_verified_at','last_verified_open_at','closure_reason']) {
        db.exec('ALTER TABLE job_listings DROP COLUMN ' + column);
      }
      for (const column of ['verification_kind','evidence_url','verification_note']) {
        db.exec('ALTER TABLE job_observations DROP COLUMN ' + column);
      }
      db.exec('DROP TABLE campaign_job_state_events');
      db.exec('DROP TABLE campaign_job_states');
      db.exec('PRAGMA user_version = 18');
      expect(() => runCampaignLifecycleSweep({
        databasePath, campaignId: 'grad', asOf: '2026-10-20T00:00:00Z',
      })).toThrow(/requires SQLite schema 19/);
      expect(Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)).toBe(18);
    } finally {
      db.close();
    }
    const migrated = new SqliteCareerStore(databasePath);
    try {
      const job = await migrated.getJob(id);
      expect(job?.listings[0]).toMatchObject({
        sourceKind: 'official', status: 'active', closingPolicy: 'unknown',
        applicationDeadline: null, lastVerifiedAt: null,
      });
      expect((await migrated.getJobDetailView(id))?.observations).toHaveLength(1);
      expect((await migrated.searchJobs({ campaignId: 'grad' })).total).toBe(1);
      expect(runCampaignLifecycleSweep({
        databasePath, campaignId: 'grad', asOf: '2026-10-20T00:00:00Z',
      })).toMatchObject({ archived: 0, wouldArchive: 0, retainedUnverified: 1 });
    } finally {
      migrated.close();
    }
  });
});
