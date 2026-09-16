import { describe, expect, it } from 'vitest';
import { createJobHarnessRestClient, JobHarnessRestError } from '../src';

const now = '2026-09-16T08:00:00.000Z';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Job Harness REST client', () => {
  it('encodes list filters, injects bearer auth and validates a Jobs workspace response', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return response({
        items: [{
          jobId: 'job-1',
          companyId: 'company-1',
          companyName: 'Acme',
          title: 'AI Agent Engineer',
          city: 'Hangzhou',
          state: 'discovered',
          application: null,
          primaryListing: null,
          listingCount: 0,
          sourceKinds: [],
          campaigns: [],
          resume: null,
          firstSeenAt: now,
          lastSeenAt: now,
        }],
        total: 1,
      });
    };
    const client = createJobHarnessRestClient({
      baseUrl: 'http://127.0.0.1:3000/api/v1/',
      authToken: 'secret',
      fetch: fetchImpl,
    });

    const result = await client.workspace.searchJobListItems({
      states: ['discovered', 'shortlisted'],
      sourceKinds: ['official'],
      applied: false,
      campaignId: 'campaign-agent',
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/v1/jobs');
    expect(url.searchParams.getAll('states')).toEqual(['discovered', 'shortlisted']);
    expect(url.searchParams.getAll('sourceKinds')).toEqual(['official']);
    expect(url.searchParams.get('applied')).toBe('false');
    expect(url.searchParams.get('campaignId')).toBe('campaign-agent');
    expect(new Headers(calls[0]!.init?.headers).get('authorization')).toBe('Bearer secret');
  });

  it('encodes application workspace filters before transport', async () => {
    const calls: string[] = [];
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async (input) => {
        calls.push(String(input));
        return response({ items: [], total: 0 });
      },
    });
    await client.workspace.listApplicationBoard({
      company: 'Acme',
      stages: ['screening'],
      campaignId: 'campaign-1',
      resumeProfileId: 'resume-1',
      appliedFrom: '2026-09-01T00:00:00.000Z',
      appliedTo: '2026-09-30T23:59:59.999Z',
      terminal: 'include',
      limit: 50,
      offset: 0,
    });
    const url = new URL(calls[0]!);
    expect(url.searchParams.get('company')).toBe('Acme');
    expect(url.searchParams.getAll('stages')).toEqual(['screening']);
    expect(url.searchParams.get('campaignId')).toBe('campaign-1');
    expect(url.searchParams.get('resumeProfileId')).toBe('resume-1');
    expect(url.searchParams.get('appliedFrom')).toBe('2026-09-01T00:00:00.000Z');
    expect(url.searchParams.get('appliedTo')).toBe('2026-09-30T23:59:59.999Z');
    expect(url.searchParams.get('terminal')).toBe('include');
  });

  it('encodes Dashboard limits and validates operational projections', async () => {
    const calls: string[] = [];
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async (input) => {
        calls.push(String(input));
        return response({
          generatedAt: now, campaign: null,
          kpis: { knownJobs: 0, inbox: 0, shortlisted: 0, applications: 0, activePipeline: 0, interviewStage: 0 },
          funnel: { discovered: 0, shortlisted: 0, applied: 0, screening: 0, assessment: 0, interview: 0, offer: 0 },
          recentDiscoveryRuns: [], resumeUsage: [], attention: [], sourcePerformance: [],
          weeklyActivity: Array.from({ length: 7 }, (_, index) => ({
            date: `2026-09-${String(10 + index).padStart(2, '0')}`, jobsObserved: 0, opportunitiesInserted: 0, shortlisted: null, applicationsRecorded: 0, stageChanges: 0, interviewsScheduled: 0,
          })),
        });
      },
    });
    const result = await client.workspace.getDashboardSnapshot({ recentDiscoveryLimit: 3, attentionLimit: 7 });
    expect(result.weeklyActivity).toHaveLength(7);
    const url = new URL(calls[0]!);
    expect(url.searchParams.get('recentDiscoveryLimit')).toBe('3');
    expect(url.searchParams.get('attentionLimit')).toBe('7');
  });

  it('surfaces stable server error envelopes', async () => {
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async () => response({ error: { code: 'INVALID_TRANSITION', message: 'nope' } }, 422),
    });
    try {
      await client.jobs.setJobState({
        jobId: 'job-1',
        state: 'shortlisted',
        idempotencyKey: 'test-1',
      });
      throw new Error('expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(JobHarnessRestError);
      expect(error).toMatchObject({
        status: 422,
        payload: { code: 'INVALID_TRANSITION', message: 'nope' },
      });
    }
  });
});

it('maps entity 404 reads to null without swallowing other errors', async () => {
  const client = createJobHarnessRestClient({
    baseUrl: 'http://job-harness/api/v1',
    fetch: async () => response({ error: { code: 'NOT_FOUND', message: 'missing' } }, 404),
  });
  await expect(client.workspace.getJobDetail('missing')).resolves.toBeNull();
  await expect(client.workspace.getApplicationWorkspaceDetail('missing')).resolves.toBeNull();
  await expect(client.workspace.getDiscoveryRunDetail('missing')).resolves.toBeNull();
  await expect(client.campaigns.get('missing')).resolves.toBeNull();
});
