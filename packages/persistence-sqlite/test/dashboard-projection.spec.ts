import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('dashboard operational projection', () => {
  it('builds deterministic attention and seven-day activity without inventing triage history', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'job-harness-dashboard-'));
    dirs.push(dir);
    const store = new SqliteCareerStore(join(dir, 'career.db'));
    let clock = '2026-09-08T08:00:00.000Z';
    try {
      const career = createCareerApplicationService(store, { now: () => clock });
      await career.resumeRegistry.syncResumeProfiles([
        { id: 'resume-missing', name: 'Missing Artifact', source: 'resume-harness', externalProfileId: 'missing', targetRole: 'Agent', version: 'v1', hash: 'missing', artifactUri: null, updatedAt: '2026-09-01T00:00:00.000Z' },
        { id: 'resume-stale', name: 'Stale Artifact', source: 'resume-harness', externalProfileId: 'stale', targetRole: 'Agent', version: 'v1', hash: 'stale', artifactUri: 'file:///stale.pdf', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'resume-current', name: 'Current Resume', source: 'resume-harness', externalProfileId: 'current', targetRole: 'Agent', version: 'v1', hash: 'current', artifactUri: 'file:///current.pdf', updatedAt: '2026-09-15T00:00:00.000Z' },
      ]);
      await career.campaigns.upsertCampaign({
        id: 'campaign-stale', name: 'Stale Search', targetRoles: ['Agent'], cities: ['Hangzhou'], graduationYears: [2026], experience: [], keywords: [], exclusions: [], sources: ['official'], resumeProfileIds: ['resume-missing', 'resume-stale'], status: 'active',
      });
      await career.campaigns.upsertCampaign({
        id: 'campaign-recent', name: 'Recent Search', targetRoles: ['Agent'], cities: ['Shenzhen'], graduationYears: [2026], experience: [], keywords: [], exclusions: [], sources: ['official'], resumeProfileIds: ['resume-current'], status: 'active',
      });

      const oldRun = await career.discovery.beginDiscoveryRun({ campaignId: 'campaign-stale', executor: 'manual', contextSnapshot: {}, startedAt: clock, idempotencyKey: 'old-run' });
      const oldJobs = await career.jobs.upsertJobsBatch({ jobs: [
        { companyName: 'Old Pipeline Co', title: 'Agent Engineer', city: 'Hangzhou', listings: [{ sourceKind: 'official', url: 'https://example.com/old-pipeline', identityKind: 'url', status: 'active' }], observedAt: clock, discoveryRunId: oldRun.id },
        { companyName: 'Old Shortlist Co', title: 'AI Fullstack', city: 'Hangzhou', listings: [{ sourceKind: 'official', url: 'https://example.com/old-shortlist', identityKind: 'url', status: 'active' }], observedAt: clock, discoveryRunId: oldRun.id },
      ] });
      const staleAppJobId = oldJobs.items[0]!.jobId!;
      const shortlistJobId = oldJobs.items[1]!.jobId!;
      await career.jobs.setJobState({ jobId: staleAppJobId, state: 'shortlisted', idempotencyKey: 'shortlist-old-app' });
      await career.jobs.setJobState({ jobId: shortlistJobId, state: 'shortlisted', idempotencyKey: 'shortlist-unapplied' });
      await career.applications.recordApplication({ jobId: staleAppJobId, appliedAt: clock, resumeProfileId: 'resume-missing', idempotencyKey: 'apply-old', actor: 'user' });
      await career.discovery.completeDiscoveryRun({ runId: oldRun.id, completedAt: clock, candidateCount: 2, insertedCount: 2, duplicateCount: 0, rejectedCount: 0 });

      clock = '2026-09-12T08:00:00.000Z';
      await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Old Pipeline Co', title: 'Agent Engineer', city: 'Hangzhou',
        listings: [{ sourceKind: 'official', url: 'https://example.com/old-pipeline', identityKind: 'url', status: 'closed' }],
        observedAt: clock,
      }] });

      clock = '2026-09-15T09:00:00.000Z';
      const recentRun = await career.discovery.beginDiscoveryRun({ campaignId: 'campaign-recent', executor: 'chatgpt-web', contextSnapshot: {}, startedAt: clock, idempotencyKey: 'recent-run' });
      const recent = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Recent Co', title: 'AI Agent Engineer', city: 'Shenzhen',
        listings: [{ sourceKind: 'official', url: 'https://example.com/recent', identityKind: 'url', status: 'active' }],
        observedAt: clock, discoveryRunId: recentRun.id,
      }] });
      const recentJobId = recent.items[0]!.jobId!;
      await career.jobs.setJobState({ jobId: recentJobId, state: 'shortlisted', idempotencyKey: 'shortlist-recent' });
      const recentApplication = await career.applications.recordApplication({ jobId: recentJobId, appliedAt: clock, resumeProfileId: 'resume-current', idempotencyKey: 'apply-recent', actor: 'user' });
      await career.discovery.completeDiscoveryRun({ runId: recentRun.id, completedAt: clock, candidateCount: 1, insertedCount: 1, duplicateCount: 0, rejectedCount: 0 });

      clock = '2026-09-16T10:00:00.000Z';
      await career.applications.transitionApplication({ applicationId: recentApplication.application.id, toStage: 'screening', occurredAt: clock, idempotencyKey: 'screen-recent', actor: 'user' });

      const dashboard = await career.workspace.getDashboardSnapshot({ recentDiscoveryLimit: 5, attentionLimit: 20 });
      const kinds = new Set(dashboard.attention.map((item) => item.kind));
      expect(kinds).toEqual(new Set([
        'stale_application',
        'shortlisted_unapplied',
        'closed_listing_active_application',
        'stale_campaign_discovery',
        'missing_resume_artifact',
        'stale_resume_artifact',
      ]));
      expect(dashboard.attention.find((item) => item.kind === 'closed_listing_active_application')).toMatchObject({ severity: 'critical', jobId: staleAppJobId });
      expect(dashboard.attention.find((item) => item.kind === 'stale_application')).toMatchObject({ stage: 'applied' });

      expect(dashboard.weeklyActivity).toHaveLength(7);
      expect(dashboard.weeklyActivity.map((point) => point.shortlisted)).toEqual(Array(7).fill(null));
      expect(dashboard.weeklyActivity.find((point) => point.date === '2026-09-12')).toMatchObject({ jobsObserved: 1 });
      expect(dashboard.weeklyActivity.find((point) => point.date === '2026-09-15')).toMatchObject({
        jobsObserved: 1,
        opportunitiesInserted: 1,
        applicationsRecorded: 1,
        stageChanges: 0,
      });
      expect(dashboard.weeklyActivity.find((point) => point.date === '2026-09-16')).toMatchObject({ stageChanges: 1 });
      expect(dashboard.sourcePerformance).toHaveLength(1);
      expect(dashboard.sourcePerformance[0]).toMatchObject({
        sourceKind: 'official',
        opportunities: 3,
        applications: 2,
        applicationsByStage: { applied: 1, screening: 1 },
      });

      const scoped = await career.workspace.getDashboardSnapshot({ campaignId: 'campaign-recent', recentDiscoveryLimit: 5, attentionLimit: 20 });
      expect(scoped.kpis.knownJobs).toBe(1);
      expect(scoped.attention.some((item) => item.campaignId === 'campaign-stale')).toBe(false);
      expect(scoped.attention.some((item) => item.resumeProfileId === 'resume-missing')).toBe(false);
      expect(scoped.weeklyActivity.find((point) => point.date === '2026-09-15')).toMatchObject({ jobsObserved: 1, applicationsRecorded: 1 });
      expect(scoped.sourcePerformance[0]).toMatchObject({
        sourceKind: 'official', opportunities: 1, applications: 1, applicationsByStage: { screening: 1 },
      });
    } finally {
      store.close();
    }
  });
});
