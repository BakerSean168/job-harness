import { describe, expect, it } from 'vitest';
import { BrowserBackendRegistry, type BrowserBackendPort, type BrowserDriverPort, type BrowserSessionPort } from '@job-harness/apply-browser';
import { ExecutionAttemptSchema, type ExecutionAttempt, type ExecutorDescriptor } from '@job-harness/apply-contracts';
import { ApplyWorker, type ApplyWorkerClientPort } from '../src/runtime';

const descriptor: ExecutorDescriptor = {
  executorId: 'test-worker',
  name: 'Test Worker',
  version: '0.2.0',
  hostLabel: 'test',
  status: 'ready',
  browserBackends: ['fake'],
  adapterIds: ['readiness-v1'],
  executionModes: ['fill_only'],
  capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: true, semanticMapping: false },
  maxConcurrency: 1,
  metadata: { test: true },
};

function attempt(policySnapshot: Record<string, unknown>): ExecutionAttempt {
  return ExecutionAttemptSchema.parse({
    id: 'attempt-1',
    intentId: 'intent-1',
    executorId: 'test-worker',
    requiredAdapterId: 'readiness-v1',
    adapterId: null,
    adapterVersion: null,
    preferredBrowserBackend: 'fake',
    browserBackend: null,
    executionMode: 'fill_only',
    state: 'claimed',
    leaseOwner: 'test-worker',
    leaseExpiresAt: '2026-09-17T10:10:00.000Z',
    lastHeartbeatAt: '2026-09-17T10:00:00.000Z',
    checkpoint: null,
    externalEffectState: 'not_crossed',
    requiredCapabilities: ['humanControl'],
    policySnapshot,
    bundle: {
      intentId: 'intent-1',
      attemptId: 'attempt-1',
      jobId: 'job-1',
      listingId: 'listing-1',
      listingUrl: 'https://example.com/apply',
      company: 'Example',
      title: 'Frontend Engineer',
      city: '杭州',
      resumeProfileId: null,
      resumeRevisionId: null,
      resumeArtifact: null,
      applicantCatalogVersion: null,
      answerSetVersion: null,
      answerSetHash: null,
      policySnapshot,
      createdAt: '2026-09-17T10:00:00.000Z',
    },
    bundleHash: 'a'.repeat(64),
    dispatchRequestHash: 'b'.repeat(64),
    reviewHash: null,
    submitAuthorizationId: null,
    errorCode: null,
    errorSummary: null,
    startedAt: null,
    completedAt: null,
    idempotencyKey: 'dispatch-1',
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T10:00:00.000Z',
  });
}

function fakeBackend(log: string[], options: { healthy?: boolean; failNavigate?: boolean } = {}): BrowserBackendPort {
  const driver: BrowserDriverPort = {
    async navigate(url) { log.push(`navigate:${url}`); if (options.failNavigate) throw new Error('navigation exploded'); },
    currentUrl: () => 'https://example.com/apply?step=1',
    async title() { return 'Example Application'; },
    async bodyText() { return 'Application form'; },
    async exists() { return false; },
    async text() { return null; },
    async fill() { throw new Error('readiness worker must not fill'); },
    async select() { throw new Error('readiness worker must not select'); },
    async setChecked() { throw new Error('readiness worker must not check'); },
    async click() { throw new Error('readiness worker must not click'); },
    async upload() { throw new Error('readiness worker must not upload'); },
    async wait() {},
    async screenshot() { return new Uint8Array(); },
    async scanControls() { return []; },
    async formStateHash() { return 'a'.repeat(64); },
  };
  const session: BrowserSessionPort = {
    backendId: 'fake',
    sessionId: 'browser-session-1',
    humanControlUrl: 'https://viewer.example/session/1',
    driver: () => driver,
    async persist() { log.push('persist'); },
    async release() { log.push('release'); },
  };
  return {
    id: 'fake',
    describe: () => ({ id: 'fake', kind: 'managed-remote', persistentSession: true, humanControl: true, metadata: {} }),
    async health() { return { ok: options.healthy !== false, detail: options.healthy === false ? 'down' : null }; },
    async acquire() { log.push('acquire'); return session; },
  };
}

