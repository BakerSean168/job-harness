import { describe, expect, it } from 'vitest';
import { BrowserBackendRegistry, type BrowserBackendPort, type BrowserControlSnapshot, type BrowserDriverPort, type BrowserSessionPort } from '@job-harness/apply-browser';
import { ExecutionAttemptSchema, type ExecutionAttempt, type ExecutorDescriptor } from '@job-harness/apply-contracts';
import { ApplySiteAdapterRegistry, GenericAtsSiteAdapter, InMemoryApplicantDataProvider } from '@job-harness/apply-adapters';
import { ApplyWorker, type ApplyWorkerClientPort } from '../src/runtime';
import { FormFillExecutionEngine } from '../src/form-fill-engine';

const descriptor: ExecutorDescriptor = {
  executorId: 'form-worker', name: 'Form Worker', version: '0.2.0', hostLabel: 'test', status: 'ready',
  browserBackends: ['fake'], adapterIds: ['generic-ats'], executionModes: ['fill_only'],
  capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: true, semanticMapping: false }, maxConcurrency: 1, metadata: {},
};

const controls: BrowserControlSnapshot[] = [
  { controlRef: '#name', kind: 'text', label: '姓名', name: 'name', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['name'], accept: null, multiple: false, sectionLabel: '基本信息' },
  { controlRef: '#email', kind: 'email', label: 'Email', name: 'email', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['email'], accept: null, multiple: false, sectionLabel: '基本信息' },
  { controlRef: '#visa', kind: 'radio', label: 'Will you require visa sponsorship?', name: 'visa', description: null, required: true, disabled: false, readOnly: false, options: [{ value: 'yes', label: 'Yes', disabled: false }, { value: 'no', label: 'No', disabled: false }], semanticHints: [], accept: null, multiple: false, sectionLabel: 'Legal' },
];

function claimedAttempt(): ExecutionAttempt {
  return ExecutionAttemptSchema.parse({
    id: 'attempt-form-1', intentId: 'intent-form-1', executorId: 'form-worker', requiredAdapterId: 'generic-ats', adapterId: null, adapterVersion: null,
    preferredBrowserBackend: 'fake', browserBackend: null, executionMode: 'fill_only', state: 'claimed', leaseOwner: 'form-worker', leaseExpiresAt: '2099-01-01T00:00:00.000Z', lastHeartbeatAt: '2026-09-17T12:00:00.000Z', checkpoint: null,
    externalEffectState: 'not_crossed', requiredCapabilities: ['humanControl'], policySnapshot: {},
    bundle: { intentId: 'intent-form-1', attemptId: 'attempt-form-1', jobId: 'job-1', listingId: 'listing-1', listingUrl: 'https://jobs.example.test/apply', company: 'Example', title: 'Frontend Engineer', city: '杭州', resumeProfileId: null, resumeRevisionId: null, resumeArtifact: null, applicantCatalogVersion: null, answerSetVersion: null, answerSetHash: null, policySnapshot: {}, createdAt: '2026-09-17T12:00:00.000Z' },
    bundleHash: 'a'.repeat(64), dispatchRequestHash: 'b'.repeat(64), reviewHash: null, submitAuthorizationId: null, errorCode: null, errorSummary: null, startedAt: null, completedAt: null, idempotencyKey: 'dispatch-form-1', createdAt: '2026-09-17T12:00:00.000Z', updatedAt: '2026-09-17T12:00:00.000Z',
  });
}

function backend(log: string[]): BrowserBackendPort {
  const driver: BrowserDriverPort = {
    async navigate(url) { log.push(`navigate:${url}`); }, currentUrl: () => 'https://jobs.example.test/apply', async title() { return 'Apply'; }, async bodyText() { return 'Form'; },
    async exists() { return true; }, async text() { return null; },
    async fill(selector, value) { log.push(`fill:${selector}:${value}`); }, async select() { throw new Error('not used'); }, async setChecked() { throw new Error('not used'); },
    async click() { throw new Error('submit click forbidden'); }, async upload() { throw new Error('upload not used'); }, async wait() {}, async screenshot() { return new Uint8Array(); }, async scanControls() { return controls; }, async formStateHash() { return 'a'.repeat(64); },
  };
  const session: BrowserSessionPort = {
    backendId: 'fake', sessionId: 'fake-session-1', humanControlUrl: 'https://viewer.example.test/ui', driver: () => driver,
    async persist() { log.push('persist'); },
    async retainForHuman({ expiresAt }) { log.push('retain'); return { backendId: 'fake', sessionRef: 'fake-session-1', humanControlUrl: 'https://viewer.example.test/ui', retainedAt: '2026-09-17T12:00:00.000Z', expiresAt }; },
    async release() { log.push('release'); },
  };
  return {
    id: 'fake', describe: () => ({ id: 'fake', kind: 'managed-remote', persistentSession: true, humanControl: true, metadata: {} }),
    async health() { return { ok: true, detail: null }; }, async acquire() { log.push('acquire'); return session; }, async resume() { log.push('resume'); return session; }, async reapExpired() { log.push('reap'); return 0; },
  };
}

