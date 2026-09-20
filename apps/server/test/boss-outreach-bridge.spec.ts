import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApplicantProfileContextSchema } from '@job-harness/applicant-contracts';
import { JobSearchCampaignSchema } from '@job-harness/contracts';
import { ListResumeProfilesOutputSchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { createBossOutreachBridge, decideBossJob } from '../src/boss-outreach-bridge';
import { patchBossResumeFollowupUserscript } from '../src/boss-resume-followup';

const zh = (value: string) => ({ 'zh-CN': value });
const at = '2026-09-18T06:30:00.000Z';
let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });

function profile(id: string, role: string) {
  return ResumeProfileSchema.parse({
    id, libraryId: 'primary', version: 1, name: zh(role), targetRole: zh(role), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh(role),
    output: { documentTitle: zh(role), description: null, onlineUrl: null, pdfName: zh(`${id}.pdf`) }, layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: [], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], createdAt: at, updatedAt: at, archivedAt: null,
  });
}

function client() {
  const profiles = ListResumeProfilesOutputSchema.parse({ items: [
    profile('ai-agent-app', 'AI Agent / 大模型应用开发工程师'),
    profile('ai-agent-dongxu', 'AI Agent / Multi-Agent 应用开发工程师'),
    profile('ai-agent-forgeflow', 'AI Agent / 大模型应用开发工程师（ForgeFlow 版）'),
    profile('ai-frontend', '前端开发工程师'),
    profile('ai-fullstack', '全栈开发工程师'),
  ], total: 5 });
  const applicant = ApplicantProfileContextSchema.parse({
    profile: { id: 'default', version: 1, displayName: '测试候选人', phone: null, email: 'candidate@example.test', location: null, website: null, github: null, education: [{ id: 'edu-1', school: '测试大学', major: '物联网工程', degree: '本科', department: null, location: null, startMonth: '2022-09', endMonth: '2026-06' }], targetRoles: ['AI Agent'], targetCities: ['杭州'], availableFrom: '立即', notes: null, createdAt: at, updatedAt: at },
    latestRevision: { id: 'applicant-rev-1', profileId: 'default', revisionNumber: 1, profileVersion: 1, snapshot: { id: 'default', version: 1, displayName: '测试候选人', phone: null, email: 'candidate@example.test', location: null, website: null, github: null, education: [{ id: 'edu-1', school: '测试大学', major: '物联网工程', degree: '本科', department: null, location: null, startMonth: '2022-09', endMonth: '2026-06' }], targetRoles: ['AI Agent'], targetCities: ['杭州'], availableFrom: '立即', notes: null, createdAt: at, updatedAt: at }, contentHash: 'a'.repeat(64), createdAt: at, createdBy: 'system' },
  });
  const campaign = JobSearchCampaignSchema.parse({
    id: 'campaign-1', name: '2026届前端', targetRoles: ['前端开发'], cities: ['杭州'], graduationYears: [2026],
    experience: ['经验不限', '无经验', '应届生', '实习生', '1年以内', '1-3年'], education: ['本科'], keywords: ['Vue3', 'React'], exclusions: [], sources: ['boss'], resumeProfileIds: profiles.items.map((item) => item.id), status: 'active', createdAt: at, updatedAt: at,
  });
  return {
    applicant: { async getProfile() { return applicant; } },
    resume: {
      async listProfiles() { return profiles; },
      async getProfileContext() { return null; },
    },
    campaigns: { async get() { return campaign; } },
  };
}

const payload = '# 职位名称\nAgent开发工程师\n\n# 薪资范围\n15-25K\n\n# 职位描述\n负责 Agent Harness、Orchestration、Tool Calling、Memory、Planning、MCP、多智能体 Supervisor 系统。';

