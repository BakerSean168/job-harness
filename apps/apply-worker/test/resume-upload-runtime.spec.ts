import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BrowserBackendRegistry, type BrowserBackendPort, type BrowserControlSnapshot, type BrowserDriverPort, type BrowserSessionPort } from '@job-harness/apply-browser';
import { ExecutionAttemptSchema, type ExecutionAttempt, type ExecutorDescriptor } from '@job-harness/apply-contracts';
import { ApplySiteAdapterRegistry, GenericAtsSiteAdapter } from '@job-harness/apply-adapters';
import { ApplyWorker, type ApplyWorkerClientPort } from '../src/runtime';
import { FormFillExecutionEngine } from '../src/form-fill-engine';

const pdf = new TextEncoder().encode('%PDF-1.7\nsynthetic-resume\n%%EOF');
const pdfSha = createHash('sha256').update(pdf).digest('hex');
const descriptor: ExecutorDescriptor = {
  executorId: 'resume-worker', name: 'Resume Worker', version: '0.2.0', hostLabel: 'test', status: 'ready',
  browserBackends: ['fake'], adapterIds: ['generic-ats'], executionModes: ['fill_only'],
  capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: true, semanticMapping: false }, maxConcurrency: 1, metadata: {},
};
const controls: BrowserControlSnapshot[] = [
  { controlRef: '#name', kind: 'text', label: '姓名', name: 'name', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['name'], accept: null, multiple: false, sectionLabel: '基本信息' },
  { controlRef: '#resume', kind: 'file', label: '上传简历', name: 'resume', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['resume'], accept: 'application/pdf,.pdf', multiple: false, sectionLabel: '附件' },
];

function attempt(): ExecutionAttempt {
  return ExecutionAttemptSchema.parse({
    id: 'attempt-resume-1', intentId: 'intent-resume-1', executorId: 'resume-worker', requiredAdapterId: 'generic-ats', adapterId: null, adapterVersion: null,
    preferredBrowserBackend: 'fake', browserBackend: null, browserSessionHandoff: null, executionMode: 'fill_only', state: 'claimed', leaseOwner: 'resume-worker', leaseExpiresAt: '2099-01-01T00:00:00.000Z', lastHeartbeatAt: '2026-09-17T12:00:00.000Z', checkpoint: null,
    externalEffectState: 'not_crossed', requiredCapabilities: ['resumeUpload','humanControl'], policySnapshot: { allowFormFill: true },
    bundle: { intentId: 'intent-resume-1', attemptId: 'attempt-resume-1', jobId: 'job-1', listingId: 'listing-1', listingUrl: 'https://jobs.example.test/apply', company: 'Example', title: 'Frontend Engineer', city: '杭州', resumeProfileId: 'frontend', resumeRevisionId: 'revision-1', resumeArtifact: { id: 'artifact-1', revisionId: 'revision-1', sha256: pdfSha, byteSize: pdf.byteLength, mimeType: 'application/pdf' }, applicantCatalogVersion: null, answerSetVersion: null, answerSetHash: null, policySnapshot: {}, createdAt: '2026-09-17T12:00:00.000Z' },
    bundleHash: 'a'.repeat(64), dispatchRequestHash: 'b'.repeat(64), reviewHash: null, submitAuthorizationId: null, errorCode: null, errorSummary: null, startedAt: null, completedAt: null, idempotencyKey: 'dispatch-resume-1', createdAt: '2026-09-17T12:00:00.000Z', updatedAt: '2026-09-17T12:00:00.000Z',
  });
}

