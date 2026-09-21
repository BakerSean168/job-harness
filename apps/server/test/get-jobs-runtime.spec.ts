import { describe, expect, it } from 'vitest';
import {
  GET_JOBS_RUNTIME_DESCRIPTORS,
  createGetJobsRuntimeClient,
  createGetJobsCollectionRuntimeMcpPort,
  getJobsRuntimeRowToCandidate,
  syncGetJobsRuntimeCache,
} from '../src/get-jobs-runtime';

describe('vvvsrx/get_jobs external Site Runtime adapter', () => {
  it('describes Zhilian/Liepin/51job as discovery-only upstream runtimes', () => {
    expect(GET_JOBS_RUNTIME_DESCRIPTORS.zhilian).toMatchObject({
      runtimeId: 'get-jobs-zhilian',
      site: 'zhilian',
      implementation: 'upstream-direct',
      capabilities: ['discovery', 'inspect-job'],
      controlGranularity: 'business-task',
      upstream: { project: 'vvvsrx-get-jobs', license: 'MIT' },
    });
    expect(GET_JOBS_RUNTIME_DESCRIPTORS.liepin.site).toBe('liepin');
    expect(GET_JOBS_RUNTIME_DESCRIPTORS.job51.site).toBe('job51');
  });

  it('normalizes rich upstream rows into canonical Job Harness candidates without trusting upstream delivery state', () => {
    const zhilian = getJobsRuntimeRowToCandidate('zhilian', {
      id: 7,
      job_id: 'Z-100',
      job_title: '前端开发工程师',
      job_link: '/jobdetail/Z-100.htm',
      salary: '15-25K',
      location: '杭州',
      experience: '经验不限',
      degree: '本科',
      company_name: '测试科技',
      company_tag: '互联网',
      delivered: 1,
      created_at: '2026-09-20T09:00:00',
    }, { observedAt: '2026-09-20T10:00:00.000Z', discoveryRunId: 'run-1' });

    expect(zhilian).toMatchObject({
      companyName: '测试科技',
      title: '前端开发工程师',
      city: '杭州',
      discoveryRunId: 'run-1',
      listings: [{
        sourceKind: 'zhilian',
        externalNamespace: 'zhilian',
        externalId: 'Z-100',
        identityKind: 'external-id',
        metadataSnapshot: {
          source: 'vvvsrx-get-jobs',
          collectOnlyOverlay: true,
          upstreamDelivered: true,
          salary: '15-25K',
          experience: '经验不限',
          education: '本科',
        },
      }],
    });
    expect(zhilian?.listings[0]?.url).toBe('https://www.zhaopin.com/jobdetail/Z-100.htm');

    const sameZhilianJobFromAnotherSearch = getJobsRuntimeRowToCandidate('zhilian', {
      id: 8,
      job_id: 'legacy-md5-that-must-not-own-identity',
      job_title: '前端开发工程师',
      job_link: 'https://www.zhaopin.com/jobdetail/Z-100.htm?srccode=401901&data_identity=another-search-session',
      salary: '15-25K',
      location: '杭州',
      experience: '经验不限',
      degree: '本科',
      company_name: '测试科技',
      company_tag: '互联网',
      delivered: 0,
      created_at: '2026-09-20T09:05:00',
    });
    expect(sameZhilianJobFromAnotherSearch?.listings[0]).toMatchObject({
      externalId: 'Z-100',
      url: 'https://www.zhaopin.com/jobdetail/Z-100.htm',
    });

    expect(getJobsRuntimeRowToCandidate('zhilian', {
      id: 10,
      job_id: 'synthetic-md5-fallback',
      job_title: '前端开发工程师',
      job_link: null,
      company_name: '测试科技',
      delivered: 0,
    })).toBeNull();

    const job51 = getJobsRuntimeRowToCandidate('job51', {
      id: 9,
      job_id: 'J-9',
      job_title: '全栈开发',
      job_link: 'https://jobs.51job.com/hangzhou/9.html',
      job_salary_text: '1.5-2万',
      job_area: '杭州',
      job_edu_req: '本科',
      job_exp_req: '1年以内',
      comp_name: '示例公司',
      comp_industry: '软件',
      delivered: 0,
      created_at: '2026-09-20T09:00:00',
    }, { observedAt: '2026-09-20T10:00:00.000Z' });
    expect(job51).toMatchObject({
      companyName: '示例公司',
      title: '全栈开发',
      city: '杭州',
      listings: [{ sourceKind: 'job51', externalNamespace: 'job51', externalId: 'J-9', metadataSnapshot: { upstreamDelivered: false, comp_industry: '软件' } }],
    });
  });

  it('reads lifecycle/login health and imports cached rows without invoking upstream start/delivery endpoints', async () => {
    const calls: string[] = [];
    const fetch = async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      calls.push(`${url.pathname}${url.search}`);
      if (url.pathname === '/api/zhilian/status') {
        return new Response(JSON.stringify({ running: false, current: null, total: null, platform: null, delivered_count: 3, filtered_count: 4 }), { status: 200 });
      }
      if (url.pathname === '/api/zhilian/login-status') {
        return new Response(JSON.stringify({ success: true, isLoggedIn: true, message: '已登录' }), { status: 200 });
      }
      if (url.pathname === '/api/zhilian/list') {
        return new Response(JSON.stringify({
          success: true,
          total: 1,
          data: [{
            id: 1, job_id: 'Z-1', job_title: 'Agent 前端', job_link: 'https://www.zhaopin.com/jobdetail/Z-1.htm',
            salary: '12-20K', location: '深圳', experience: '应届生', degree: '本科', company_name: 'Example', company_tag: null,
            delivered: 0, created_at: '2026-09-20T09:00:00',
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'not-found' }), { status: 404 });
    };

    const client = createGetJobsRuntimeClient({ baseUrl: 'http://get-jobs-runtime:8000', fetch: fetch as typeof globalThis.fetch });
    await expect(client.health('zhilian')).resolves.toMatchObject({ site: 'zhilian', state: 'ready', browserConnected: false });
    const collected = await client.collectCandidates('zhilian', { limit: 20, offset: 0, observedAt: '2026-09-20T10:00:00.000Z' });
    expect(collected).toMatchObject({ total: 1, rejected: 0 });
    expect(collected.candidates).toHaveLength(1);
    expect(calls).toEqual([
      '/api/zhilian/status',
      '/api/zhilian/login-status',
      '/api/zhilian/list?limit=20&offset=0',
    ]);
    expect(calls.some((path) => path.includes('/start'))).toBe(false);
  });

  it('paginates cached upstream rows into the canonical Job sink without creating Applications from upstream delivered flags', async () => {
    const runtime: any = {
      async list(_site: string, input: { limit: number; offset: number }) {
        if (input.offset === 0) return {
          total: 3,
          items: [
            { id: 1, job_id: 'L-1', job_title: '前端工程师', job_link: 'https://www.liepin.com/job/L-1.shtml', job_salary_text: '15-25K', job_area: '杭州', job_edu_req: '本科', job_exp_req: '经验不限', comp_name: '甲公司', delivered: 1, created_at: null },
            { id: 2, job_id: 'L-2', job_title: '全栈工程师', job_link: 'https://www.liepin.com/job/L-2.shtml', job_salary_text: '20-30K', job_area: '深圳', job_edu_req: '本科', job_exp_req: '1年以内', comp_name: '乙公司', delivered: 0, created_at: null },
          ],
        };
        return {
          total: 3,
          items: [{ id: 3, job_id: null, job_title: null, job_link: null, comp_name: null, delivered: 0, created_at: null }],
        };
      },
    };
    const writes: any[] = [];
    const sink = {
      async upsertJobsBatch(input: any) {
        writes.push(input);
        return {
          items: input.jobs.map((_: unknown, index: number) => ({ index, status: index === 0 ? 'inserted' : 'duplicate', jobId: `job-${index}`, reason: null })),
        };
      },
    };
    const result = await syncGetJobsRuntimeCache(runtime, sink, {
      site: 'liepin', pageSize: 2, maxPages: 3, discoveryRunId: 'run-2', observedAt: '2026-09-20T10:00:00.000Z',
    });
    expect(result).toEqual({
      site: 'liepin', upstreamTotal: 3, scanned: 3, normalized: 2, normalizationRejected: 1,
      inserted: 1, updated: 0, duplicate: 1, persistenceRejected: 0,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].jobs[0]).toMatchObject({
      discoveryRunId: 'run-2',
      listings: [{ sourceKind: 'liepin', metadataSnapshot: { upstreamDelivered: true } }],
    });
    expect(writes[0].jobs[0]).not.toHaveProperty('application');
  });

  it('starts upstream browsing only after the Job Harness collect-only marker is verified', async () => {
    const calls: Array<{ path: string; method: string }> = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      calls.push({ path: url.pathname, method: init?.method ?? 'GET' });
      if (url.pathname === '/api/job-harness-runtime') return new Response(JSON.stringify({ integration: 'job-harness', collectOnly: true, mode: 'collect-only' }), { status: 200 });
      if (url.pathname === '/api/zhilian/login') return new Response(JSON.stringify({ success: true, message: 'login-opened', status: null }), { status: 200 });
      if (url.pathname === '/api/zhilian/start') return new Response(JSON.stringify({ success: true, message: 'started', status: 'started' }), { status: 200 });
      if (url.pathname === '/api/zhilian/stop') return new Response(JSON.stringify({ success: true, message: 'stopped', status: null }), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    const client = createGetJobsRuntimeClient({ baseUrl: 'http://get-jobs-runtime:8000', fetch: fetch as typeof globalThis.fetch });
    await expect(client.login('zhilian')).resolves.toMatchObject({ success: true, message: 'login-opened' });
    await expect(client.startCollection('zhilian')).resolves.toMatchObject({ success: true, status: 'started' });
    await expect(client.stop('zhilian')).resolves.toMatchObject({ success: true });
    expect(calls).toEqual([
      { path: '/api/job-harness-runtime', method: 'GET' },
      { path: '/api/zhilian/login', method: 'POST' },
      { path: '/api/job-harness-runtime', method: 'GET' },
      { path: '/api/zhilian/start', method: 'POST' },
      { path: '/api/zhilian/stop', method: 'POST' },
    ]);

    const unsafe = createGetJobsRuntimeClient({
      baseUrl: 'http://get-jobs-runtime:8000',
      fetch: (async (input: string | URL | Request) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
        if (url.pathname === '/api/job-harness-runtime') return new Response(JSON.stringify({ integration: 'job-harness', collectOnly: false, mode: 'upstream-default' }), { status: 200 });
        throw new Error('start must not be reached');
      }) as typeof globalThis.fetch,
    });
    await expect(unsafe.startCollection('liepin')).rejects.toThrow(/collect-only mode/);
  });

  it('derives collect-only start configuration from Campaign policy and imports via the canonical Job sink', async () => {
    const calls: Array<{ path: string; method: string; body: unknown }> = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ path: `${url.pathname}${url.search}`, method: init?.method ?? 'GET', body });
      if (url.pathname === '/api/job-harness-runtime') return new Response(JSON.stringify({ integration: 'job-harness', collectOnly: true, mode: 'collect-only' }), { status: 200 });
      if (url.pathname === '/api/zhilian/status') return new Response(JSON.stringify({ running: false, current: null, total: null, platform: null, delivered_count: 0, filtered_count: 0 }), { status: 200 });
      if (url.pathname === '/api/zhilian/login-status') return new Response(JSON.stringify({ success: true, isLoggedIn: true, message: '已登录' }), { status: 200 });
      if (url.pathname === '/api/zhilian/config' && (init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify({ success: true, config: {}, options: { city: [{ type: 'city', name: '杭州', code: '653' }] } }), { status: 200 });
      }
      if (url.pathname === '/api/zhilian/config' && init?.method === 'PUT') return new Response(JSON.stringify({ success: true, message: 'saved', status: null }), { status: 200 });
      if (url.pathname === '/api/zhilian/start') return new Response(JSON.stringify({ success: true, message: 'started', status: 'started' }), { status: 200 });
      if (url.pathname === '/api/zhilian/list') return new Response(JSON.stringify({ success: true, total: 0, data: [] }), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    const runtime = createGetJobsRuntimeClient({ baseUrl: 'http://get-jobs-runtime:8000', fetch: fetch as typeof globalThis.fetch });
    const writes: unknown[] = [];
    const port = createGetJobsCollectionRuntimeMcpPort(runtime, {
      campaigns: {
        async getCampaign(id: string) {
          return id === 'campaign-1' ? {
            id,
            name: '2026届',
            targetRoles: ['AI Agent / Agent 应用开发', '全栈开发', '前端开发'],
            cities: ['杭州', '深圳'],
            graduationYears: [2026],
            experience: ['应届生'],
            education: ['本科'],
            keywords: ['React', 'TypeScript'],
            exclusions: [],
            sources: ['zhilian'],
            resumeProfileIds: [],
            automation: {
              collection: { enabled: true },
              outreach: { enabled: true, autoStartEnabled: false, greetingEnabled: true, recruiterInboxEnabled: true, resumeFollowupEnabled: true, maxExternalEffectsPerRun: 20 },
              officialSite: { prepareEnabled: true, fillEnabled: true, submitEnabled: false, preferredResumeProfileId: null },
              email: { draftEnabled: true, sendEnabled: false, preferredResumeProfileId: null },
            },
            status: 'active' as const,
            createdAt: '2026-09-20T00:00:00.000Z',
            updatedAt: '2026-09-20T00:00:00.000Z',
          } : null;
        },
      } as any,
      jobs: {
        async upsertJobsBatch(input: unknown) { writes.push(input); return { items: [] }; },
      } as any,
    });

    await expect(port.start({ site: 'zhilian', campaignId: 'campaign-1' })).resolves.toMatchObject({
      site: 'zhilian', success: true, city: '杭州', keywords: ['Agent', '全栈开发', '前端开发'], reused: false,
    });
    const configWrite = calls.find((call) => call.path === '/api/zhilian/config' && call.method === 'PUT');
    expect(configWrite?.body).toEqual({ keywords: 'Agent,全栈开发,前端开发', cityCode: '653' });
    await expect(port.sync({ site: 'zhilian', pageSize: 100, maxPages: 1 })).resolves.toMatchObject({ site: 'zhilian', scanned: 0, inserted: 0 });
    expect(writes).toHaveLength(0);
  });

  it('rejects collection start when Campaign collection is disabled before touching upstream start', async () => {
    const calls: string[] = [];
    const runtime = createGetJobsRuntimeClient({
      baseUrl: 'http://get-jobs-runtime:8000',
      fetch: (async (input: string | URL | Request) => {
        calls.push(new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url).pathname);
        throw new Error('upstream must not be touched');
      }) as typeof globalThis.fetch,
    });
    const port = createGetJobsCollectionRuntimeMcpPort(runtime, {
      campaigns: {
        async getCampaign() {
          return {
            id: 'campaign-off', name: 'off', targetRoles: ['前端开发'], cities: ['杭州'], graduationYears: [2026], experience: [], education: [], keywords: [], exclusions: [], sources: ['zhilian'], resumeProfileIds: [],
            automation: {
              collection: { enabled: false },
              outreach: { enabled: false, autoStartEnabled: false, greetingEnabled: false, recruiterInboxEnabled: false, resumeFollowupEnabled: false, maxExternalEffectsPerRun: 0 },
              officialSite: { prepareEnabled: false, fillEnabled: false, submitEnabled: false, preferredResumeProfileId: null },
              email: { draftEnabled: false, sendEnabled: false, preferredResumeProfileId: null },
            },
            status: 'active' as const, createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
          };
        },
      } as any,
      jobs: {} as any,
    });
    await expect(port.start({ site: 'zhilian', campaignId: 'campaign-off' })).rejects.toThrow(/collection disabled/);
    expect(calls).toEqual([]);
  });

  it('reports an unreachable upstream as offline without making the MCP status tool fail', async () => {
    const client = createGetJobsRuntimeClient({
      baseUrl: 'http://get-jobs-runtime:8000',
      fetch: (async () => { throw new Error('connection refused'); }) as typeof globalThis.fetch,
    });
    await expect(client.health('liepin')).resolves.toMatchObject({ site: 'liepin', state: 'offline', browserConnected: false });
    const port = createGetJobsCollectionRuntimeMcpPort(client, { campaigns: {} as any, jobs: {} as any });
    await expect(port.status({ site: 'liepin' })).resolves.toMatchObject({
      descriptor: { runtimeId: 'get-jobs-liepin' },
      health: { site: 'liepin', state: 'offline', browserConnected: false },
      collectOnly: true,
      mode: 'collect-only',
    });
  });

  it('uses a short independent timeout budget for offline health probes', async () => {
    const fetch = (async (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return reject(new Error('missing abort signal'));
      if (signal.aborted) return reject(signal.reason ?? new Error('aborted'));
      signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
    })) as typeof globalThis.fetch;
    const client = createGetJobsRuntimeClient({
      baseUrl: 'http://get-jobs-runtime:8000',
      fetch,
      requestTimeoutMs: 5_000,
      healthTimeoutMs: 100,
    });
    const startedAt = Date.now();
    await expect(client.health('job51')).resolves.toMatchObject({ site: 'job51', state: 'offline', browserConnected: false });
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});
