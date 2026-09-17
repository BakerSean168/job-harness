import { describe, expect, it } from 'vitest';
import { BrowserBackendRegistry, type BrowserBackendPort, type BrowserDriverPort, type BrowserSessionPort } from '@job-harness/apply-browser';
import { ExecutionAttemptSchema, type ExecutionAttempt, type ExecutorDescriptor } from '@job-harness/apply-contracts';
import { ApplySiteAdapterRegistry, type ApplySiteAdapter } from '@job-harness/apply-adapters';
import { ApplyWorker, type ApplyWorkerClientPort } from '../src/runtime';
import { SubmitExecutionEngine } from '../src/submit-engine';

const descriptor: ExecutorDescriptor = {
  executorId: 'submit-worker', name: 'Submit Worker', version: '0.2.0', hostLabel: 'test', status: 'ready',
  browserBackends: ['fake'], adapterIds: ['fixture-submit'], executionModes: ['review_then_submit'],
  capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: true, semanticMapping: false }, maxConcurrency: 1, metadata: {},
};

function authorizedAttempt(): ExecutionAttempt {
  return ExecutionAttemptSchema.parse({
    id: 'attempt-submit-1', intentId: 'intent-submit-1', executorId: 'submit-worker', requiredAdapterId: 'fixture-submit', adapterId: 'fixture-submit', adapterVersion: '1.0.0',
    preferredBrowserBackend: 'fake', browserBackend: 'fake', browserSessionHandoff: { backendId: 'fake', sessionRef: 'fake-session-1', humanControlUrl: 'https://viewer.example.test/ui', retainedAt: '2026-09-17T15:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' },
    executionMode: 'review_then_submit', state: 'claimed', leaseOwner: 'submit-worker', leaseExpiresAt: '2099-01-01T00:00:00.000Z', lastHeartbeatAt: '2026-09-17T15:01:00.000Z', checkpoint: 'review-ready',
    externalEffectState: 'not_crossed', requiredCapabilities: ['humanControl'], policySnapshot: {},
    bundle: { intentId: 'intent-submit-1', attemptId: 'attempt-submit-1', jobId: 'job-1', listingId: 'listing-1', listingUrl: 'https://jobs.example.test/apply', company: 'Example', title: 'Frontend Engineer', city: 'Hangzhou', resumeProfileId: null, resumeRevisionId: null, resumeArtifact: null, applicantCatalogVersion: 'fixture-v1', answerSetVersion: null, answerSetHash: null, policySnapshot: {}, createdAt: '2026-09-17T15:00:00.000Z' },
    bundleHash: 'a'.repeat(64), dispatchRequestHash: 'b'.repeat(64), reviewHash: 'c'.repeat(64), submitAuthorizationId: 'auth-1', errorCode: null, errorSummary: null, startedAt: '2026-09-17T15:00:30.000Z', completedAt: null, idempotencyKey: 'dispatch-submit-1', createdAt: '2026-09-17T15:00:00.000Z', updatedAt: '2026-09-17T15:01:00.000Z',
  });
}

function backend(log: string[]): BrowserBackendPort {
  const driver: BrowserDriverPort = {
    async navigate() { throw new Error('authorized resume must not navigate a fresh page'); },
    currentUrl: () => 'https://jobs.example.test/apply',
    async title() { return 'Apply'; }, async bodyText() { return 'Ready'; }, async exists() { return true; }, async text() { return null; },
    async fill() { throw new Error('authorized submit must not refill'); }, async select() { throw new Error('authorized submit must not reselect'); }, async setChecked() { throw new Error('authorized submit must not recheck'); },
    async click(selector) { log.push(`click:${selector}`); }, async upload() { throw new Error('not used'); }, async wait() {}, async screenshot() { return new Uint8Array(); }, async scanActions() { return []; }, async scanControls() { return []; }, async formStateHash() { log.push('form-hash'); return 'd'.repeat(64); },
  };
  const session: BrowserSessionPort = {
    backendId: 'fake', sessionId: 'fake-session-1', humanControlUrl: 'https://viewer.example.test/ui', driver: () => driver,
    async persist() {}, async retainForHuman() { throw new Error('not used'); }, async release() { log.push('release'); },
  };
  return {
    id: 'fake', describe: () => ({ id: 'fake', kind: 'managed-remote', persistentSession: true, humanControl: true, metadata: {} }),
    async health() { return { ok: true, detail: null }; }, async acquire() { throw new Error('must resume retained session'); }, async resume() { log.push('resume-browser'); return session; }, async reapExpired() { return 0; },
  };
}