function fakeClient(claimed: ExecutionAttempt | null, log: string[]): ApplyWorkerClientPort {
  return {
    executors: {
      async register(input) { log.push(`register:${input.executorId}`); return {}; },
      async heartbeat(input) { log.push(`executor:${input.status}`); return {}; },
    },
    attempts: {
      async claim() { log.push('claim'); return claimed ? { attempt: claimed, leaseToken: `lease-${'x'.repeat(40)}` } : null; },
      async start(input) { log.push(`start:${input.adapterId}:${input.browserBackend}`); return { ...claimed!, state: 'running' }; },
      async heartbeat() { log.push('attempt-heartbeat'); return claimed!; },
      async createReviewSnapshot() { return { id: 'review-1', reviewHash: 'c'.repeat(64) }; },
      async beginSubmit() { throw new Error('not used'); },
      async reportSubmitSuccess() { throw new Error('not used'); },
      async reportSubmitFailure() { throw new Error('not used'); },
      async waiting(input) { log.push(`waiting:${input.reasonCode}`); return { ...claimed!, state: 'waiting_for_user' }; },
      async complete(input) { log.push(`complete:${String(input.payload?.readinessOnly)}`); return { ...claimed!, state: 'completed' }; },
      async fail(input) { log.push(`fail:${input.errorCode}:${input.externalEffectState}`); return { ...claimed!, state: 'failed' }; },
    },
  };
}

describe('ApplyWorker R019-C readiness mode', () => {
  it('performs a read-only readiness check through the backend contract and never calls mutating browser primitives', async () => {
    const log: string[] = [];
    const worker = new ApplyWorker({
      client: fakeClient(attempt({ readinessOnly: true }), log),
      backends: new BrowserBackendRegistry([fakeBackend(log)]),
      descriptor,
      backendId: 'fake',
      attemptHeartbeatIntervalMs: 60_000,
      logger: { log() {}, warn() {}, error() {} },
    });
    const result = await worker.runOnce();
    expect(result).toEqual({ claimed: true, attemptId: 'attempt-1', outcome: 'completed' });
    expect(log).toContain('navigate:https://example.com/apply');
    expect(log).toContain('persist');
    expect(log).toContain('release');
    expect(log).toContain('complete:true');
    expect(log.some((entry) => entry.startsWith('fail:'))).toBe(false);
  });

  it('fails closed into human waiting when readinessOnly policy was not explicitly frozen', async () => {
    const log: string[] = [];
    const worker = new ApplyWorker({
      client: fakeClient(attempt({}), log),
      backends: new BrowserBackendRegistry([fakeBackend(log)]),
      descriptor,
      backendId: 'fake',
      logger: { log() {}, warn() {}, error() {} },
    });
    expect(await worker.runOnce()).toEqual({ claimed: true, attemptId: 'attempt-1', outcome: 'waiting' });
    expect(log).toContain('waiting:readiness_only_worker');
    expect(log.some((entry) => entry.startsWith('navigate:'))).toBe(false);
  });

  it('reports backend/navigation failures as pre-submit only', async () => {
    const log: string[] = [];
    const worker = new ApplyWorker({
      client: fakeClient(attempt({ readinessOnly: true }), log),
      backends: new BrowserBackendRegistry([fakeBackend(log, { failNavigate: true })]),
      descriptor,
      backendId: 'fake',
      attemptHeartbeatIntervalMs: 60_000,
      logger: { log() {}, warn() {}, error() {} },
    });
    expect(await worker.runOnce()).toEqual({ claimed: true, attemptId: 'attempt-1', outcome: 'failed' });
    expect(log).toContain('fail:readiness_failed:not_crossed');
    expect(log).toContain('release');
  });
});
