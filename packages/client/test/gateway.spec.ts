import { describe, expect, it, vi } from 'vitest';
import { createCareerGateway, type JobHarnessRestClient } from '../src';

const now = '2026-09-16T08:00:00.000Z';

describe('CareerGateway', () => {
  it('delegates only through the public typed REST client surface', async () => {
    const getCampaign = vi.fn(async () => null);
    const getPipelineStats = vi.fn(async () => ({
      knownJobs: 0,
      applications: 0,
      jobsByState: { discovered: 0, shortlisted: 0, ignored: 0, closed: 0, archived: 0 },
      applicationsByStage: { applied: 0, screening: 0, assessment: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 },
    }));
    const begin = vi.fn(async () => ({
      id: 'run-1', campaignId: 'campaign-1', executor: 'memoflow-ai' as const,
      contextSnapshot: {}, startedAt: now, completedAt: null,
      candidateCount: 0, insertedCount: 0, duplicateCount: 0, rejectedCount: 0,
    }));
    const client = {
      campaigns: { get: getCampaign },
      analytics: { getPipelineStats },
      workspace: {
        searchJobListItems: vi.fn(),
        getApplicationWorkspaceDetail: vi.fn(),
        listApplicationBoard: vi.fn(),
      },
      jobs: { upsertJobsBatch: vi.fn() },
      applications: { record: vi.fn(), transition: vi.fn() },
      discovery: { begin, complete: vi.fn() },
    } as unknown as JobHarnessRestClient;

    const gateway = createCareerGateway(client);
    await gateway.getCampaign('campaign-1');
    const progress = await gateway.getCampaignProgress('campaign-1');
    await gateway.requestDiscovery({
      campaignId: 'campaign-1', executor: 'memoflow-ai', contextSnapshot: {},
      startedAt: now, idempotencyKey: 'gateway-run-1',
    });

    expect(getCampaign).toHaveBeenCalledWith('campaign-1');
    expect(getPipelineStats).toHaveBeenCalledWith({ campaignId: 'campaign-1' });
    expect(progress.knownJobs).toBe(0);
    expect(begin).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'campaign-1', executor: 'memoflow-ai', idempotencyKey: 'gateway-run-1',
    }));
  });
});
