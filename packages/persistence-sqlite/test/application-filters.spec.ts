import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

const t0 = '2026-09-16T08:00:00.000Z';
const t1 = '2026-09-16T09:00:00.000Z';
const t2 = '2026-09-16T10:00:00.000Z';
const t3 = '2026-09-16T11:00:00.000Z';
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('application workspace filters', () => {
  it('applies campaign, resume, date and terminal filters before pagination', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'job-harness-application-filters-'));
    dirs.push(dir);
    const store = new SqliteCareerStore(join(dir, 'career.db'));
    try {
      const career = createCareerApplicationService(store, { now: () => t3 });
      await career.resumeRegistry.syncResumeProfiles([
        { id: 'resume-a', name: 'Agent', source: 'resume-harness', externalProfileId: 'a', targetRole: 'Agent', version: 'v1', hash: 'a', artifactUri: 'file:///a.pdf', updatedAt: t0 },
        { id: 'resume-b', name: 'Fullstack', source: 'resume-harness', externalProfileId: 'b', targetRole: 'Fullstack', version: 'v1', hash: 'b', artifactUri: 'file:///b.pdf', updatedAt: t0 },
      ]);
      await career.campaigns.upsertCampaign({
        id: 'campaign-a', name: 'Agent Search', targetRoles: ['Agent'], cities: [], graduationYears: [2026], experience: [], keywords: [], exclusions: [], sources: ['official'], resumeProfileIds: ['resume-a'], status: 'active',
      });
      const run = await career.discovery.beginDiscoveryRun({
        campaignId: 'campaign-a', executor: 'manual', contextSnapshot: {}, startedAt: t0, idempotencyKey: 'run-a',
      });

      const batch = await career.jobs.upsertJobsBatch({ jobs: [
        { companyName: 'A Co', title: 'Agent Engineer', city: 'Hangzhou', listings: [{ sourceKind: 'official', url: 'https://example.com/a', identityKind: 'url', status: 'active' }], observedAt: t0, discoveryRunId: run.id },
        { companyName: 'B Co', title: 'Fullstack Engineer', city: 'Shenzhen', listings: [{ sourceKind: 'official', url: 'https://example.com/b', identityKind: 'url', status: 'active' }], observedAt: t1 },
        { companyName: 'C Co', title: 'Frontend Engineer', city: 'Shanghai', listings: [{ sourceKind: 'official', url: 'https://example.com/c', identityKind: 'url', status: 'active' }], observedAt: t2 },
      ] });
      const [jobA, jobB, jobC] = batch.items.map((item) => item.jobId!);
      const appA = await career.applications.recordApplication({ jobId: jobA!, appliedAt: t1, resumeProfileId: 'resume-a', idempotencyKey: 'apply-a', actor: 'user' });
      const appB = await career.applications.recordApplication({ jobId: jobB!, appliedAt: t2, resumeProfileId: 'resume-b', idempotencyKey: 'apply-b', actor: 'user' });
      await career.applications.recordApplication({ jobId: jobC!, appliedAt: t3, resumeProfileId: 'resume-a', idempotencyKey: 'apply-c', actor: 'user' });
      await career.applications.transitionApplication({ applicationId: appA.application.id, toStage: 'screening', occurredAt: t2, idempotencyKey: 'screen-a', actor: 'user' });
      await career.applications.transitionApplication({ applicationId: appB.application.id, toStage: 'rejected', occurredAt: t3, idempotencyKey: 'reject-b', actor: 'user' });

      const campaignOnly = await career.workspace.listApplicationBoard({ campaignId: 'campaign-a', terminal: 'include', limit: 1, offset: 0 });
      expect(campaignOnly.total).toBe(1);
      expect(campaignOnly.items[0]?.companyName).toBe('A Co');

      const resumeA = await career.workspace.listApplicationBoard({ resumeProfileId: 'resume-a', terminal: 'include', limit: 20, offset: 0 });
      expect(resumeA.total).toBe(2);
      expect(resumeA.items.map((item) => item.companyName).sort()).toEqual(['A Co', 'C Co']);

      const fromT2 = await career.workspace.listApplicationBoard({ appliedFrom: t2, terminal: 'include', limit: 20, offset: 0 });
      expect(fromT2.total).toBe(2);

      const active = await career.workspace.listApplicationBoard({ terminal: 'exclude', limit: 20, offset: 0 });
      expect(active.total).toBe(2);
      expect(active.items.map((item) => item.application.currentStage).sort()).toEqual(['applied', 'screening']);

      const outcomes = await career.workspace.listApplicationBoard({ terminal: 'only', limit: 20, offset: 0 });
      expect(outcomes.total).toBe(1);
      expect(outcomes.items[0]?.application.currentStage).toBe('rejected');
    } finally {
      store.close();
    }
  });
});
