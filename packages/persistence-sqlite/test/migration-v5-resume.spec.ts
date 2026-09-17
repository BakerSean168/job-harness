import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteCareerStore, SqliteResumeStore } from '../src';
import { createCareerApplicationService } from '@job-harness/application';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('SQLite v5 Resume domain migration', () => {
  it('adds Resume domain tables without changing Career compatibility data and remains reopenable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'job-harness-v5-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');

    const careerStore = new SqliteCareerStore(databasePath);
    try {
      const career = createCareerApplicationService(careerStore, { now: () => '2026-09-17T02:00:00.000Z' });
      await career.resumeRegistry.syncResumeProfiles([{
        id: 'legacy-resume', name: 'Legacy Resume', source: 'resume-harness', externalProfileId: 'legacy',
        targetRole: 'Agent', version: 'v1', hash: 'legacy-hash', artifactUri: 'file:///legacy.pdf', updatedAt: '2026-09-17T01:00:00.000Z',
      }]);
      const jobs = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Resume V5 Co', title: 'Agent Engineer', city: 'Hangzhou',
        listings: [{ sourceKind: 'official', url: 'https://example.com/resume-v5', identityKind: 'url', status: 'active' }],
        observedAt: '2026-09-17T01:00:00.000Z',
      }] });
      await career.applications.recordApplication({
        jobId: jobs.items[0]!.jobId!, appliedAt: '2026-09-17T01:30:00.000Z', resumeProfileId: 'legacy-resume',
        idempotencyKey: 'resume-v5-application', actor: 'user',
      });
    } finally { careerStore.close(); }

    const downgrade = new DatabaseSync(databasePath);
    try {
      for (const table of ['resume_artifacts','resume_revisions','resume_profiles','resume_libraries']) downgrade.exec(`DROP TABLE ${table}`);
      downgrade.exec('PRAGMA user_version = 4');
    } finally { downgrade.close(); }

    const migrated = new SqliteResumeStore(databasePath);
    migrated.close();
    const reopened = new SqliteResumeStore(databasePath);
    reopened.close();

    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 6 });
      for (const table of ['resume_libraries','resume_profiles','resume_revisions','resume_artifacts']) {
        expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)).toEqual({ name: table });
        expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
      }
      expect(db.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 1 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM applications').get()).toEqual({ n: 1 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM resume_profile_refs').get()).toEqual({ n: 1 });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    } finally { db.close(); }
  });
});
