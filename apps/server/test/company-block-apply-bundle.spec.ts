import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '@job-harness/persistence-sqlite';
import { createApplyBundleFactory } from '../src/apply-bundle';

let folder: string | null = null;
afterEach(async () => { if (folder) await rm(folder, { force: true, recursive: true }); folder = null; });

describe('Apply bundle employer exclusion', () => {
  it('rejects a pre-existing planned intent when the employer is blacklisted before dispatch', async () => {
    folder = await mkdtemp(join(tmpdir(), 'jh-apply-block-'));
    const store = new SqliteCareerStore(join(folder, 'career.db'));
    try {
      const career = createCareerApplicationService(store, { now: () => '2026-10-15T00:00:00Z' });
      const created = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: '外企德科数字技术有限公司', title: 'Frontend Developer',
        city: 'Shanghai', observedAt: '2026-10-15T00:00:00Z',
        listings: [{ sourceKind: 'official', identityKind: 'url', url: 'https://example.com/jobs/adecco', status: 'active' }],
      }] });
      const jobId = created.items[0]!.jobId!;
      const planned = await career.submissionIntents.prepare({ jobId, executor: 'manual', idempotencyKey: 'past-intent' });
      await career.companyBlocklist.upsert({
        pattern: '外企德科', matchMode: 'contains', category: 'hr_agency', active: true,
      });
      const factory = createApplyBundleFactory(career, {
        getRevision: async () => null,
        getArtifact: async () => null,
      });
      await expect(factory.create({
        intentId: planned.id, attemptId: 'attempt-blocked',
        policySnapshot: {}, createdAt: '2026-10-15T00:01:00Z',
      })).rejects.toThrow(/company-blocked/);
    } finally { store.close(); }
  });
});
