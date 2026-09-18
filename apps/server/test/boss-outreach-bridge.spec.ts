import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApplicantProfileContextSchema } from '@job-harness/applicant-contracts';
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
  return {
    applicant: { async getProfile() { return applicant; } },
    resume: { async listProfiles() { return profiles; } },
  };
}

const payload = '# 职位名称\nAgent开发工程师\n\n# 薪资范围\n15-25K\n\n# 职位描述\n负责 Agent Harness、Orchestration、Tool Calling、Memory、Planning、MCP、多智能体 Supervisor 系统。';

describe('Job Harness BOSS outreach bridge', () => {
  it('keeps the legacy score response shape while dynamically selecting the best of five resumes', async () => {
    const decision = await decideBossJob(client(), payload);
    expect(decision).toMatchObject({ profileId: 'ai-agent-forgeflow', resumeIndex: 0, decision: 'strong-match' });
    expect(decision.score).toBeGreaterThanOrEqual(80);
    expect(decision.introduce).toContain('测试大学');
    expect(decision.introduce).toContain('Agent Harness');
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
    const server = createBossOutreachBridge({ client: client(), publicBaseUrl: 'https://boss-bridge.example.test', logPath, baseDelayMs: 0, delayJitterMs: 0, resumeFollowupUserscript });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing server address');
      const base = `http://127.0.0.1:${address.port}`;
      const health = await fetch(`${base}/api/health`);
      expect(await health.json()).toMatchObject({ ok: true, service: 'job-harness-boss-outreach-bridge', mode: 'auto-resume-followup', discovery: false, resumeFollowup: true });
      const reporter = await fetch(`${base}/boss-discovery-reporter.user.js`);
      expect(reporter.status).toBe(200);
      expect(reporter.headers.get('content-type')).toContain('text/javascript');
      expect(await reporter.text()).toContain('/api/discovery/report');
      const followup = await fetch(`${base}/boss-resume-followup.user.js`);
      expect(followup.status).toBe(200);
      expect(await followup.text()).toContain('const JAC_HARD_ONLY_GREET = false;');

      const score = await fetch(`${base}/p/ai-agent-app/get-job-score`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
      expect(await score.json()).toMatchObject({ profileId: 'ai-agent-forgeflow', resumeIndex: 0 });

      const logged = await fetch(`${base}/p/ai-agent-app/log-action`, { method: 'POST', body: JSON.stringify({ action: 'greet_sent', scene: 'search', title: 'Agent开发工程师', resumeIndex: 0, unexpectedSecret: 'must-not-persist' }), headers: { 'content-type': 'application/json' } });
      expect(await logged.json()).toEqual({ success: true });
      const rows = (await readFile(logPath, 'utf8')).trim().split(/\n/).map((line) => JSON.parse(line));
      expect(rows.at(-1)).toMatchObject({ action: 'greet_sent', recommendedProfileId: 'ai-agent-forgeflow' });
      expect(rows.at(-1)).not.toHaveProperty('unexpectedSecret');

      const resumeNeed = await fetch(`${base}/p/ai-agent-app/is-need-resume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        msgs: [{ role: 'assistant', content: '您好' }, { role: 'user', content: '方便聊一下吗' }],
        needResume: 0, resumeSended: false, title: 'Agent开发工程师', company: '示例科技', salary: '15-25K', score: 90, resumeIndex: 0,
      }) });
      expect(await resumeNeed.json()).toEqual({ need: true, reason: 'qualified-followup' });
      const reply = await fetch(`${base}/p/ai-agent-app/reply`, { method: 'POST', body: JSON.stringify('hello') });
      expect(reply.status).toBe(409);
      expect(await reply.json()).toMatchObject({ error: 'resume_followup_mode' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
