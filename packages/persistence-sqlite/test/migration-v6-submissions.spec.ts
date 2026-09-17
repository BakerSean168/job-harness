import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe('SQLite v6 ApplicationSubmission migration', () => {
  it('backfills historical submission events conservatively without inventing per-submission Resume evidence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-v6-submissions-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');
    const store = new SqliteCareerStore(databasePath);
    try {
      const career = createCareerApplicationService(store, { now: () => '2026-09-17T04:00:00.000Z' });
      await career.resumeRegistry.syncResumeProfiles([{
        id: 'resume-agent', name: 'Agent Resume', source: 'resume-harness', externalProfileId: 'agent', targetRole: 'Agent', version: 'legacy', hash: null, artifactUri: null, updatedAt: '2026-09-17T03:00:00.000Z',
      }]);
      const inserted = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Migration Co', title: 'Agent Engineer', city: 'Hangzhou',
        listings: [{ sourceKind: 'official', url: 'https://example.invalid/migration', identityKind: 'url', status: 'active' }],
        observedAt: '2026-09-17T03:00:00.000Z',
      }] });
      const jobId = inserted.items[0]!.jobId!;
      await career.applications.recordApplication({
        jobId, appliedAt: '2026-09-17T03:10:00.000Z', resumeProfileId: 'resume-agent', idempotencyKey: 'legacy-first', actor: 'user', note: 'official submit',
      });
      await career.applications.recordApplication({
        jobId, appliedAt: '2026-09-17T03:20:00.000Z', resumeProfileId: 'resume-agent', idempotencyKey: 'legacy-second', actor: 'user', note: 'referral resubmit',
      });
    } finally { store.close(); }

    const downgrade = new DatabaseSync(databasePath);
    try {
      downgrade.exec('DROP TABLE application_submissions');
      downgrade.exec('PRAGMA user_version = 5');
    } finally { downgrade.close(); }

    const migrated = new SqliteCareerStore(databasePath);
    migrated.close();

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(verify.prepare('PRAGMA user_version').get()).toEqual({ user_version: 8 });
      const rows = verify.prepare('SELECT * FROM application_submissions ORDER BY submitted_at, id').all() as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ idempotency_key: 'legacy-first', resume_profile_id: 'resume-agent', resume_revision_id: null, resume_artifact_id: null, listing_id: null, channel: null });
      expect(rows[1]).toMatchObject({ idempotency_key: 'legacy-second', resume_profile_id: null, resume_revision_id: null, resume_artifact_id: null, listing_id: null, channel: null });
      expect(verify.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(verify.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    } finally { verify.close(); }
  });
});
