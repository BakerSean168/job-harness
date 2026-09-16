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

describe('workspace read models', () => {
  it('projects Jobs, detail, Discovery, Resume usage and Dashboard without UI-side joins', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'job-harness-workspace-'));
    dirs.push(dir);
    const store = new SqliteCareerStore(join(dir, 'career.db'));
    let clock = t0;
    try {
      const career = createCareerApplicationService(store, {
        now: () => clock,
        idFactory: (() => {
          let n = 0;
          return () => `id-${++n}`;
        })(),
      });

      await career.resumeRegistry.syncResumeProfiles([
        {
          id: 'resume-agent',
          name: 'AI Agent / ForgeFlow',
          source: 'resume-harness',
          externalProfileId: 'ai-agent-forgeflow',
          targetRole: 'AI Agent Engineer',
          version: 'v1',
          hash: 'hash-agent',
          artifactUri: 'file:///resume/agent.pdf',
          updatedAt: t0,
        },
        {
          id: 'resume-fullstack',
          name: 'AI Fullstack',
          source: 'resume-harness',
          externalProfileId: 'ai-fullstack',
          targetRole: 'AI Fullstack Engineer',
          version: 'v1',
          hash: 'hash-fullstack',
          artifactUri: 'file:///resume/fullstack.pdf',
          updatedAt: t0,
        },
      ]);

      const campaign = await career.campaigns.upsertCampaign({
        id: 'campaign-ai-agent',
        name: 'AI Agent Hangzhou',
        targetRoles: ['AI Agent Engineer'],
        cities: ['Hangzhou'],
        graduationYears: [2026],
        experience: ['0-1y'],
        keywords: ['Agent', 'MCP'],
        exclusions: [],
        sources: ['official', 'boss'],
        resumeProfileIds: ['resume-agent'],
        status: 'active',
      });
      expect(campaign.status).toBe('active');

      const run = await career.discovery.beginDiscoveryRun({
        campaignId: campaign.id,
        executor: 'chatgpt-web',
        contextSnapshot: { query: 'Hangzhou AI Agent' },
        startedAt: t0,
        idempotencyKey: 'run-ai-agent-1',
      });

      const jobs = await career.jobs.upsertJobsBatch({
        jobs: [
          {
            companyName: 'Acme AI',
            title: 'AI Agent Engineer',
            city: 'Hangzhou',
            listings: [
              {
                sourceKind: 'boss',
                label: 'BOSS',
                url: 'https://boss.example.com/job/agent-1',
                identityKind: 'url',
                status: 'active',
              },
              {
                sourceKind: 'official',
                label: 'Official Careers',
                url: 'https://jobs.example.com/agent-1',
                externalNamespace: 'official',
                externalId: 'agent-1',
                identityKind: 'external-id',
                status: 'active',
              },
            ],
            description: 'Build production Agent systems',
            observedAt: t0,
            discoveryRunId: run.id,
          },
          {
            companyName: 'Beta Labs',
            title: 'AI Fullstack Engineer',
            city: 'Hangzhou',
            listings: [{
              sourceKind: 'official',
              label: 'Official Careers',
              url: 'https://beta.example.com/jobs/fullstack-1',
              identityKind: 'url',
              status: 'active',
            }],
            observedAt: t0,
            discoveryRunId: run.id,
          },
        ],
      });
      const agentJobId = jobs.items[0]!.jobId!;
      const betaJobId = jobs.items[1]!.jobId!;

      clock = t1;
      await career.jobs.setJobState({
        jobId: agentJobId,
        state: 'shortlisted',
        idempotencyKey: 'shortlist-agent',
      });
      const application = await career.applications.recordApplication({
        jobId: agentJobId,
        appliedAt: t1,
        resumeProfileId: 'resume-agent',
        idempotencyKey: 'apply-agent',
        actor: 'user',
        note: 'Official submission',
      });

      clock = t2;
      await career.applications.transitionApplication({
        applicationId: application.application.id,
        toStage: 'screening',
        occurredAt: t2,
        idempotencyKey: 'screen-agent',
        actor: 'system',
      });
      await career.discovery.completeDiscoveryRun({
        runId: run.id,
        completedAt: t2,
        candidateCount: 2,
        insertedCount: 2,
        duplicateCount: 0,
        rejectedCount: 0,
      });

      // Global state may contain unrelated applications. Campaign-scoped read models
      // must not leak them into Dashboard or Resume usage projections.
      const outside = await career.jobs.upsertJobsBatch({
        jobs: [{
          companyName: 'Outside Corp',
          title: 'AI Platform Engineer',
          city: 'Shanghai',
          listings: [{
            sourceKind: 'official',
            url: 'https://outside.example.com/jobs/platform-1',
            identityKind: 'url',
            status: 'active',
          }],
          observedAt: t2,
        }],
      });
      const outsideJobId = outside.items[0]!.jobId!;
      await career.jobs.setJobState({ jobId: outsideJobId, state: 'shortlisted', idempotencyKey: 'shortlist-outside' });
      await career.applications.recordApplication({
        jobId: outsideJobId,
        appliedAt: t2,
        resumeProfileId: 'resume-agent',
        idempotencyKey: 'apply-outside',
        actor: 'user',
      });

      const page = await career.workspace.searchJobListItems({ limit: 20, offset: 0 });
      expect(page.total).toBe(3);
      const scopedJobs = await career.workspace.searchJobListItems({ campaignId: campaign.id, limit: 20, offset: 0 });
      expect(scopedJobs.total).toBe(2);
      expect(scopedJobs.items.map((item) => item.companyName).sort()).toEqual(['Acme AI', 'Beta Labs']);
      const agentRow = page.items.find((item) => item.jobId === agentJobId)!;
      const betaRow = page.items.find((item) => item.jobId === betaJobId)!;
      expect(agentRow).toMatchObject({
        companyName: 'Acme AI',
        state: 'shortlisted',
        listingCount: 2,
        application: { currentStage: 'screening', resumeProfileId: 'resume-agent' },
        resume: { id: 'resume-agent', name: 'AI Agent / ForgeFlow' },
      });
      expect(agentRow.primaryListing).toMatchObject({ sourceKind: 'official', externalId: 'agent-1' });
      expect(agentRow.sourceKinds).toEqual(['boss', 'official']);
      expect(agentRow.campaigns).toEqual([{ id: campaign.id, name: campaign.name, status: 'active' }]);
      expect(betaRow.application).toBeNull();
      expect(betaRow.state).toBe('discovered');

      const detail = await career.workspace.getJobDetail(agentJobId);
      expect(detail?.job.id).toBe(agentJobId);
      expect(detail?.primaryListing?.sourceKind).toBe('official');
      expect(detail?.application?.application.currentStage).toBe('screening');
      expect(detail?.application?.latestEvent?.type).toBe('stage_changed');
      expect(detail?.application?.submissionCount).toBe(1);
      expect(detail?.observations).toHaveLength(2);
      expect(detail?.observations.every((entry) => entry.observation.listingId === entry.listing.id)).toBe(true);

      const applicationBoard = await career.workspace.listApplicationBoard({ limit: 20, offset: 0 });
      expect(applicationBoard.total).toBe(2);
      const agentApplicationCard = applicationBoard.items.find((item) => item.application.id === application.application.id)!;
      expect(agentApplicationCard).toMatchObject({
        companyName: 'Acme AI',
        title: 'AI Agent Engineer',
        application: { currentStage: 'screening' },
        resume: { id: 'resume-agent', name: 'AI Agent / ForgeFlow' },
        stageEnteredAt: t2,
        submissionCount: 1,
        latestEvent: { type: 'stage_changed', stage: 'screening' },
      });
      expect(agentApplicationCard.primaryListing?.sourceKind).toBe('official');

      const applicationDetail = await career.workspace.getApplicationWorkspaceDetail(application.application.id);
      expect(applicationDetail).toMatchObject({
        application: { id: application.application.id, currentStage: 'screening' },
        job: { id: agentJobId },
        resume: { id: 'resume-agent' },
        stageEnteredAt: t2,
        submissionCount: 1,
      });
      expect(applicationDetail?.timeline.map((event) => event.type)).toEqual(['application_recorded', 'stage_changed']);

      const resumeUsage = await career.workspace.listResumeUsage({ campaignId: campaign.id, limit: 20, offset: 0 });
      expect(resumeUsage.total).toBe(2);
      expect(resumeUsage.items.find((item) => item.resume.id === 'resume-agent')).toMatchObject({
        applications: 1,
        applicationsByStage: { screening: 1 },
        lastUsedAt: t1,
      });
      expect(resumeUsage.items.find((item) => item.resume.id === 'resume-fullstack')?.applications).toBe(0);

      const runDetail = await career.workspace.getDiscoveryRunDetail(run.id);
      expect(runDetail?.run.id).toBe(run.id);
      expect(runDetail?.campaign?.id).toBe(campaign.id);
      expect(runDetail?.affectedJobs).toHaveLength(2);
      expect(runDetail?.observationCount).toBe(3);

      clock = t3;
      const dashboard = await career.workspace.getDashboardSnapshot({
        campaignId: campaign.id,
        recentDiscoveryLimit: 5,
      });
      expect(dashboard.generatedAt).toBe(t3);
      expect(dashboard.campaign?.id).toBe(campaign.id);
      expect(dashboard.kpis).toEqual({
        knownJobs: 2,
        inbox: 1,
        shortlisted: 1,
        applications: 1,
        activePipeline: 1,
        interviewStage: 0,
      });
      expect(dashboard.funnel).toMatchObject({
        discovered: 1,
        shortlisted: 1,
        applied: 0,
        screening: 1,
        assessment: 0,
        interview: 0,
        offer: 0,
      });
      expect(dashboard.recentDiscoveryRuns[0]?.run.id).toBe(run.id);
      expect(dashboard.resumeUsage.find((item) => item.resume.id === 'resume-agent')?.applications).toBe(1);
    } finally {
      store.close();
    }
  });
});
