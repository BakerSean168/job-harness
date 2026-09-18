import { describe, expect, it } from 'vitest';
import { DiscoveryQualificationProcessor } from '../src/qualification';

const listing = (sourceKind: string, url = sourceKind === 'liepin' ? 'https://www.liepin.com/job/123456.shtml' : 'https://www.zhaopin.com/jobdetail/CC1.htm') => ({ id: `listing-${sourceKind}`, sourceKind, label: null, url, externalNamespace: null, externalId: null, identityKind: 'url', status: 'active', firstSeenAt: '2026-09-18T10:00:00.000Z', lastSeenAt: '2026-09-18T10:00:00.000Z', publishedAt: null, closedAt: null, metadataSnapshot: {} });
function item(id: string, title: string, sourceKind = 'zhilian', state = 'discovered') {
  return { jobId: id, companyId: `company-${id}`, companyName: 'Example', title, city: '杭州', state, application: null, primaryListing: listing(sourceKind), listingCount: 1, sourceKinds: [sourceKind], campaigns: [{ id: 'campaign-1', name: 'AI jobs' }], resume: null, firstSeenAt: '2026-09-18T10:00:00.000Z', lastSeenAt: '2026-09-18T10:00:00.000Z' } as any;
}
function recommendation(score: number, titleScore: number, riskSignals: any[] = []) {
  return { jobId: 'x', recommendedProfileId: 'ai-agent-app', recommendationDelta: 0, items: [{ profileId: 'ai-agent-app', profileName: 'Agent', targetRole: 'AI Agent', score, decision: score >= 72 ? 'strong-match' : score >= 52 ? 'review' : 'low-match', family: 'agent', latestRevisionId: 'rev-1', latestPdfArtifactId: 'pdf-1', executable: true, breakdown: { titleScore, detailScore: 0, supportScore: 0, comboScore: 0, specializationScore: 0, titlePenaltyScore: 0, penaltyScore: 0 }, positiveSignals: [], riskSignals }] } as any;
}

