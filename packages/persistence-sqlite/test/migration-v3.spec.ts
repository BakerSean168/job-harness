import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('SQLite v3 Saved Views migration', () => {
  it('adds saved_views to a v2 database without changing Career data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'job-harness-v3-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');

    const store = new SqliteCareerStore(databasePath);
    try {
      const career = createCareerApplicationService(store, { now: () => '2026-09-16T12:00:00.000Z' });
      await career.resumeRegistry.syncResumeProfiles([{
        id: 'resume-v3', name: 'V3 Resume', source: 'resume-harness', externalProfileId: 'v3',
        targetRole: 'Agent', version: 'v1', hash: 'hash-v3', artifactUri: 'file:///v3.pdf', updatedAt: '2026-09-16T08:00:00.000Z',
      }]);
      const jobs = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'V3 Co', title: 'Agent Engineer', city: 'Hangzhou',
        listings: [{ sourceKind: 'official', url: 'https://example.com/v3', identityKind: 'url', status: 'active' }],
        observedAt: '2026-09-16T08:00:00.000Z',
      }] });
      await career.applications.recordApplication({
        jobId: jobs.items[0]!.jobId!, appliedAt: '2026-09-16T09:00:00.000Z', resumeProfileId: 'resume-v3',
        idempotencyKey: 'v3-application', actor: 'user',
      });
    } finally {
      store.close();
    }

    const downgrade = new DatabaseSync(databasePath);
    try {
      downgrade.exec('DROP TABLE saved_views');
      downgrade.exec('PRAGMA user_version = 2');
      expect(downgrade.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 1 });
      expect(downgrade.prepare('SELECT COUNT(*) AS n FROM applications').get()).toEqual({ n: 1 });
      expect(downgrade.prepare('SELECT COUNT(*) AS n FROM resume_profile_refs').get()).toEqual({ n: 1 });
    } finally {
      downgrade.close();
    }

    const migrated = new SqliteCareerStore(databasePath);
    migrated.close();

    // A fully migrated v4 database must remain reopenable on every process restart.
    const reopened = new SqliteCareerStore(databasePath);
    reopened.close();

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(verify.prepare('PRAGMA user_version').get()).toEqual({ user_version: 5 });
      expect(verify.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='saved_views'").get()).toEqual({ name: 'saved_views' });
      expect(verify.prepare('SELECT COUNT(*) AS n FROM saved_views').get()).toEqual({ n: 0 });
      expect(verify.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 1 });
      expect(verify.prepare('SELECT COUNT(*) AS n FROM applications').get()).toEqual({ n: 1 });
      expect(verify.prepare('SELECT COUNT(*) AS n FROM resume_profile_refs').get()).toEqual({ n: 1 });
      expect(verify.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      verify.close();
    }
  });
});
