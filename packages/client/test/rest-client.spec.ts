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

  it('encodes Discovery history filters', async () => {
    const calls: string[] = [];
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async (input) => { calls.push(String(input)); return response({ items: [], total: 0 }); },
    });
    await client.workspace.listDiscoveryRuns({ campaignId: 'campaign-1', executor: 'chatgpt-web', limit: 25, offset: 50 });
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe('/api/v1/discovery');
    expect(url.searchParams.get('campaignId')).toBe('campaign-1');
    expect(url.searchParams.get('executor')).toBe('chatgpt-web');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('offset')).toBe('50');
  });

  it('encodes company scope filters', async () => {
    const calls: string[] = [];
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async (input) => { calls.push(String(input)); return response({ items: [], total: 0 }); },
    });
    await client.workspace.listCompanies({ query: 'Acme', campaignId: 'campaign-1', limit: 25, offset: 0 });
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe('/api/v1/companies');
    expect(url.searchParams.get('query')).toBe('Acme');
    expect(url.searchParams.get('campaignId')).toBe('campaign-1');
  });

  it('validates the analytics snapshot contract', async () => {
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async () => response({
        generatedAt: now, campaign: null,
        pipeline: {
          knownJobs: 0, applications: 0,
          jobsByState: { discovered: 0, shortlisted: 0, ignored: 0, closed: 0, archived: 0 },
          applicationsByStage: { applied: 0, screening: 0, assessment: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 },
        },
        sourcePerformance: [], resumeUsage: [], companyPerformance: [], campaignPerformance: [],
      }),
    });
    const result = await client.workspace.getAnalyticsSnapshot({});
    expect(result.pipeline.knownJobs).toBe(0);
  });

  it('exposes host integration pipeline and Discovery mutation endpoints', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const run = {
      id: 'run-1', campaignId: 'campaign-1', executor: 'memoflow-ai',
      contextSnapshot: { trigger: 'career.discovery.run' },
      startedAt: now, completedAt: null, candidateCount: 0, insertedCount: 0, duplicateCount: 0, rejectedCount: 0,
    };
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url, method, body });
        if (url.includes('/pipeline')) {
          return response({
            knownJobs: 2, applications: 1,
            jobsByState: { discovered: 1, shortlisted: 1, ignored: 0, closed: 0, archived: 0 },
            applicationsByStage: { applied: 1, screening: 0, assessment: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 },
          });
        }
        if (url.endsWith('/discovery')) return response(run, 201);
        return response({ ...run, completedAt: '2026-09-16T08:10:00.000Z', candidateCount: 2, insertedCount: 1, duplicateCount: 1 });
      },
    });

    const pipeline = await client.analytics.getPipelineStats({ campaignId: 'campaign-1' });
    expect(pipeline).toMatchObject({ knownJobs: 2, applications: 1 });
    await client.discovery.begin({
      campaignId: 'campaign-1', executor: 'memoflow-ai', contextSnapshot: { trigger: 'career.discovery.run' },
      startedAt: now, idempotencyKey: 'begin-1',
    });
    await client.discovery.complete({
      runId: 'run-1', completedAt: '2026-09-16T08:10:00.000Z',
      candidateCount: 2, insertedCount: 1, duplicateCount: 1, rejectedCount: 0,
    });

    expect(new URL(calls[0]!.url).pathname).toBe('/api/v1/pipeline');
    expect(new URL(calls[0]!.url).searchParams.get('campaignId')).toBe('campaign-1');
    expect(calls[1]).toMatchObject({ method: 'POST', body: { executor: 'memoflow-ai', idempotencyKey: 'begin-1' } });
    expect(new URL(calls[1]!.url).pathname).toBe('/api/v1/discovery');
    expect(calls[2]).toMatchObject({
      method: 'POST',
      body: { completedAt: '2026-09-16T08:10:00.000Z', candidateCount: 2, insertedCount: 1, duplicateCount: 1, rejectedCount: 0 },
    });
    expect(new URL(calls[2]!.url).pathname).toBe('/api/v1/discovery/run-1/complete');
  });

  it('encodes SubmissionIntent recovery filters and bounded reconciliation requests', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async (input, init) => {
        const call = {
          url: String(input),
          method: init?.method ?? 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : null,
        };
        calls.push(call);
        if (call.method === 'GET') return response({ items: [], total: 0 });
        return response({ scanned: 0, committed: 0, pending: 0, manualReview: 0, skipped: 0, items: [] });
      },
    });

    await client.submissionIntents.list({
      statuses: ['external_confirmed', 'persistence_pending'],
      jobId: 'job-1',
      updatedBefore: '2026-09-17T05:00:00.000Z',
      order: 'oldest',
      limit: 25,
      offset: 5,
    });
    await client.submissionIntents.reconcilePending({
      limit: 50,
      staleBefore: '2026-09-17T04:00:00.000Z',
      maxAutomaticRetries: 5,
    });

    const listUrl = new URL(calls[0]!.url);
    expect(listUrl.pathname).toBe('/api/v1/submission-intents');
    expect(listUrl.searchParams.getAll('statuses')).toEqual(['external_confirmed', 'persistence_pending']);
    expect(listUrl.searchParams.get('jobId')).toBe('job-1');
    expect(listUrl.searchParams.get('updatedBefore')).toBe('2026-09-17T05:00:00.000Z');
    expect(listUrl.searchParams.get('order')).toBe('oldest');
    expect(listUrl.searchParams.get('limit')).toBe('25');
    expect(listUrl.searchParams.get('offset')).toBe('5');
    expect(calls[1]).toMatchObject({
      method: 'POST',
      body: { limit: 50, staleBefore: '2026-09-17T04:00:00.000Z', maxAutomaticRetries: 5 },
    });
    expect(new URL(calls[1]!.url).pathname).toBe('/api/v1/submission-intents/reconcile-pending');
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


  it('applies a bounded default request deadline and preserves explicit caller cancellation', async () => {
    let observedSignal: AbortSignal | null = null;
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      requestTimeoutMs: 25,
      fetch: async (_input, init) => {
        observedSignal = init?.signal ?? null;
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) { reject(new Error('missing request signal')); return; }
          if (signal.aborted) { reject(signal.reason); return; }
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
    });
    const started = Date.now();
    await expect(client.analytics.getPipelineStats({})).rejects.toBeDefined();
    expect(observedSignal).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('does not trust malformed REST error payloads', async () => {
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async () => response({ error: { code: 123, message: ['not', 'trusted'] } }, 500),
    });
    await expect(client.analytics.getPipelineStats({})).rejects.toMatchObject({
      status: 500,
      payload: { code: 'HTTP_ERROR', message: 'Job Harness request failed with 500' },
    });
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

