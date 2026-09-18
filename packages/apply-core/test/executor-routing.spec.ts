import { describe, expect, it } from 'vitest';
import { ExecutionAttemptSchema, ExecutorRegistrationSchema } from '@job-harness/apply-contracts';
import { executorCanRunAttempt } from '../src';

const at = '2026-09-18T09:30:00.000Z';
function executor(browserAgentId?: string) {
  return ExecutorRegistrationSchema.parse({
    executorId: browserAgentId ? `executor-${browserAgentId}` : 'executor-generic',
    name: 'fixture', version: '1', hostLabel: 'test', status: 'ready', browserBackends: ['extension'], adapterIds: ['zhilian-ats'], executionModes: ['fill_only'],
    capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: false, semanticMapping: false }, maxConcurrency: 1,
    metadata: browserAgentId ? { browserAgentId } : {}, lastHeartbeatAt: at, createdAt: at, updatedAt: at,
  });
}
function attempt(requiredBrowserAgentId?: string) {
  return ExecutionAttemptSchema.parse({
    id: 'attempt-1', intentId: 'intent-1', executorId: null, requiredAdapterId: 'zhilian-ats', adapterId: null, adapterVersion: null,
    preferredBrowserBackend: 'extension', browserBackend: null, browserSessionHandoff: null, executionMode: 'fill_only', state: 'queued', leaseOwner: null,
    leaseExpiresAt: null, lastHeartbeatAt: null, checkpoint: null, externalEffectState: 'not_crossed', requiredCapabilities: ['humanControl'],
    policySnapshot: requiredBrowserAgentId ? { requiredBrowserAgentId } : {},
    bundle: { intentId: 'intent-1', attemptId: 'attempt-1', jobId: 'job-1', listingId: 'listing-1', listingUrl: 'https://www.zhaopin.com/jobdetail/CC1.htm', company: 'A', title: 'B', city: null, resumeProfileId: null, resumeRevisionId: null, resumeArtifact: null, siteResumeBinding: null, applicantCatalogVersion: null, applicantProfileRevisionId: null, applicantProfileHash: null, answerSetRevisionId: null, answerSetVersion: null, answerSetHash: null, policySnapshot: requiredBrowserAgentId ? { requiredBrowserAgentId } : {}, createdAt: at },
    bundleHash: 'a'.repeat(64), dispatchRequestHash: 'b'.repeat(64), reviewHash: null, submitAuthorizationId: null, errorCode: null, errorSummary: null,
    startedAt: null, completedAt: null, idempotencyKey: 'dispatch-1', createdAt: at, updatedAt: at,
  });
}

describe('executor browser-agent routing', () => {
  it('routes a browser-account-bound attempt only to the matching extension agent', () => {
    expect(executorCanRunAttempt(executor('windows-chrome-primary'), attempt('windows-chrome-primary'))).toBe(true);
    expect(executorCanRunAttempt(executor('other-chrome'), attempt('windows-chrome-primary'))).toBe(false);
    expect(executorCanRunAttempt(executor(), attempt('windows-chrome-primary'))).toBe(false);
  });
  it('preserves ordinary routing when no browser agent is frozen', () => {
    expect(executorCanRunAttempt(executor('windows-chrome-primary'), attempt())).toBe(true);
  });
});
