import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CareerIdempotencyConflictError,
  CareerInvalidTransitionError,
  createCareerApplicationService,
} from '@job-harness/application';
import { SqliteCareerStore } from '../src';

const t0 = '2026-09-16T08:00:00.000Z';
const t1 = '2026-09-16T09:00:00.000Z';
const t1b = '2026-09-16T09:30:00.000Z';
const t2 = '2026-09-16T10:00:00.000Z';
const t3 = '2026-09-16T11:00:00.000Z';

describe('SQLite standalone vertical slice', () => {
  let dir: string;
  let store: SqliteCareerStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-'));
    store = new SqliteCareerStore(join(dir, 'career.db'));
  });

  afterEach(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('runs campaign -> discovery -> dedupe -> application -> pipeline with durable idempotency', async () => {
    let clock = t0;
    const career = createCareerApplicationService(store, { now: () => clock });

    await career.resumeRegistry.syncResumeProfiles([
      {
        id: 'resume-ai-agent',
        name: 'AI Agent Resume',
        source: 'resume-harness',
        externalProfileId: 'ai-agent',
        targetRole: 'AI Agent Engineer',
        version: 'v1',
        hash: 'sha256:test',
        artifactUri: 'file:///resume/ai-agent.pdf',
        updatedAt: t0,
      },
    ]);

    const campaign = await career.campaigns.upsertCampaign({
      id: 'campaign-ai-agent',
      name: '2026 AI Agent Search',
      targetRoles: ['AI Agent Engineer'],
      cities: ['Hangzhou', 'Shenzhen'],
      graduationYears: [2026],
      experience: ['0-1y'],
      keywords: ['agent'],
      exclusions: [],
      sources: ['official', 'boss'],
      resumeProfileIds: ['resume-ai-agent'],
      status: 'active',
    });
    expect(campaign.createdAt).toBe(t0);

    const run = await career.discovery.beginDiscoveryRun({
      campaignId: campaign.id,
      executor: 'chatgpt-web',
      contextSnapshot: { query: 'AI Agent Hangzhou' },
      startedAt: t0,
      idempotencyKey: 'discovery-20260916-am',
    });
    const runRetry = await career.discovery.beginDiscoveryRun({
      campaignId: campaign.id,
      executor: 'chatgpt-web',
      contextSnapshot: { query: 'AI Agent Hangzhou' },
      startedAt: t0,
      idempotencyKey: 'discovery-20260916-am',
    });
    expect(runRetry.id).toBe(run.id);
    await expect(career.discovery.beginDiscoveryRun({
      campaignId: campaign.id,
      executor: 'chatgpt-web',
      contextSnapshot: { query: 'different query' },
      startedAt: t0,
      idempotencyKey: 'discovery-20260916-am',
    })).rejects.toBeInstanceOf(CareerIdempotencyConflictError);

    const firstBatch = await career.jobs.upsertJobsBatch({
      jobs: [
        {
          companyName: 'Acme AI',
          title: 'AI Agent Engineer',
          city: 'Hangzhou',
          listings: [{
            sourceKind: 'official',
            url: 'https://jobs.example.com/roles/agent-1?utm_source=chatgpt',
            externalNamespace: 'official',
            externalId: 'agent-1',
            identityKind: 'external-id',
            status: 'active',
          }],
          description: 'Build agent systems',
          observedAt: t0,
          discoveryRunId: run.id,
        },
        {
          companyName: 'Other Co',
          title: 'Frontend Engineer',
          city: 'Shenzhen',
          listings: [{
            sourceKind: 'official',
            url: 'https://other.example.com/careers',
            identityKind: 'scoped',
            status: 'active',
          }],
          observedAt: t0,
          discoveryRunId: run.id,
        },
      ],
    });
    expect(firstBatch.items.map((item) => item.status)).toEqual(['inserted', 'inserted']);

    clock = t1;
    const duplicateBatch = await career.jobs.upsertJobsBatch({
      jobs: [{
        companyName: 'ACME AI',
        title: 'AI Agent Engineer',
        city: 'Hangzhou',
        listings: [{
          sourceKind: 'official',
          url: 'https://jobs.example.com/roles/agent-1',
          externalNamespace: 'OFFICIAL',
          externalId: 'AGENT-1',
          identityKind: 'external-id',
          status: 'active',
        }],
        description: 'Build agent systems',
        observedAt: t1,
        discoveryRunId: run.id,
      }],
    });
    expect(duplicateBatch.items[0]).toMatchObject({ status: 'duplicate', jobId: firstBatch.items[0]!.jobId });

    // A generic company careers page is a source, not a canonical job identity.
    const sharedListing = await career.jobs.upsertJobsBatch({
      jobs: [{
        companyName: 'Other Co',
        title: 'Backend Engineer',
        city: 'Shenzhen',
        listings: [{
          sourceKind: 'official',
          url: 'https://other.example.com/careers',
          identityKind: 'scoped',
          status: 'active',
        }],
        observedAt: t1,
        discoveryRunId: run.id,
      }],
    });
    expect(sharedListing.items[0]!.status).toBe('inserted');

    // Composite company/title/city is only a duplicate candidate. A distinct strong
    // listing identity must remain a distinct Opportunity instead of being merged.
    const separateHc = await career.jobs.upsertJobsBatch({
      jobs: [{
        companyName: 'Acme AI',
        title: 'AI Agent Engineer',
        city: 'Hangzhou',
        listings: [{
          sourceKind: 'official',
          url: 'https://jobs.example.com/roles/agent-2',
          identityKind: 'url',
          status: 'active',
        }],
        observedAt: t1,
        discoveryRunId: run.id,
      }],
    });
    expect(separateHc.items[0]).toMatchObject({ status: 'inserted' });
    expect(separateHc.items[0]!.jobId).not.toBe(firstBatch.items[0]!.jobId);
    expect(separateHc.items[0]!.reason).toContain('potential-duplicate:');

    const jobId = firstBatch.items[0]!.jobId!;
    const application = await career.applications.recordApplication({
      jobId,
      appliedAt: t1,
      resumeProfileId: 'resume-ai-agent',
      idempotencyKey: 'apply-acme-agent-1',
      actor: 'chatgpt-web',
      note: 'Submitted on official careers site',
    });
    expect(application.job.companyName).toBe('Acme AI');
    expect(application.application.currentStage).toBe('applied');
    expect(application.timeline).toHaveLength(1);

    const applicationRetry = await career.applications.recordApplication({
      jobId,
      appliedAt: t1,
      resumeProfileId: 'resume-ai-agent',
      idempotencyKey: 'apply-acme-agent-1',
      actor: 'chatgpt-web',
      note: 'Submitted on official careers site',
    });
    expect(applicationRetry.application.id).toBe(application.application.id);
    expect(applicationRetry.timeline).toHaveLength(1);

    const secondSubmission = await career.applications.recordApplication({
      jobId,
      appliedAt: t1b,
      resumeProfileId: 'resume-ai-agent',
      idempotencyKey: 'apply-acme-agent-referral',
      actor: 'user',
      note: 'Submitted again through a referral channel',
    });
    expect(secondSubmission.application.id).toBe(application.application.id);
    expect(secondSubmission.timeline.filter((event) => ['application_recorded', 'submission_recorded'].includes(event.type))).toHaveLength(2);

    clock = t2;
    const screening = await career.applications.transitionApplication({
      applicationId: application.application.id,
      toStage: 'screening',
      occurredAt: t2,
      idempotencyKey: 'acme-screening-1',
      actor: 'user',
      note: 'Portal shows resume screening',
    });
    expect(screening.application.currentStage).toBe('screening');
    expect(screening.timeline.map((event) => event.stage)).toEqual(['applied', null, 'screening']);

    await expect(career.applications.transitionApplication({
      applicationId: application.application.id,
      toStage: 'applied',
      occurredAt: t3,
      idempotencyKey: 'invalid-backwards',
      actor: 'user',
    })).rejects.toBeInstanceOf(CareerInvalidTransitionError);

    const listed = await career.applications.listApplications({ company: 'acme', limit: 20, offset: 0 });
    expect(listed.total).toBe(1);
    expect(listed.items[0]!.job.title).toBe('AI Agent Engineer');

    const globalStats = await career.analytics.getPipelineStats({});
    expect(globalStats.knownJobs).toBe(4);
    expect(globalStats.applications).toBe(1);
    expect(globalStats.applicationsByStage.screening).toBe(1);

    const campaignStats = await career.analytics.getPipelineStats({ campaignId: campaign.id });
    expect(campaignStats.knownJobs).toBe(4);
    expect(campaignStats.applications).toBe(1);

    const completed = await career.discovery.completeDiscoveryRun({
      runId: run.id,
      completedAt: t3,
      candidateCount: 5,
      insertedCount: 4,
      duplicateCount: 1,
      rejectedCount: 0,
    });
    expect(completed.completedAt).toBe(t3);

    const context = await career.analytics.getCareerContext({ campaignId: campaign.id });
    expect(context.campaign?.id).toBe(campaign.id);
    expect(context.resumes.map((resume) => resume.id)).toContain('resume-ai-agent');
    expect(context.pipeline.knownJobs).toBe(4);
  });
});