describe('Resume Builder REST client', () => {
  it('uses typed first-class Resume routes', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const at = '2026-09-17T02:10:00.000Z';
    const library = {
      id: 'primary', schemaVersion: 2 as const, version: 1,
      basics: { displayName: { 'zh-CN': '测试用户' }, contact: { phone: null, email: 'test@example.com', website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
    };
    const profile = {
      id: 'agent', libraryId: 'primary', version: 1, name: { 'zh-CN': 'Agent 简历' }, targetRole: { 'zh-CN': 'Agent' }, locale: 'zh-CN' as const, templateId: 'classic-v1', positioning: { 'zh-CN': 'Agent' }, output: { documentTitle: { 'zh-CN': 'Agent 简历' }, description: null, onlineUrl: null, pdfName: null }, layout: { header: 'without-photo' as const, pageSize: 'A4' as const }, sectionOrder: ['skills' as const], educationIds: [], skillIds: [], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], createdAt: at, updatedAt: at, archivedAt: null,
    };
    const resolved = { libraryId: 'primary', libraryVersion: 1, profileId: 'agent', profileVersion: 1, locale: 'zh-CN' as const, templateId: 'classic-v1', positioning: 'Agent', output: { documentTitle: 'Agent 简历', description: null, onlineUrl: null, pdfName: null }, layout: { header: 'without-photo' as const, pageSize: 'A4' as const }, sectionOrder: ['skills' as const], basics: { displayName: '测试用户', contact: { phone: null, email: 'test@example.com', website: null, github: null, location: null }, photoAssetId: null }, education: [], skills: [], workExperiences: [], projects: [], certificates: [], summaries: [] };
    const client = createJobHarnessRestClient({ baseUrl: 'http://job-harness/api/v1', fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      const url = String(input);
      if (url.includes('/resume/preview')) return response({ resolved, html: '<html>preview</html>' });
      if (url.includes('/resume/profiles/agent')) return response({ library, profile, resolved });
      return response({ items: [profile], total: 1 });
    }});

    expect((await client.resume.listProfiles()).total).toBe(1);
    expect((await client.resume.getProfileContext('agent'))?.resolved.profileId).toBe('agent');
    expect((await client.resume.preview({ library, profile })).html).toContain('preview');
    expect(new URL(calls[0]!.url).pathname).toBe('/api/v1/resume/profiles');
  });
});