function client(attempt: ExecutionAttempt, log: string[], waitingBodies: Array<Record<string, unknown>>): ApplyWorkerClientPort {
  let claimUsed = false;
  return {
    executors: { async register() { return {}; }, async heartbeat(input) { log.push(`executor:${input.status}`); return {}; } },
    attempts: {
      async claim() { if (claimUsed) return null; claimUsed = true; return { attempt, leaseToken: `lease-${'x'.repeat(48)}` }; },
      async start(input) { log.push(`start:${input.adapterId}`); return { ...attempt, state: 'running' }; },
      async heartbeat() { return attempt; },
      async createReviewSnapshot() { log.push('review-snapshot'); return { id: 'review-1', reviewHash: 'c'.repeat(64) }; },
      async waiting(input) { waitingBodies.push(input as unknown as Record<string, unknown>); log.push(`waiting:${input.reasonCode}`); return { ...attempt, state: 'waiting_for_user', browserSessionHandoff: input.browserSessionHandoff ?? null }; },
      async complete() { throw new Error('form fill should wait for review, not complete'); },
      async fail(input) { log.push(`fail:${input.errorCode}`); return { ...attempt, state: 'failed' }; },
    },
  };
}

describe('ApplyWorker form-fill execution engine', () => {
  it('fills known literal fields, never infers a legal answer, and retains the live browser for human review', async () => {
    const log: string[] = [];
    const waitingBodies: Array<Record<string, unknown>> = [];
    const attempt = claimedAttempt();
    const applicant = new InMemoryApplicantDataProvider('fixture-v1', [
      { entry: { key: 'person.full_name', label: '姓名', valueType: 'text', sensitivity: 'personal', aliases: ['姓名','name'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' }, value: 'Fixture User', provenance: 'fixture' },
      { entry: { key: 'contact.email', label: '邮箱', valueType: 'email', sensitivity: 'sensitive', aliases: ['email','邮箱'], allowAiMapping: false, requiresLiteral: true, source: 'fixture' }, value: 'private@example.test', provenance: 'fixture' },
    ]);
    const engine = new FormFillExecutionEngine({ siteAdapters: new ApplySiteAdapterRegistry([new GenericAtsSiteAdapter()]), applicant });
    const worker = new ApplyWorker({
      client: client(attempt, log, waitingBodies), backends: new BrowserBackendRegistry([backend(log)]), descriptor, backendId: 'fake',
      formFillEngine: engine, humanReviewHandoffSeconds: 600, attemptHeartbeatIntervalMs: 60_000,
      logger: { log() {}, warn() {}, error() {} },
    });
    expect(await worker.runOnce()).toEqual({ claimed: true, attemptId: attempt.id, outcome: 'waiting' });
    expect(log).toContain('fill:#name:Fixture User');
    expect(log).toContain('fill:#email:private@example.test');
    expect(log).toContain('retain');
    expect(log).toContain('release');
    expect(log).toContain('waiting:form_requires_manual_review');
    const waiting = waitingBodies[0]!;
    expect(waiting.browserSessionHandoff).toMatchObject({ backendId: 'fake', sessionRef: 'fake-session-1' });
    const payload = waiting.payload as Record<string, unknown>;
    expect(payload).toMatchObject({ filled: 2, requiredPending: 1, blockingIssueCodes: ['required_field_pending'] });
    const serialized = JSON.stringify(waiting);
    expect(serialized).not.toContain('Fixture User');
    expect(serialized).not.toContain('private@example.test');
    expect(serialized).not.toContain('yes');
    expect(serialized).not.toContain('no');
  });
});