describe('Job Harness BOSS outreach bridge', () => {
  it('keeps deterministic scoring separate from recruiter-facing copy generation', async () => {
    const decision = await decideBossJob(client(), payload);
    expect(decision).toMatchObject({ profileId: 'ai-agent-forgeflow', resumeIndex: 0, decision: 'strong-match', introduce: '' });
    expect(decision.score).toBeGreaterThanOrEqual(80);
    expect(decision.signals).toContain('Agent Harness');
  });

  it('falls back to a truthful local greeting when ChatGPT does not resolve in time', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-bridge-'));
    const logPath = join(dir, 'events.jsonl');
    const server = createBossOutreachBridge({ client: client(), publicBaseUrl: 'https://boss-bridge.example.test', logPath, baseDelayMs: 0, delayJitterMs: 0, greetingWaitMs: 1_000, campaignId: 'campaign-1' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing server address');
      const base = `http://127.0.0.1:${address.port}`;
      const response = await fetch(`${base}/p/ai-agent-app/get-job-score`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
      expect(response.status).toBe(200);
      const decision = await response.json() as { introduce: string; greetingRequestId?: string };
      expect(decision.greetingRequestId).toBeTruthy();
      expect(decision.introduce).not.toContain('物联网工程');
      expect(decision.introduce).not.toContain('测试大学');
      expect(decision.introduce).toContain('Agent Harness');
      expect(decision.introduce).toContain('Agent开发工程师');
      const rows = (await readFile(logPath, 'utf8')).trim().split(/\n/).map((line) => JSON.parse(line));
      expect(rows.some((row) => row.action === 'greeting_assist_timeout_fallback' && row.greetingRequestId === decision.greetingRequestId)).toBe(true);
      const pending = await fetch(`${base}/api/greetings/pending`);
      expect(await pending.json()).toMatchObject({ total: 0, items: [] });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('blocks explicit 3+ year requirements for an early-career campaign before creating a greeting request', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-bridge-'));
    const logPath = join(dir, 'events.jsonl');
    const server = createBossOutreachBridge({ client: client(), publicBaseUrl: 'https://boss-bridge.example.test', logPath, baseDelayMs: 0, delayJitterMs: 0, greetingWaitMs: 5_000, campaignId: 'campaign-1' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing server address');
      const base = `http://127.0.0.1:${address.port}`;
      const seniorPayload = '# 职位名称\n前端开发工程师\n\n# 薪资范围\n20-40K\n\n# 职位描述\n我们正在寻找拥有3年以上经验的前端工程师，要求 React、TypeScript、Vue、Vite。';
      const score = await fetch(`${base}/p/ai-agent-app/get-job-score`, { method: 'POST', body: JSON.stringify(seniorPayload), headers: { 'content-type': 'application/json' } });
      const blocked = await score.json() as { score: number; policyBlocked?: boolean; policyReason?: string; introduce?: string };
      expect(blocked).toMatchObject({ policyBlocked: true, policyReason: 'explicit-minimum-experience-3-years', introduce: '' });
      expect(blocked.score).toBeLessThan(58);
      const pending = await fetch(`${base}/api/greetings/pending`);
      expect(await pending.json()).toMatchObject({ total: 0, items: [] });
      const rows = (await readFile(logPath, 'utf8')).trim().split(/\n/).map((line) => JSON.parse(line));
      expect(rows.at(-1)).toMatchObject({ action: 'job_hard_requirement_blocked', minimumExperienceYears: 3 });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('lets ChatGPT skip a semantic mismatch without sending a recruiter-facing greeting', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-bridge-'));
    const logPath = join(dir, 'events.jsonl');
    const server = createBossOutreachBridge({ client: client(), publicBaseUrl: 'https://boss-bridge.example.test', logPath, baseDelayMs: 0, delayJitterMs: 0, greetingWaitMs: 5_000, campaignId: 'campaign-1' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing server address');
      const base = `http://127.0.0.1:${address.port}`;
      const scorePromise = fetch(`${base}/p/ai-agent-app/get-job-score`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
      let requestId = '';
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const pending = await fetch(`${base}/api/greetings/pending`);
        const body = await pending.json() as { items?: Array<{ id?: string }> };
        requestId = body.items?.[0]?.id ?? '';
        if (requestId) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(requestId).not.toBe('');
      const resolved = await fetch(`${base}/api/greetings/${requestId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action: 'skip', reason: '核心技术栈与当前真实经历明显不匹配', source: 'chatgpt-web-test' }),
        headers: { 'content-type': 'application/json' },
      });
      expect(await resolved.json()).toMatchObject({ ok: true, id: requestId, action: 'skip', source: 'chatgpt-web-test' });
      const score = await scorePromise;
      const decision = await score.json() as { score: number; introduce?: string; policyBlocked?: boolean; policyReason?: string };
      expect(decision.policyBlocked).toBe(true);
      expect(decision.score).toBeLessThan(58);
      expect(decision.introduce).toBe('');
      expect(decision.policyReason).toContain('chatgpt-skip:');
      const rows = (await readFile(logPath, 'utf8')).trim().split(/\n/).map((line) => JSON.parse(line));
      expect(rows.some((row) => row.action === 'greeting_skipped' && row.greetingRequestId === requestId)).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('closes BOSS observe/contact events into durable Job/outreach identities', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-bridge-'));
    const logPath = join(dir, 'events.jsonl');
    const persistedOutreach: any[] = [];
    const h: any = client();
    h.jobs = {
      async upsertJobsBatch() { return { items: [{ index: 0, status: 'inserted', jobId: 'boss-job-1', reason: null }] }; },
    };
    h.workspace = {
      async getJobDetail() {
        return {
          job: { listings: [{ id: 'boss-listing-1', sourceKind: 'boss', externalId: 'abc123', url: 'https://www.zhipin.com/job_detail/abc123.html' }] },
        };
      },
    };
    h.outreach = { async record(input: any) { persistedOutreach.push(input); return { id: 'outreach-1', ...input, createdAt: input.occurredAt }; } };
    const server = createBossOutreachBridge({ client: h, publicBaseUrl: 'https://boss-bridge.example.test', logPath, baseDelayMs: 0, delayJitterMs: 0, greetingWaitMs: 5_000, campaignId: 'campaign-1' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing server address');
      const base = `http://127.0.0.1:${address.port}`;
      const observed = await fetch(`${base}/p/ai-agent-app/observe-job`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          job: payload,
          company: '示例科技', city: '深圳', jobUrl: 'https://www.zhipin.com/job_detail/abc123.html', screeningSessionId: 'screen-1',
        }),
      });
      expect(await observed.json()).toMatchObject({ success: true, jobId: 'boss-job-1', listingId: 'boss-listing-1' });
      const logged = await fetch(`${base}/p/ai-agent-app/log-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'job_already_talked', scene: 'search', title: 'Agent开发工程师', jobId: 'boss-job-1', listingId: 'boss-listing-1', jobUrl: 'https://www.zhipin.com/job_detail/abc123.html' }),
      });
      expect(logged.status).toBe(200);
      expect(persistedOutreach).toHaveLength(1);
      expect(persistedOutreach[0]).toMatchObject({ jobId: 'boss-job-1', listingId: 'boss-listing-1', channel: 'boss', type: 'already_contacted' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('reuses the Resume Profile from the durable greeting history for recruiter follow-up and persists replies/sends', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-bridge-'));
    const logPath = join(dir, 'events.jsonl');
    const persistedOutreach: any[] = [];
    const h: any = client();
    h.jobs = {
      async upsertJobsBatch() { return { items: [{ index: 0, status: 'updated', jobId: 'boss-job-followup', reason: null }] }; },
    };
    h.workspace = {
      async getJobDetail() {
        return {
          job: { listings: [{ id: 'boss-listing-followup', sourceKind: 'boss', externalId: 'followup123', url: 'https://www.zhipin.com/job_detail/followup123.html' }] },
        };
      },
    };
    h.outreach = {
      async list() {
        return { total: 1, items: [{
          id: 'outreach-greeting-1', jobId: 'boss-job-followup', listingId: 'boss-listing-followup', channel: 'boss', type: 'greeting_sent', occurredAt: at,
          actor: 'system', resumeProfileId: 'ai-fullstack', message: 'hello', externalThreadUrl: null, metadata: { score: 76 }, idempotencyKey: 'greeting-history-1', createdAt: at,
        }] };
      },
      async record(input: any) { persistedOutreach.push(input); return { id: `outreach-${persistedOutreach.length}`, ...input, createdAt: input.occurredAt }; },
    };
    const server = createBossOutreachBridge({ client: h, publicBaseUrl: 'https://boss-bridge.example.test', logPath, baseDelayMs: 0, delayJitterMs: 0, greetingWaitMs: 1_000, campaignId: 'campaign-1' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing server address');
      const base = `http://127.0.0.1:${address.port}`;
      const contextResponse = await fetch(`${base}/p/ai-agent-app/get-followup-context`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          job: payload, company: '示例科技', city: '深圳', jobUrl: 'https://www.zhipin.com/job_detail/followup123.html',
        }),
      });
      expect(contextResponse.status).toBe(200);
      const context = await contextResponse.json() as any;
      expect(context).toMatchObject({ jobId: 'boss-job-followup', listingId: 'boss-listing-followup', profileId: 'ai-fullstack', resumeIndex: 2, score: 76, resumeBindingSource: 'greeting-history' });

      const reply = await fetch(`${base}/p/ai-agent-app/log-action`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          action: 'recruiter_replied', scene: 'browser-bridge-followup', jobId: context.jobId, listingId: context.listingId,
          jobUrl: 'https://www.zhipin.com/job_detail/followup123.html', title: 'Agent开发工程师', resumeIndex: context.resumeIndex,
          message: '可以发份简历看看吗', intent: 'explicit-resume-request', resumeBindingSource: context.resumeBindingSource,
        }),
      });
      expect(reply.status).toBe(200);
      const sent = await fetch(`${base}/p/ai-agent-app/log-action`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          action: 'resume_sent', scene: 'browser-bridge-followup', jobId: context.jobId, listingId: context.listingId,
          jobUrl: 'https://www.zhipin.com/job_detail/followup123.html', title: 'Agent开发工程师', resumeIndex: context.resumeIndex,
          resumeBindingSource: context.resumeBindingSource,
        }),
      });
      expect(sent.status).toBe(200);
      expect(persistedOutreach).toHaveLength(2);
      expect(persistedOutreach[0]).toMatchObject({ type: 'recruiter_replied', jobId: 'boss-job-followup', resumeProfileId: 'ai-fullstack', message: '可以发份简历看看吗' });
      expect(persistedOutreach[1]).toMatchObject({ type: 'resume_sent', jobId: 'boss-job-followup', resumeProfileId: 'ai-fullstack' });
      expect(persistedOutreach[0].idempotencyKey).toMatch(/^boss-outreach:boss-job-followup:recruiter_replied:/);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('serves the existing userscript endpoints and keeps resume-send/multiturn paths blocked', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-boss-bridge-'));
    const logPath = join(dir, 'events.jsonl');
    const followupSource = `// ==UserScript==
// @name         Old
// @namespace    old
// @version      1
// @description  old
// @match        https://www.zhipin.com/*
// ==/UserScript==
const OPTIONS={ onlyGreet: true, // 是否只打招呼，默认为false，即打招呼和代聊天
};
const JAC_HARD_ONLY_GREET = true;
async function x(){
                                status(\`检测到新消息，直接发送简历（简历索引 \${decision.resumeIndex}）\`);
                                const resumeResult = await sendResume(decision.resumeIndex);
                                    await sendMsg('不好意思，不太合适哈，祝早日找到合适的人选。')
}`;
    const resumeFollowupUserscript = patchBossResumeFollowupUserscript(followupSource, { publicUrl: 'https://boss-bridge.example.test/boss-resume-followup.user.js' });
    const server = createBossOutreachBridge({ client: client(), publicBaseUrl: 'https://boss-bridge.example.test', logPath, baseDelayMs: 0, delayJitterMs: 0, greetingWaitMs: 5_000, campaignId: 'campaign-1', resumeFollowupUserscript });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing server address');
      const base = `http://127.0.0.1:${address.port}`;
      const health = await fetch(`${base}/api/health`);
      expect(await health.json()).toMatchObject({ ok: true, service: 'job-harness-boss-outreach-bridge', mode: 'auto-resume-followup', discovery: false, resumeFollowup: true, greetingMode: 'chatgpt-assisted-with-safe-fallback', greetingWaitMs: 5_000, greetingFallback: 'job-harness-deterministic' });
      const clientConfig = await fetch(`${base}/p/ai-agent-app/client-config`);
      expect(await clientConfig.json()).toMatchObject({
        frontend: { preloadStableRoundsLimit: 8, preloadMaxRounds: 30 },
      });

      const reporter = await fetch(`${base}/boss-discovery-reporter.user.js`);
      expect(reporter.status).toBe(200);
      expect(reporter.headers.get('content-type')).toContain('text/javascript');
      expect(await reporter.text()).toContain('/api/discovery/report');
      const followup = await fetch(`${base}/boss-resume-followup.user.js`);
      expect(followup.status).toBe(200);
      expect(await followup.text()).toContain('const JAC_HARD_ONLY_GREET = false;');

      const scorePromise = fetch(`${base}/p/ai-agent-app/get-job-score`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
      let pending: { total: number; items: Array<{ id: string; job: { title: string }; candidate: Record<string, unknown>; guidance: string[] }> } | null = null;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const response = await fetch(`${base}/api/greetings/pending`);
        const body = await response.json() as typeof pending;
        if (body && body.total > 0) { pending = body; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(pending?.total).toBe(1);
      expect(pending?.items[0]).toMatchObject({ job: { title: 'Agent开发工程师' } });
      expect(pending?.items[0]?.candidate).toMatchObject({ displayName: '测试候选人' });
      expect(pending?.items[0]?.guidance.join(' ')).toContain('不使用固定文案模板');
      const greetingRequestId = pending!.items[0]!.id;
      const greeting = '您好，看到贵司 Agent 开发岗位，我做过 Agent Harness 与多智能体编排相关项目，和岗位方向比较契合，希望有机会进一步沟通，谢谢。';
      const resolved = await fetch(`${base}/api/greetings/${greetingRequestId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ message: greeting, source: 'chatgpt-web-test' }),
        headers: { 'content-type': 'application/json' },
      });
      expect(await resolved.json()).toMatchObject({ ok: true, id: greetingRequestId, action: 'send', source: 'chatgpt-web-test' });
      const score = await scorePromise;
      expect(await score.json()).toMatchObject({ profileId: 'ai-agent-forgeflow', resumeIndex: 0, introduce: greeting, greetingRequestId });

      const logged = await fetch(`${base}/p/ai-agent-app/log-action`, { method: 'POST', body: JSON.stringify({ action: 'greet_sent', scene: 'search', title: 'Agent开发工程师', resumeIndex: 0, unexpectedSecret: 'must-not-persist' }), headers: { 'content-type': 'application/json' } });
      expect(await logged.json()).toEqual({ success: true });
      const rows = (await readFile(logPath, 'utf8')).trim().split(/\n/).map((line) => JSON.parse(line));
      expect(rows.at(-1)).toMatchObject({ action: 'greet_sent', recommendedProfileId: 'ai-agent-forgeflow' });
      expect(rows.at(-1)).not.toHaveProperty('unexpectedSecret');

      const resumeNeed = await fetch(`${base}/p/ai-agent-app/is-need-resume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        msgs: [{ role: 'assistant', content: '您好' }, { role: 'user', content: '方便聊一下吗' }],
        needResume: 0, resumeSended: false, title: 'Agent开发工程师', company: '示例科技', salary: '15-25K', score: 90, resumeIndex: 0,
      }) });
      expect(await resumeNeed.json()).toEqual({ need: false, intent: 'question', reason: 'recruiter-question' });
      const reply = await fetch(`${base}/p/ai-agent-app/reply`, { method: 'POST', body: JSON.stringify('hello') });
      expect(reply.status).toBe(409);
      expect(await reply.json()).toMatchObject({ error: 'resume_followup_mode' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
