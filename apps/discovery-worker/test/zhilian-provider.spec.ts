import { describe, expect, it } from 'vitest';
import type { JobSearchCampaign } from '@job-harness/contracts';
import { ZhilianDiscoveryProvider } from '../src/zhilian-provider';

const campaign: JobSearchCampaign = {
  id: 'campaign-1', name: 'AI jobs', targetRoles: ['AI Agent / Agent 应用开发'], cities: ['杭州'], graduationYears: [2026], experience: [],
  keywords: ['Agent'], exclusions: [], sources: ['zhilian'], resumeProfileIds: ['ai-agent-forgeflow'], status: 'active',
  createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('ZhilianDiscoveryProvider', () => {
  it('uses the current anonymous POST search API, resolves city codes and deduplicates the same position across terms', async () => {
    const calls: Array<{ url: string; method: string; body: any; headers: Headers }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ url, method, body, headers });
      if (url.includes('/city-page/user-city')) return json({ code: 200, data: { name: '杭州', code: '653' } });
      return json({
        code: 200,
        data: { list: [{
          jobId: 40890562710,
          number: 'CC378282510J40890562710',
          name: 'AI Agent开发工程师',
          companyName: '可利邦',
          companyNumber: 'CZ378282510',
          workCity: '杭州',
          salary60: '2-2.5万',
          workingExp: '1-3年',
          education: '本科',
          industryName: '人工智能',
          hasAppliedPosition: false,
          jobDetailData: { position: { desc: { description: '<div>负责 Agent 系统<br/>MCP 与 Tool Calling</div>', labels: ['人工智能'] }, base: { positionNumber: 'CC378282510J40890562710' } } },
        }] },
      });
    };
    const provider = new ZhilianDiscoveryProvider({ fetch: fakeFetch, queryDelayMs: 0, maxTerms: 3, pageSize: 20, pagesPerQuery: 1, clientId: 'fixture-client', now: () => '2026-09-18T09:50:00.000Z' });
    const result = await provider.discover(campaign);

    expect(result.queryCount).toBe(3);
    expect(result.failedQueryCount).toBe(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      companyName: '可利邦', title: 'AI Agent开发工程师', city: '杭州', description: '负责 Agent 系统\nMCP 与 Tool Calling', observedAt: '2026-09-18T09:50:00.000Z',
      listings: [{ sourceKind: 'zhilian', url: 'https://www.zhaopin.com/jobdetail/CC378282510J40890562710.htm', externalNamespace: 'zhilian', externalId: 'CC378282510J40890562710', identityKind: 'external-id', status: 'active' }],
    });
    expect(result.candidates[0]!.listings[0]!.metadataSnapshot).toMatchObject({
      salary: '2-2.5万', experience: '1-3年', education: '本科', industry: '人工智能', hasAppliedPosition: false,
      queryCities: ['杭州'],
    });
    expect((result.candidates[0]!.listings[0]!.metadataSnapshot.searchTerms as string[]).sort()).toEqual(['AI Agent', 'Agent', 'Agent 应用开发'].sort());

    expect(calls[0]!.url).toContain('/city-page/user-city?ipCity=%E6%9D%AD%E5%B7%9E');
    const searchCalls = calls.slice(1);
    expect(searchCalls).toHaveLength(3);
    expect(searchCalls[0]!.method).toBe('POST');
    expect(searchCalls[0]!.url).toContain('/c/i/search/positions');
    expect(searchCalls[0]!.url).toContain('x-zp-client-id=fixture-client');
    expect(searchCalls[0]!.headers.get('x-zp-platform')).toBe('13');
    expect(searchCalls[0]!.body).toMatchObject({ S_SOU_WORK_CITY: '653', pageIndex: 1, pageSize: 20, anonymous: 1, platform: 13 });
  });

  it('keeps successful queries when one query is temporarily unavailable', async () => {
    let searchCalls = 0;
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/city-page/user-city')) return json({ code: 200, data: { name: '杭州', code: '653' } });
      searchCalls += 1;
      if (searchCalls === 2) return json({ error: 'temporary' }, 503);
      return json({ code: 200, data: { list: [{ jobId: '1', number: 'CC1J1', name: 'Agent工程师', companyName: 'Example', workCity: '杭州', jobSummary: 'Agent' }] } });
    };
    const provider = new ZhilianDiscoveryProvider({ fetch: fakeFetch, queryDelayMs: 0, maxTerms: 2, pagesPerQuery: 1, clientId: 'fixture' });
    const result = await provider.discover(campaign);
    expect(result.queryCount).toBe(2);
    expect(result.failedQueryCount).toBe(1);
    expect(result.candidates).toHaveLength(1);
  });
});
