import { describe, expect, it } from 'vitest';
import type { BossBridgeClient } from '../src/bridge-client';
import type { BossInspectedConversation } from '../src/outreach-extension';
import { runBossResumeFollowup } from '../src/followup-runtime';

function conversation(overrides: Partial<BossInspectedConversation['snapshot']> = {}): BossInspectedConversation {
  return {
    contact: { contactRef: '[data-job-harness-boss-contact-id="jhc-0"]', recruiter: '李女士', company: '四化信息科技', preview: '可以发份简历吗' },
    snapshot: {
      url: 'https://www.zhipin.com/web/geek/chat',
      messages: [{ role: 'user', content: '可以发份简历吗' }],
      latestRole: 'user',
      needResume: 1,
      resumeSended: false,
      jobUrl: 'https://www.zhipin.com/job_detail/abc.html',
      jobText: '前端开发工程师',
      title: '前端开发工程师',
      recruiter: '李女士',
      company: '四化信息科技',
      bodyText: 'chat',
      ...overrides,
    },
  };
}

function bridge(policyNeed = true) {
  const logs: Record<string, unknown>[] = [];
  const value: BossBridgeClient = {
    async listKeywords() { return []; },
    async reportDiscovery() {},
    async logDecision() {},
    async score() {
      return { score: 71, introduce: 'hello', resumeIndex: 1, profileId: 'ai-frontend', profileLabel: '前端开发工程师', decision: 'review' };
    },
    async resolveFollowupContext() {
      return { score: 71, introduce: 'hello', resumeIndex: 1, profileId: 'ai-frontend', profileLabel: '前端开发工程师', decision: 'review', jobId: 'job-1', listingId: 'listing-1', resumeBindingSource: 'greeting-history' };
    },
    async authorizeResumeFollowup(_profileId, input) {
      if (input.resumeSended) return { need: false, intent: 'explicit-resume-request', reason: 'already-sent' };
      return policyNeed
        ? { need: true, intent: 'explicit-resume-request', reason: 'explicit-request' }
        : { need: false, intent: 'question', reason: 'recruiter-question' };
    },
    async logAction(_profileId, input) { logs.push(input); },
  };
  return { bridge: value, logs };
}

describe('BOSS resume follow-up runtime', () => {
  it('sends exactly the policy-authorized Resume Profile for an unread recruiter request', async () => {
    const b = bridge(true);
    const sent: any[] = [];
    const result = await runBossResumeFollowup({
      bridge: b.bridge,
      outreach: {
        async inspectUnreadChats() { return [conversation()]; },
        async inspectJobDetail() {
          return { url: 'https://www.zhipin.com/job_detail/abc.html', title: '前端开发工程师', salary: '9-13K', detail: 'Vue3 React TypeScript', company: '四化信息科技', city: '深圳', talked: true };
        },
        async sendResumeFollowup(input) {
          sent.push(input);
          return { status: 'sent', selectedResumeIndex: input.resumeIndex, mode: 'resume_list' };
        },
      },
      profileId: 'ai-agent-app',
      threshold: 58,
      sendEnabled: true,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result).toMatchObject({ inspected: 1, policyAuthorized: 1, resumesSent: 1, skipped: 0 });
    expect(sent).toEqual([expect.objectContaining({
      jobUrl: 'https://www.zhipin.com/job_detail/abc.html',
      resumeLabel: '前端开发工程师',
      score: 71,
      threshold: 58,
      authorizationReason: 'explicit-request',
    })]);
    expect(b.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'resume_followup_policy_authorized', resumeIndex: 1 }),
      expect.objectContaining({ action: 'resume_sent', sendStatus: 'sent' }),
    ]));
  });

  it('does not send for read/no-recruiter messages, already-sent resumes, or denied policy', async () => {
    const b = bridge(false);
    let sends = 0;
    const result = await runBossResumeFollowup({
      bridge: b.bridge,
      outreach: {
        async inspectUnreadChats() {
          return [
            conversation({ latestRole: 'assistant' }),
            conversation({ resumeSended: true }),
            conversation(),
          ];
        },
        async inspectJobDetail() {
          return { url: 'https://www.zhipin.com/job_detail/abc.html', title: '前端开发工程师', salary: '9-13K', detail: 'Vue3 React', company: '四化信息科技', city: '深圳', talked: true };
        },
        async sendResumeFollowup() {
          sends += 1;
          return { status: 'sent', selectedResumeIndex: 1, mode: 'resume_list' };
        },
      },
      profileId: 'ai-agent-app',
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(sends).toBe(0);
    expect(result).toMatchObject({ inspected: 3, policyAuthorized: 0, resumesSent: 0, skipped: 3 });
    expect(result.items.map((item) => item.reason)).toEqual(['latest-not-recruiter', 'already-sent', 'recruiter-question']);
  });

  it('can observe and persist an explicit resume request while external resume sending stays disabled', async () => {
    const b = bridge(true);
    let sends = 0;
    const result = await runBossResumeFollowup({
      bridge: b.bridge,
      outreach: {
        async inspectUnreadChats() { return [conversation()]; },
        async inspectJobDetail() {
          return { url: 'https://www.zhipin.com/job_detail/abc.html', title: '前端开发工程师', salary: '9-13K', detail: 'Vue3 React TypeScript', company: '四化信息科技', city: '深圳', talked: true };
        },
        async sendResumeFollowup() {
          sends += 1;
          return { status: 'sent', selectedResumeIndex: 1, mode: 'resume_list' };
        },
      },
      profileId: 'ai-agent-app',
      sendEnabled: false,
      logger: { log() {}, warn() {}, error() {} },
    });
    expect(sends).toBe(0);
    expect(result).toMatchObject({ inspected: 1, policyAuthorized: 1, resumesSent: 0, skipped: 1 });
    expect(result.items[0]).toMatchObject({ status: 'send-disabled', reason: 'send-disabled' });
    expect(b.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'recruiter_replied', intent: 'explicit-resume-request' }),
      expect.objectContaining({ action: 'resume_followup_send_disabled', reason: 'explicit-request' }),
    ]));
  });

  it('fails closed when the semantic resume sender cannot prove the selected resume', async () => {
    const b = bridge(true);
    const result = await runBossResumeFollowup({
      bridge: b.bridge,
      outreach: {
        async inspectUnreadChats() { return [conversation()]; },
        async inspectJobDetail() {
          return { url: 'https://www.zhipin.com/job_detail/abc.html', title: '前端开发工程师', salary: null, detail: 'Vue', company: '四化信息科技', city: '深圳', talked: true };
        },
        async sendResumeFollowup() {
          return { status: 'resume_selection_unprovable', reason: 'cannot prove index' };
        },
      },
      profileId: 'ai-agent-app',
      sendEnabled: true,
      logger: { log() {}, warn() {}, error() {} },
    });
    expect(result).toMatchObject({ policyAuthorized: 1, resumesSent: 0, skipped: 1 });
    expect(result.items[0]).toMatchObject({ status: 'resume_selection_unprovable', reason: 'cannot prove index' });
  });
});
