import { describe, expect, it } from 'vitest';
import type { JobSearchCampaign } from '@job-harness/contracts';
import { LiepinDiscoveryProvider } from '../src/liepin-provider';

const campaign: JobSearchCampaign = {
  id: 'campaign-1', name: 'AI jobs', targetRoles: ['AI Agent / Agent 应用开发'], cities: ['杭州'], graduationYears: [2026], experience: [], education: [],
  keywords: ['Agent'], exclusions: [], sources: ['liepin'], resumeProfileIds: ['ai-agent-forgeflow'], status: 'active',
  createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
};
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
function card(overrides: any = {}) {
  return {
    comp: { compName: '示例科技', compScale: '500-999人', compStage: '融资未公开', compIndustry: '计算机软件' },
    job: { jobId: '79344877', jobKind: '1', title: 'AI Agent', refreshTime: '20260916084902', dq: '杭州', salary: '30-50k·16薪', requireWorkYears: '经验不限', requireEduLevel: '本科', link: 'https://www.liepin.com/a/79344877.shtml?tracking=x#y', labels: ['Agent'] },
    recruiter: { recruiterTitle: '猎头顾问', imShowText: '1天前在线', chatted: false },
    ...overrides,
  };
}

describe('LiepinDiscoveryProvider', () => {
  it('uses the anonymous PC search API and deduplicates the same job across campaign terms', async () => {
    const calls: Array<{ url: string; body: any; headers: Headers }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return json({ flag: 1, data: { data: { jobCardList: [card()] }, pagination: {} } });
    };
    const provider = new LiepinDiscoveryProvider({ fetch: fakeFetch, queryDelayMs: 0, maxTerms: 3, pagesPerQuery: 1, pageSize: 40, detailEnrichment: false, traceIdFactory: () => 'trace-fixture', now: () => '2026-09-18T10:50:00.000Z' });
    const result = await provider.discover(campaign);
    expect(result.queryCount).toBe(3);
    expect(result.failedQueryCount).toBe(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ companyName: '示例科技', title: 'AI Agent', city: '杭州', description: null, observedAt: '2026-09-18T10:50:00.000Z' });
    expect(result.candidates[0]!.listings[0]).toMatchObject({
      sourceKind: 'liepin', url: 'https://www.liepin.com/a/79344877.shtml', externalNamespace: 'liepin', externalId: '1:79344877', identityKind: 'external-id', status: 'active',
      publishedAt: '2026-09-16T00:49:02.000Z',
      metadataSnapshot: { jobKind: '1', salary: '30-50k·16薪', experience: '经验不限', education: '本科', companyScale: '500-999人', industry: '计算机软件', recruiterChatted: false, queryCities: ['杭州'] },
    });
    expect((result.candidates[0]!.listings[0]!.metadataSnapshot.searchTerms as string[]).sort()).toEqual(['AI Agent','Agent','Agent 应用开发'].sort());
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url).toBe('https://api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job');
    expect(calls[0]!.headers.get('x-client-type')).toBe('web');
    expect(calls[0]!.headers.get('x-fscp-std-info')).toBe('{"client_id":"40108"}');
    expect(calls[0]!.body).toMatchObject({ data: { mainSearchPcConditionForm: { city: '070020', dq: '070020', currentPage: 0, pageSize: 40, key: 'AI Agent' } } });
  });

  it('isolates temporary query failures and derives enterprise direct-hire URLs without trusting arbitrary hosts', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls += 1;
      if (calls === 2) return json({ error: 'temporary' }, 503);
      return json({ flag: 1, data: { data: { jobCardList: [card({ job: { ...card().job, jobId: '12345', jobKind: '2', link: 'not-a-url' } })] } } });
    };
    const provider = new LiepinDiscoveryProvider({ fetch: fakeFetch, queryDelayMs: 0, maxTerms: 2, pagesPerQuery: 1, detailEnrichment: false, traceIdFactory: () => 'trace' });
    const result = await provider.discover(campaign);
    expect(result.failedQueryCount).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.listings[0]!.url).toBe('https://www.liepin.com/job/12345.shtml');
  });

  it('filters promoted cross-city, stale and title-irrelevant cards before they enter the Job ledger', async () => {
    const fakeFetch: typeof fetch = async () => json({ flag: 1, data: { data: { jobCardList: [
      card(),
      card({ job: { ...card().job, jobId: '2', link: 'https://www.liepin.com/job/2.shtml', jobKind: '2', dq: '广州-增城区' } }),
      card({ job: { ...card().job, jobId: '3', link: 'https://www.liepin.com/job/3.shtml', jobKind: '2', title: '财务专员' } }),
      card({ job: { ...card().job, jobId: '4', link: 'https://www.liepin.com/job/4.shtml', jobKind: '2', refreshTime: '20240101000000' } }),
    ] } } });
    const provider = new LiepinDiscoveryProvider({ fetch: fakeFetch, queryDelayMs: 0, maxTerms: 1, maxAgeDays: 60, detailEnrichment: false, now: () => '2026-09-18T10:50:00.000Z', traceIdFactory: () => 'trace' });
    const result = await provider.discover(campaign);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.title).toBe('AI Agent');
    expect(result.diagnostics).toMatchObject({ filteredCityCount: 1, filteredIntentCount: 1, filteredStaleCount: 1 });
  });

  it('enriches only high-potential entry-level cards from bounded JobPosting JSON-LD details', async () => {
    const detailHtml = `<!doctype html><script type="application/ld+json">${JSON.stringify({ '@context':'https://schema.org','@type':'JobPosting',title:'AI Agent开发工程师',datePosted:'2026-09-17',description:'<p>负责 Agent Harness、MCP、RAG。</p><p>要求 TypeScript / Python。</p>' })}</script>`;
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      calls.push(String(input));
      if (init?.method === 'GET') return new Response(detailHtml, { status: 200, headers: { 'content-type':'text/html' } });
      return json({ flag:1,data:{data:{jobCardList:[card({job:{...card().job,title:'AI Agent开发工程师',requireWorkYears:'经验不限',requireEduLevel:'本科'}})]}}});
    };
    const provider = new LiepinDiscoveryProvider({ fetch: fakeFetch, queryDelayMs:0, maxTerms:1, detailEnrichment:true, detailDelayMs:0, maxDetailCandidates:2, now:()=> '2026-09-18T10:50:00.000Z', traceIdFactory:()=> 'trace' });
    const result = await provider.discover({ ...campaign, experience:['经验不限'], education:['本科','学历不限'] });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.description).toContain('Agent Harness、MCP、RAG');
    expect(result.candidates[0]!.listings[0]!.metadataSnapshot).toMatchObject({ detailEnriched:true, detailDatePosted:'2026-09-17' });
    expect(result.diagnostics).toMatchObject({ detailAttemptCount:1, detailSuccessCount:1, detailFailedCount:0 });
    expect(calls.filter((url)=>url.includes('liepin.com/a/'))).toHaveLength(1);
  });

  it('prioritizes direct-hire and newest candidates for bounded detail enrichment', async () => {
    const detailHtml = `<!doctype html><script type="application/ld+json">${JSON.stringify({ '@type':'JobPosting', description:'Direct hire Agent role' })}</script>`;
    const detailCalls: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      if (init?.method === 'GET') { detailCalls.push(String(input)); return new Response(detailHtml, { status: 200 }); }
      return json({ flag:1,data:{data:{jobCardList:[
        card({job:{...card().job,jobId:'1',jobKind:'1',title:'AI Agent开发工程师',link:'https://www.liepin.com/a/1.shtml',refreshTime:'20260918090000',requireWorkYears:'经验不限',requireEduLevel:'本科'}}),
        card({job:{...card().job,jobId:'2',jobKind:'2',title:'AI Agent开发工程师',link:'https://www.liepin.com/job/2.shtml',refreshTime:'20260917090000',requireWorkYears:'经验不限',requireEduLevel:'本科'}}),
      ]}}});
    };
    const provider = new LiepinDiscoveryProvider({ fetch:fakeFetch,queryDelayMs:0,maxTerms:1,detailEnrichment:true,detailDelayMs:0,maxDetailCandidates:1,now:()=> '2026-09-18T10:50:00.000Z',traceIdFactory:()=> 'trace' });
    const result = await provider.discover({ ...campaign, experience:['经验不限'], education:['本科'] });
    expect(detailCalls).toEqual(['https://www.liepin.com/job/2.shtml']);
    const direct = result.candidates.find((item)=>item.listings[0]?.url==='https://www.liepin.com/job/2.shtml');
    expect(direct?.description).toBe('Direct hire Agent role');
    expect(direct?.listings[0]?.metadataSnapshot.detailFetchedAt).toBeUndefined();
  });

  it('fails closed for campaign cities whose Liepin code has not been verified', () => {
    const provider = new LiepinDiscoveryProvider();
    expect(() => provider.plan({ ...campaign, cities: ['金华'] })).toThrow(/no verified code/);
  });
});