function backend(log: string[]): BrowserBackendPort {
  const driver: BrowserDriverPort = {
    async navigate(url) { log.push(`navigate:${url}`); }, currentUrl: () => 'https://jobs.example.test/apply', async title() { return 'Apply'; }, async bodyText() { return ''; },
    async exists() { return true; }, async text() { return null; }, async fill(selector, value) { log.push(`fill:${selector}:${value}`); }, async select() {}, async setChecked() {}, async click() { throw new Error('no click'); },
    async upload(selector, file) { log.push(`upload:${selector}:${file.name}:${file.mimeType}:${file.bytes.byteLength}`); expect(createHash('sha256').update(file.bytes).digest('hex')).toBe(pdfSha); },
    async wait() {}, async screenshot() { return new Uint8Array(); }, async scanActions() { return []; }, async scanControls() { return controls; }, async formStateHash() { return 'c'.repeat(64); },
  };
  const session: BrowserSessionPort = {
    backendId: 'fake', sessionId: 'fake-session-resume', humanControlUrl: 'https://viewer.example.test/ui', driver: () => driver,
    async persist() {}, async retainForHuman({ expiresAt }) { return { backendId: 'fake', sessionRef: 'fake-session-resume', humanControlUrl: 'https://viewer.example.test/ui', retainedAt: '2026-09-17T12:00:00.000Z', expiresAt }; }, async release() {},
  };
  return { id: 'fake', describe: () => ({ id: 'fake', kind: 'managed-remote', persistentSession: true, humanControl: true, metadata: {} }), async health() { return { ok: true, detail: null }; }, async acquire() { return session; }, async resume() { return session; }, async reapExpired() { return 0; } };
}

function client(value: ExecutionAttempt, log: string[]): ApplyWorkerClientPort {
  let used = false;
  return {
    executors: { async register() {}, async heartbeat() {} },
    attempts: {
      async claim() { if (used) return null; used = true; return { attempt: value, leaseToken: `lease-${'x'.repeat(48)}` }; },
      async start() { return { ...value, state: 'running' }; }, async heartbeat() { return value; },
      async resumeArtifact() { log.push('grant-resume'); return { artifactId: 'artifact-1', revisionId: 'revision-1', fileName: '卢楼豪-前端开发工程师.pdf', mimeType: 'application/pdf', sha256: pdfSha, byteSize: pdf.byteLength, bytesBase64: Buffer.from(pdf).toString('base64') }; },
      async applicantCatalog() { log.push('grant-catalog'); return { version: 'resume-revision:revision-1:fixture', entries: [{ key: 'person.full_name', label: '姓名', valueType: 'text', sensitivity: 'personal', aliases: ['姓名','name'], allowAiMapping: false, requiresLiteral: true, source: 'job-harness-resume-revision' }] }; },
      async resolveApplicantData(input) { log.push(`resolve:${input.keys.join(',')}`); return { catalogVersion: 'resume-revision:revision-1:fixture', values: input.keys.includes('person.full_name') ? [{ key: 'person.full_name', value: 'Fixture User', valueType: 'text', sensitivity: 'personal', provenance: 'resume-revision:revision-1', literal: true }] : [] }; },
      async createReviewSnapshot(input) { expect(input.summary.readyForSubmit).toBe(false); return { id: 'review-1', reviewHash: 'd'.repeat(64) }; },
      async waiting(input) { log.push(`waiting:${input.reasonCode}`); return { ...value, state: 'waiting_for_user', browserSessionHandoff: input.browserSessionHandoff ?? null }; },
      async complete() { throw new Error('not used'); }, async fail(input) { throw new Error(`unexpected fail ${input.errorCode}`); },
    },
  };
}

describe('lease-scoped resume upload in form-fill worker', () => {
  it('fetches only the frozen PDF grant, verifies bytes/hash, and uploads it through BrowserDriverPort', async () => {
    const log: string[] = [];
    const value = attempt();
    const worker = new ApplyWorker({
      client: client(value, log), backends: new BrowserBackendRegistry([backend(log)]), descriptor, backendId: 'fake',
      formFillEngine: new FormFillExecutionEngine({ siteAdapters: new ApplySiteAdapterRegistry([new GenericAtsSiteAdapter()]) }),
      logger: { log() {}, warn() {}, error() {} }, attemptHeartbeatIntervalMs: 60_000,
    });
    expect(await worker.runOnce()).toEqual({ claimed: true, attemptId: value.id, outcome: 'waiting' });
    expect(log).toContain('grant-resume');
    expect(log).toContain('grant-catalog');
    expect(log).toContain('fill:#name:Fixture User');
    expect(log).toContain(`upload:#resume:卢楼豪-前端开发工程师.pdf:application/pdf:${pdf.byteLength}`);
    expect(log).toContain('waiting:review_ready');
  });
});
