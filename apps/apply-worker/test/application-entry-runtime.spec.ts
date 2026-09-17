import { describe, expect, it } from 'vitest';
import type { BrowserControlSnapshot, BrowserDriverPort } from '@job-harness/apply-browser';
import { ExecutionAttemptSchema, type ExecutionAttempt } from '@job-harness/apply-contracts';
import { ApplySiteAdapterRegistry, InMemoryApplicantDataProvider, NowcoderAtsSiteAdapter } from '@job-harness/apply-adapters';
import { FormFillExecutionEngine } from '../src/form-fill-engine';

function attempt(allowApplicationEntry: boolean): ExecutionAttempt {
  return ExecutionAttemptSchema.parse({
    id: `attempt-entry-${allowApplicationEntry ? 'on' : 'off'}`,
    intentId: `intent-entry-${allowApplicationEntry ? 'on' : 'off'}`,
    executorId: 'worker-entry',
    requiredAdapterId: 'nowcoder-ats',
    adapterId: null,
    adapterVersion: null,
    preferredBrowserBackend: 'fake',
    browserBackend: null,
    browserSessionHandoff: null,
    executionMode: 'fill_only',
    state: 'claimed',
    leaseOwner: 'worker-entry',
    leaseExpiresAt: '2099-01-01T00:00:00.000Z',
    lastHeartbeatAt: '2026-09-17T12:00:00.000Z',
    checkpoint: null,
    externalEffectState: 'not_crossed',
    requiredCapabilities: ['humanControl'],
    policySnapshot: { allowFormFill: true, allowApplicationEntry },
    bundle: {
      intentId: `intent-entry-${allowApplicationEntry ? 'on' : 'off'}`,
      attemptId: `attempt-entry-${allowApplicationEntry ? 'on' : 'off'}`,
      jobId: 'job-1',
      listingId: 'listing-1',
      listingUrl: 'https://www.nowcoder.com/jobs/detail/457892',
      company: 'Fixture',
      title: 'Frontend Engineer',
      city: '杭州',
      resumeProfileId: null,
      resumeRevisionId: null,
      resumeArtifact: null,
      applicantCatalogVersion: null,
      answerSetVersion: null,
      answerSetHash: null,
      policySnapshot: {},
      createdAt: '2026-09-17T12:00:00.000Z',
    },
    bundleHash: 'a'.repeat(64),
    dispatchRequestHash: 'b'.repeat(64),
    reviewHash: null,
    submitAuthorizationId: null,
    errorCode: null,
    errorSummary: null,
    startedAt: null,
    completedAt: null,
    idempotencyKey: `dispatch-entry-${allowApplicationEntry ? 'on' : 'off'}`,
    createdAt: '2026-09-17T12:00:00.000Z',
    updatedAt: '2026-09-17T12:00:00.000Z',
  });
}

function browser(clicks: string[]): BrowserDriverPort {
  let state: 'detail' | 'login' = 'detail';
  const sparse: BrowserControlSnapshot[] = [
    { controlRef: '#search', kind: 'text', label: '输入职位关键字', name: 'keyword', description: null, required: false, disabled: false, readOnly: false, options: [], semanticHints: ['keyword'], accept: null, multiple: false, sectionLabel: null },
  ];
  const login: BrowserControlSnapshot[] = [
    { controlRef: '#phone', kind: 'tel', label: '手机号', name: 'phone', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['phone'], accept: null, multiple: false, sectionLabel: null },
    { controlRef: '#code', kind: 'text', label: '验证码', name: 'code', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['code'], accept: null, multiple: false, sectionLabel: null },
  ];
  return {
    async navigate() {},
    currentUrl: () => state === 'detail' ? 'https://www.nowcoder.com/jobs/detail/457892' : 'https://www.nowcoder.com/login',
    async title() { return state === 'detail' ? 'AI 软件开发工程师_英特尔校招_牛客网' : '登录'; },
    async bodyText() { return state === 'detail' ? '职位详情 立即申请' : '手机号登录 获取验证码'; },
    async exists() { return true; },
    async text() { return null; },
    async fill() { throw new Error('application entry must stop before fill'); },
    async select() { throw new Error('application entry must stop before select'); },
    async setChecked() { throw new Error('application entry must stop before check'); },
    async click(selector) {
      if (selector !== '#apply') throw new Error(`unexpected click: ${selector}`);
      clicks.push(selector);
      state = 'login';
    },
    async upload() { throw new Error('application entry must stop before upload'); },
    async wait() {},
    async screenshot() { return new Uint8Array(); },
    async scanControls() { return state === 'detail' ? sparse : login; },
    async scanActions() {
      return state === 'detail'
        ? [{ actionRef: '#apply', tag: 'button' as const, text: '立即申请', href: null, type: 'button', role: null, disabled: false, ariaDisabled: false }]
        : [];
    },
    async formStateHash() { throw new Error('application entry must stop before review hash'); },
  };
}

function engine() {
  const applicant = new InMemoryApplicantDataProvider('must-not-read', []);
  applicant.catalog = async () => { throw new Error('application entry must stop before applicant catalog access'); };
  return new FormFillExecutionEngine({ siteAdapters: new ApplySiteAdapterRegistry([new NowcoderAtsSiteAdapter()]), applicant });
}

describe('site-specific application entry policy', () => {
  it('does not click a job-detail CTA without an explicit frozen allowApplicationEntry policy', async () => {
    const clicks: string[] = [];
    const result = await engine().execute({ attempt: attempt(false), browser: browser(clicks), observedAt: '2026-09-17T12:00:00.000Z' });
    expect(result).toMatchObject({ outcome: 'handoff_required', reasonCode: 'application_entry_required', payload: { pageState: 'job_detail' } });
    expect(clicks).toEqual([]);
  });

  it('allows exactly one characterized Nowcoder entry action then stops at login without applicant-data access', async () => {
    const clicks: string[] = [];
    const result = await engine().execute({ attempt: attempt(true), browser: browser(clicks), observedAt: '2026-09-17T12:00:00.000Z' });
    expect(clicks).toEqual(['#apply']);
    expect(result).toMatchObject({
      outcome: 'handoff_required',
      reasonCode: 'login_required',
      payload: {
        pageState: 'login_required',
        applicationEntry: {
          actionText: '立即申请',
          actionTag: 'button',
          beforeState: 'job_detail',
          afterState: 'login_required',
          navigationActionCount: 1,
        },
      },
    });
  });
});