function submitAdapter(log: string[]): ApplySiteAdapter {
  return {
    descriptor: { id: 'fixture-submit', version: '1.0.0', semantics: 'formal_application', priority: 100, capabilities: { inspect: false, fill: false, validate: false, submit: true } },
    probe: ({ url }) => ({ supported: new URL(url).hostname === 'jobs.example.test', score: 1, reason: 'fixture' }),
    async inspect() { throw new Error('not used'); },
    async validate() { return { readyForReview: true, readyForSubmit: true, issues: [] }; },
    async submit(browser) {
      log.push('adapter-submit');
      await browser.click('#submit');
      return { outcome: 'success', appliedAt: '2026-09-17T15:03:00.000Z', confirmedAt: '2026-09-17T15:03:01.000Z', externalReference: 'confirmation-1', evidence: { confirmationKind: 'fixture' }, error: null };
    },
  };
}

function client(attempt: ExecutionAttempt, log: string[], beginFails = false): ApplyWorkerClientPort {
  let claimed = false;
  return {
    executors: { async register() {}, async heartbeat(input) { log.push(`executor:${input.status}`); } },
    attempts: {
      async claim() { if (claimed) return null; claimed = true; return { attempt, leaseToken: `lease-${'x'.repeat(48)}` }; },
      async start() { log.push('start'); return { ...attempt, state: 'running' }; },
      async heartbeat() { return attempt; },
      async createReviewSnapshot() { throw new Error('not used'); },
      async beginSubmit() { log.push('begin-submit'); if (beginFails) throw new Error('lost begin response'); return { attemptId: attempt.id, state: 'running', externalEffectState: 'crossed' }; },
      async reportSubmitSuccess() { log.push('report-success'); return { ...attempt, state: 'completed', externalEffectState: 'crossed' }; },
      async reportSubmitFailure(input) { log.push(`report-failure:${input.outcome}`); return { ...attempt, state: 'failed', externalEffectState: input.outcome === 'uncertain' ? 'uncertain' : 'crossed' }; },
      async waiting() { throw new Error('not used'); }, async complete() { throw new Error('not used'); }, async fail() { throw new Error('not used'); },
    },
  };
}

describe('authorized supervised submit worker', () => {
  it('gets durable boundary permission before exactly one site click, then reports exact success', async () => {
    const log: string[] = [];
    const attempt = authorizedAttempt();
    const worker = new ApplyWorker({
      client: client(attempt, log), backends: new BrowserBackendRegistry([backend(log)]), descriptor, backendId: 'fake',
      submitEngine: new SubmitExecutionEngine({ siteAdapters: new ApplySiteAdapterRegistry([submitAdapter(log)]) }), logger: { log() {}, warn() {}, error() {} },
    });
    expect(await worker.runOnce()).toEqual({ claimed: true, attemptId: attempt.id, outcome: 'completed' });
    expect(log.indexOf('begin-submit')).toBeLessThan(log.indexOf('adapter-submit'));
    expect(log.indexOf('adapter-submit')).toBeLessThan(log.indexOf('click:#submit'));
    expect(log.indexOf('click:#submit')).toBeLessThan(log.indexOf('report-success'));
    expect(log.filter((entry) => entry === 'click:#submit')).toHaveLength(1);
  });

  it('never clicks when the begin-submit response is unavailable, even though the server might have crossed the boundary', async () => {
    const log: string[] = [];
    const attempt = authorizedAttempt();
    const worker = new ApplyWorker({
      client: client(attempt, log, true), backends: new BrowserBackendRegistry([backend(log)]), descriptor, backendId: 'fake',
      submitEngine: new SubmitExecutionEngine({ siteAdapters: new ApplySiteAdapterRegistry([submitAdapter(log)]) }), logger: { log() {}, warn() {}, error() {} },
    });
    expect(await worker.runOnce()).toEqual({ claimed: true, attemptId: attempt.id, outcome: 'failed' });
    expect(log).toContain('begin-submit');
    expect(log).not.toContain('adapter-submit');
    expect(log).not.toContain('click:#submit');
    expect(log.some((entry) => entry.startsWith('report-'))).toBe(false);
  });
});
