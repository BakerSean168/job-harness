import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { runCampaignLifecycleSweep, SqliteCareerStore } from '../src';

const t0 = '2026-10-01T00:00:00Z';
const asOf = '2026-11-04T00:00:00Z';
let tempDir: string | null = null;
afterEach(async () => { if (tempDir) await rm(tempDir, { recursive: true, force: true }); tempDir = null; });

describe('campaign-scoped job lifecycle maintenance', () => {
  it('archives only demonstrated past-deadline/closed listings and preserves applications and unverified sources', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jh-lifecycle-'));
    const databasePath = join(tempDir, 'career.db');
    const store = new SqliteCareerStore(databasePath);
    const career = createCareerApplicationService(store, { now: () => t0 });
    await career.campaigns.upsertCampaign({
      id: 'grad-2026', name: '2026 Graduate', targetRoles: ['Frontend'],
      cities: ['Hangzhou'], graduationYears: [2026], experience: ['no experience'],
      keywords: [], exclusions: [], sources: ['official'], resumeProfileIds: [], status: 'active',
    });
    await career.campaigns.upsertCampaign({
      id: 'other-campaign', name: 'Another Search', targetRoles: ['Frontend'],
      cities: ['Hangzhou'], graduationYears: [2026], experience: [],
      keywords: [], exclusions: [], sources: ['official'], resumeProfileIds: [], status: 'active',
    });
    const run = await career.discovery.beginDiscoveryRun({
      campaignId: 'grad-2026', executor: 'manual', contextSnapshot: {},
      startedAt: t0, idempotencyKey: 'run-lifecycle',
    });
    const deadline = {
      precision: 'date' as const, date: '2026-10-20', timeZone: 'Asia/Shanghai',
      sourceText: '报名截止 2026-10-20', sourceUrl: 'https://example.com/jobs/deadline', observedAt: t0,
    };
    const jobs = await career.jobs.upsertJobsBatch({ jobs: [
      {
        companyName: 'Deadline Co', title: 'Frontend Dev', city: 'Hangzhou', observedAt: t0, discoveryRunId: run.id,
        listings: [{ sourceKind: 'official', url: 'https://example.com/jobs/deadline', identityKind: 'url',
          status: 'active', applicationDeadline: deadline, closingPolicy: 'fixed_deadline' }],
      },
      {
        companyName: 'Unknown Co', title: 'Frontend Dev', city: 'Hangzhou', observedAt: t0, discoveryRunId: run.id,
        listings: [{ sourceKind: 'official', url: 'https://example.com/jobs/unknown', identityKind: 'url', status: 'active' }],
      },
      {
        companyName: 'Applied Co', title: 'Frontend Dev', city: 'Hangzhou', observedAt: t0, discoveryRunId: run.id,
        listings: [{ sourceKind: 'official', url: 'https://example.com/jobs/applied', identityKind: 'url',
          status: 'active', applicationDeadline: deadline }],
      },
      {
        companyName: 'Closed Co', title: 'Backend Dev', city: 'Hangzhou', observedAt: t0, discoveryRunId: run.id,
        listings: [{ sourceKind: 'official', url: 'https://example.com/jobs/closed', identityKind: 'url',
          status: 'closed', verificationKind: 'closed_confirmed', closureReason: 'filled',
          evidenceUrl: 'https://example.com/jobs/closed' }],
      },
      {
        companyName: 'Two Listings Co', title: 'Fullstack Dev', city: 'Hangzhou', observedAt: t0, discoveryRunId: run.id,
        listings: [
          { sourceKind: 'official', url: 'https://example.com/jobs/multi-one', identityKind: 'url',
            status: 'active', applicationDeadline: deadline },
          { sourceKind: 'official', url: 'https://example.com/jobs/multi-two', identityKind: 'url', status: 'active' },
        ],
      },
    ] });
    expect(jobs.items.every((job) => job.status === 'inserted')).toBe(true);
    const [deadlineId, unknownId, appliedId, closedId, multiId] = jobs.items.map((job) => job.jobId!);
    const secondRun = await career.discovery.beginDiscoveryRun({
      campaignId: 'other-campaign', executor: 'manual', contextSnapshot: {},
      startedAt: '2026-10-02T00:00:00Z', idempotencyKey: 'second-campaign',
    });
    const shared = await career.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Deadline Co', title: 'Frontend Dev', city: 'Hangzhou',
      observedAt: '2026-10-02T00:00:00Z', discoveryRunId: secondRun.id,
      listings: [{ sourceKind: 'official', url: 'https://example.com/jobs/deadline',
        identityKind: 'url', status: 'active' }],
    }] });
    expect(shared.items[0]?.jobId).toBe(deadlineId);
    store.close();

    const db = new DatabaseSync(databasePath);
    db.prepare(
      'INSERT INTO applications(id,job_id,current_stage,applied_at,resume_profile_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
    ).run('app1', appliedId, 'screening', t0, null, t0, t0);
    db.close();

    const preview = runCampaignLifecycleSweep({ databasePath, campaignId: 'grad-2026', asOf });
    expect(preview.dryRun).toBe(true);
    expect(preview.wouldArchive).toBe(2);
    expect(preview.archived).toBe(0);
    expect(preview.skippedApplication).toBe(1);
    expect(preview.candidates.map((job) => job.jobId).sort()).toEqual([deadlineId, closedId].sort());

    const applied = runCampaignLifecycleSweep({ databasePath, campaignId: 'grad-2026', asOf, apply: true });
    expect(applied.archived).toBe(2);
    const twice = runCampaignLifecycleSweep({ databasePath, campaignId: 'grad-2026', asOf, apply: true });
    expect(twice.archived).toBe(0);
    const verify = new SqliteCareerStore(databasePath);
    expect((await verify.searchJobs({ campaignId: 'grad-2026', limit: 50 })).items.map((job) => job.id).sort())
      .toEqual([unknownId, appliedId, multiId].sort());
    expect((await verify.searchJobs({ campaignId: 'other-campaign', limit: 50 })).total).toBe(1);
    expect((await verify.searchJobs({ limit: 50 })).items.some((job) => job.id === deadlineId)).toBe(true);
    expect((await verify.searchJobs({ campaignId: 'grad-2026', includeCampaignArchived: true })).total).toBe(5);
    const scopedArchived = await verify.searchJobListItems({ campaignId: 'grad-2026', includeCampaignArchived: true });
    expect(scopedArchived.items.find((item) => item.jobId === deadlineId)?.archivedForView).toBe(true);
    expect(scopedArchived.items.find((item) => item.jobId === unknownId)?.archivedForView).toBe(false);
    const otherScoped = await verify.searchJobListItems({ campaignId: 'other-campaign' });
    expect(otherScoped.items.find((item) => item.jobId === deadlineId)?.archivedForView).toBe(false);
    const global = await verify.searchJobListItems({ includeCampaignArchived: true });
    expect(global.items.find((item) => item.jobId === deadlineId)?.archivedForView).toBe(false);
    expect(global.items.find((item) => item.jobId === closedId)?.archivedForView).toBe(true);

    // A verified reopen and explicit rescission of a deadline can restore the
    // scoped archive. A mere search reappearance cannot.
    const reopen = createCareerApplicationService(verify, { now: () => asOf });
    await reopen.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Deadline Co', title: 'Frontend Dev', city: 'Hangzhou',
      observedAt: '2026-11-04T12:00:00Z',
      listings: [{
        sourceKind: 'official', url: 'https://example.com/jobs/deadline', identityKind: 'url',
        status: 'active', verificationKind: 'open_confirmed', applicationDeadline: null, closingPolicy: 'rolling',
        evidenceUrl: 'https://example.com/jobs/deadline',
      }],
    }] });
    verify.close();
    const restored = runCampaignLifecycleSweep({
      databasePath, campaignId: 'grad-2026', asOf: '2026-11-04T13:00:00Z', apply: true,
    });
    expect(restored.restored).toBe(1);
    const evidence = new DatabaseSync(databasePath);
    const events = evidence.prepare('SELECT from_status,to_status,reason FROM campaign_job_state_events ORDER BY occurred_at').all();
    expect(events).toHaveLength(3);
    evidence.close();
  });
});
