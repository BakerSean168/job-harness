import { describe, expect, it } from 'vitest';
import type { JobSearchCampaign, UpsertJobCandidate } from '@job-harness/contracts';
import { DiscoveryWorker, type DiscoveryProviderPort } from '../src/runtime';

const campaign: JobSearchCampaign = {
  id: 'campaign-1', name: 'AI jobs', targetRoles: ['AI Agent'], cities: ['杭州'], graduationYears: [2026], experience: [], keywords: ['Agent'], exclusions: [],
  sources: ['zhilian'], resumeProfileIds: ['ai-agent-forgeflow'], status: 'active', createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
};
function candidate(id: string): UpsertJobCandidate {
  return { companyName: `Company ${id}`, title: 'Agent工程师', city: '杭州', description: 'Agent', observedAt: '2026-09-18T10:00:00.000Z', listings: [{ sourceKind: 'zhilian', url: `https://www.zhaopin.com/jobdetail/${id}.htm`, externalNamespace: 'zhilian', externalId: id, identityKind: 'external-id', status: 'active' }] };
}

describe('DiscoveryWorker', () => {
  it('owns the canonical DiscoveryRun and batches provider candidates through Job Harness jobs', async () => {
    const events: string[] = [];
    let completed: any = null;
    const client = {
      campaigns: { async get() { events.push('campaign'); return campaign; } },
      discovery: {
        async begin(input: any) { events.push('begin'); expect(input.contextSnapshot).toMatchObject({ provider: 'fixture-provider', sourceKind: 'zhilian' }); return { id: 'run-1' }; },
        async complete(input: any) { events.push('complete'); completed = input; return input; },
      },
      jobs: {
        async upsertJobsBatch(input: { jobs: UpsertJobCandidate[] }) {
          events.push(`upsert:${input.jobs.length}`);
          expect(input.jobs.every((job) => job.discoveryRunId === 'run-1')).toBe(true);
          return { items: input.jobs.map((_, index) => ({ status: index === 0 ? 'inserted' as const : 'updated' as const })) };
        },
      },
    };
    const provider: DiscoveryProviderPort = {
      id: 'fixture-provider', sourceKind: 'zhilian', plan: () => ({ terms: ['Agent'] }),
      async discover() { events.push('discover'); return { candidates: [candidate('CC1'), candidate('CC2')], queryCount: 3, failedQueryCount: 1, diagnostics: {} }; },
    };
    let tick = 0;
    const worker = new DiscoveryWorker({ client, provider, campaignId: campaign.id, idFactory: () => 'nonce-1', now: () => `2026-09-18T10:00:0${tick++}.000Z`, logger: { info() {}, warn() {}, error() {} } });
    await expect(worker.runOnce()).resolves.toEqual({ runId: 'run-1', providerId: 'fixture-provider', candidateCount: 2, insertedCount: 1, duplicateCount: 1, rejectedCount: 0, queryCount: 3, failedQueryCount: 1 });
    expect(events).toEqual(['campaign','begin','discover','upsert:2','complete']);
    expect(completed).toEqual({ runId: 'run-1', completedAt: '2026-09-18T10:00:01.000Z', candidateCount: 2, insertedCount: 1, duplicateCount: 1, rejectedCount: 0 });
  });

  it('completes the DiscoveryRun as failed evidence when the provider throws instead of leaking a running run', async () => {
    let completed: any = null;
    const client = {
      campaigns: { async get() { return campaign; } },
      discovery: { async begin() { return { id: 'run-fail' }; }, async complete(input: any) { completed = input; return input; } },
      jobs: { async upsertJobsBatch() { throw new Error('must not upsert'); } },
    };
    const provider: DiscoveryProviderPort = { id: 'fixture-provider', sourceKind: 'zhilian', plan: () => ({}), async discover() { throw new Error('provider unavailable'); } };
    const worker = new DiscoveryWorker({ client, provider, campaignId: campaign.id, idFactory: () => 'nonce-fail', now: () => '2026-09-18T10:00:00.000Z', logger: { info() {}, warn() {}, error() {} } });
    await expect(worker.runOnce()).rejects.toThrow('provider unavailable');
    expect(completed).toEqual({ runId: 'run-fail', completedAt: '2026-09-18T10:00:00.000Z', candidateCount: 0, insertedCount: 0, duplicateCount: 0, rejectedCount: 1 });
  });
});
