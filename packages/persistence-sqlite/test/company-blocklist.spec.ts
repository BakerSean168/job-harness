import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

let folder: string | null = null;
afterEach(async () => { if (folder) await rm(folder, { recursive: true, force: true }); folder = null; });

describe('global company blacklist persisted policy', () => {
  it('filters old jobs, rejects fresh discovery and planned submissions, preserves application history, supports re-enable', async () => {
    folder = await mkdtemp(join(tmpdir(), 'jh-company-block-'));
    const store = new SqliteCareerStore(join(folder, 'career.db'));
    const career = createCareerApplicationService(store, { now: () => '2026-10-15T10:00:00Z' });
    const source = (companyName: string, suffix: string) => ({
      companyName, title: 'Frontend Developer', city: 'Hangzhou', observedAt: '2026-10-15T10:00:00Z',
      listings: [{ sourceKind: 'official' as const, identityKind: 'url' as const,
        url: 'https://example.com/jobs/' + suffix, status: 'active' as const }],
    });
    try {
      const inserted = await career.jobs.upsertJobsBatch({ jobs: [
        source('外企德科数字技术有限公司', 'a'),
        source('星德科包装技术(杭州)有限公司', 'b'),
        source('普通自研科技有限公司', 'c'),
      ] });
      const blockedId = inserted.items[0]!.jobId!;
      const allowedId = inserted.items[1]!.jobId!;
      const prior = await career.submissionIntents.prepare({
        jobId: blockedId, executor: 'manual', idempotencyKey: 'before-rule',
      });
      const application = await career.applications.recordApplication({
        jobId: blockedId, actor: 'user', idempotencyKey: 'history', appliedAt: '2026-10-14T08:00:00Z',
      });
      const rule = await career.companyBlocklist.upsert({
        pattern: '外企德科', matchMode: 'contains', category: 'hr_agency',
        note: 'personal preference', active: true,
      });
      expect((await career.companyBlocklist.list())).toHaveLength(1);
      expect((await career.jobs.searchJobs({})).items.some((x) => x.id === blockedId)).toBe(false);
      const all = await career.workspace.searchJobListItems({ includeBlockedCompanies: true });
      expect(all.items.find((x) => x.jobId === blockedId)?.blockedCompany).toBe(true);
      expect(all.items.find((x) => x.jobId === allowedId)?.blockedCompany).toBe(false);
      await expect(career.submissionIntents.prepare({
        jobId: blockedId, executor: 'manual', idempotencyKey: 'after-rule',
      })).rejects.toThrow(/company-blocked/);
      await expect(career.submissionIntents.begin({
        intentId: prior.id, occurredAt: '2026-10-15T10:01:00Z',
      })).rejects.toThrow(/company-blocked/);
      const newlyBlocked = await career.jobs.upsertJobsBatch({ jobs: [source('浙江外企德科人力资源服务有限公司', 'd')] });
      expect(newlyBlocked.items[0]).toMatchObject({ status: 'rejected', jobId: null });
      const unknown = await career.jobs.upsertJobsBatch({ jobs: [source('星德科包装技术(杭州)有限公司', 'e')] });
      expect(unknown.items[0]?.status).not.toBe('rejected');
      expect((await career.applications.getApplication(application.application.id))?.application.id).toBe(application.application.id);
      await career.companyBlocklist.upsert({
        id: rule.id, pattern: rule.pattern, matchMode: rule.matchMode, category: rule.category,
        note: rule.note, active: false,
      });
      expect((await career.jobs.searchJobs({})).items.some((x) => x.id === blockedId)).toBe(true);
      await career.companyBlocklist.delete(rule.id);
      expect((await career.companyBlocklist.list())).toHaveLength(0);
    } finally { store.close(); }
  });
});