describe('DiscoveryQualificationProcessor', () => {
  it('dry-runs title-only and full-JD qualification without mutating Job state or preparing intents', async () => {
    const jobs = [item('agent-card','AI Agent开发工程师'), item('frontend-card','前端开发工程师'), item('product-card','AI Agent产品经理'), item('boss-card','AI Agent开发工程师','boss')];
    const states: any[] = []; const prepares: any[] = [];
    const client: any = {
      campaigns: { async get() { return { id: 'campaign-1', name: 'AI jobs', targetRoles: [], cities: ['杭州'], graduationYears: [2026], experience: ['经验不限','1-3年'], education: ['本科','学历不限'], keywords: [], exclusions: [], sources: ['zhilian'], resumeProfileIds: [], status: 'active', createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z' }; } },
      workspace: {
        async getDiscoveryRunDetail() { return { run: { id: 'run-1', campaignId: 'campaign-1' }, campaign: { id: 'campaign-1', name: 'AI jobs' }, affectedJobs: jobs, observationCount: 4 }; },
        async getJobDetail(id: string) { const i=jobs.find((x:any)=>x.jobId===id); return { job: { id, title:i.title, description: null, listings:[i.primaryListing] }, primaryListing:{...i.primaryListing,metadataSnapshot:{experience:'经验不限',education:'本科'}}, application:null, observations:[], campaigns:[] }; },
      },
      jobs: {
        async recommendResumes(id: string) { if (id==='frontend-card') return recommendation(30,30); return recommendation(42,42); },
        async setJobState(input:any) { states.push(input); return {}; },
        async prepareRecommendedSubmission(id:string,input:any) { prepares.push({id,input}); return {}; },
      },
      submissionIntents: { async list() { return { items: [], total: 0 }; } },
    };
    const result = await new DiscoveryQualificationProcessor(client, { dryRun: true, minScore: 58, titleOnlyMinTitleScore: 28 }).run('run-1');
    expect(result).toMatchObject({ evaluated: 4, qualified: 3, preparable: 0, stateChanges: 0, prepared: 0, skippedLowMatch: 1, skippedChannel: 0, skippedTitleOnlyPrepare: 3, dryRun: true });
    expect(result.qualifiedSamples).toEqual(expect.arrayContaining([expect.objectContaining({ jobId: 'agent-card', profileId: 'ai-agent-app', score: 42, titleOnly: true })]));
    expect(states).toEqual([]); expect(prepares).toEqual([]);
  });

  it('honors Campaign experience constraints using provider listing metadata', async () => {
    const jobs=[item('junior','AI Agent开发工程师'),item('senior','AI Agent开发工程师')];
    const client:any={
      campaigns:{async get(){return {id:'campaign-1',name:'AI jobs',targetRoles:[],cities:['杭州'],graduationYears:[2026],experience:['经验不限','1-3年'],education:['本科','学历不限'],keywords:[],exclusions:[],sources:['liepin'],resumeProfileIds:[],status:'active',createdAt:'2026-09-18T00:00:00.000Z',updatedAt:'2026-09-18T00:00:00.000Z'};}},
      workspace:{
        async getDiscoveryRunDetail(){return {run:{id:'run-exp',campaignId:'campaign-1'},campaign:{id:'campaign-1',name:'AI jobs'},affectedJobs:jobs,observationCount:2};},
        async getJobDetail(id:string){const i=jobs.find((x:any)=>x.jobId===id);return {job:{id,title:i.title,description:null,listings:[i.primaryListing]},primaryListing:{...i.primaryListing,metadataSnapshot:{experience:id==='junior'?'1-3年':'3-5年',education:'本科'}},application:null,observations:[],campaigns:[]};},
      },
      jobs:{async recommendResumes(){return recommendation(42,42);},async setJobState(){return{};},async prepareRecommendedSubmission(){return{};}},
      submissionIntents:{async list(){return {items:[],total:0};}},
    };
    const result=await new DiscoveryQualificationProcessor(client,{dryRun:true}).run('run-exp');
    expect(result).toMatchObject({evaluated:2,qualified:1,preparable:0,skippedLowMatch:1,skippedTitleOnlyPrepare:1});
  });

  it('shortlists, prepares idempotently eligible formal jobs, skips existing intents and isolates per-job failures', async () => {
    const jobs = [item('new','AI Agent开发工程师'), item('existing','AI Agent开发工程师','liepin','shortlisted'), item('bad','AI Agent开发工程师')];
    const states: any[]=[]; const prepares:any[]=[];
    const client:any={
      campaigns:{async get(){return {id:'campaign-1',name:'AI jobs',targetRoles:[],cities:['杭州'],graduationYears:[2026],experience:['经验不限','1-3年'],education:['本科','学历不限'],keywords:[],exclusions:[],sources:['zhilian'],resumeProfileIds:[],status:'active',createdAt:'2026-09-18T00:00:00.000Z',updatedAt:'2026-09-18T00:00:00.000Z'};}},
      workspace:{
        async getDiscoveryRunDetail(){return {run:{id:'run-2',campaignId:'campaign-1'},campaign:{id:'campaign-1',name:'AI jobs'},affectedJobs:jobs,observationCount:3};},
        async getJobDetail(id:string){const i=jobs.find((x:any)=>x.jobId===id); return {job:{id,title:i.title,description:'负责 Agent MCP RAG',listings:[i.primaryListing]},primaryListing:{...i.primaryListing,metadataSnapshot:{experience:'1-3年',education:'本科'}},application:null,observations:[],campaigns:[]};},
      },
      jobs:{
        async recommendResumes(id:string){if(id==='bad') throw new Error('fixture failure'); return recommendation(78,42);},
        async setJobState(input:any){states.push(input);return{};},
        async prepareRecommendedSubmission(id:string,input:any){prepares.push({id,input});return{};},
      },
      submissionIntents:{async list(input:any){return input.jobId==='existing'?{items:[{id:'intent-1'}],total:1}:{items:[],total:0};}},
    };
    const result=await new DiscoveryQualificationProcessor(client,{dryRun:false,autoPrepare:true}).run('run-2');
    expect(result).toMatchObject({evaluated:2,qualified:2,stateChanges:1,preparable:1,prepared:1,existingIntents:1});
    expect(result.failures).toEqual([{jobId:'bad',error:'fixture failure'}]);
    expect(states[0]).toMatchObject({jobId:'new',state:'shortlisted',idempotencyKey:'qualification:new:shortlist'});
    expect(prepares[0]).toMatchObject({id:'new',input:{preferredProfileId:'ai-agent-app',executor:'browser-extension',idempotencyKey:'qualification:new:ai-agent-app:prepare'}});
  });
});
