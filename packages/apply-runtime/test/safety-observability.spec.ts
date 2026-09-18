import { describe, expect, it } from 'vitest';
import { ExecutionAttemptSchema, ExecutorRegistrationSchema } from '@job-harness/apply-contracts';
import { createApplyControlPlane, type ApplyStorePort } from '../src';

const timestamp = '2026-09-17T17:00:00.000Z';

function crossedAttempt() {
  return ExecutionAttemptSchema.parse({
    id: 'attempt-expired', intentId: 'intent-expired', executorId: 'worker-1', requiredAdapterId: null, adapterId: 'generic-ats', adapterVersion: '1',
    preferredBrowserBackend: 'fixture-backend', browserBackend: 'fixture-backend', browserSessionHandoff: null, executionMode: 'review_then_submit', state: 'abandoned',
    leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: timestamp, checkpoint: 'submit', externalEffectState: 'crossed', requiredCapabilities: [], policySnapshot: {},
    bundle: {
      intentId: 'intent-expired', attemptId: 'attempt-expired', jobId: 'job-1', listingId: null, listingUrl: 'https://jobs.example.test/apply',
      company: 'Example', title: 'Engineer', city: null, resumeProfileId: null, resumeRevisionId: null, resumeArtifact: null,
      applicantCatalogVersion: null, applicantProfileRevisionId: null, applicantProfileHash: null,
      answerSetRevisionId: null, answerSetVersion: null, answerSetHash: null, policySnapshot: {}, createdAt: timestamp,
    },
    bundleHash: 'a'.repeat(64), dispatchRequestHash: 'b'.repeat(64), reviewHash: 'c'.repeat(64), submitAuthorizationId: 'authorization-1',
    errorCode: 'lease_expired', errorSummary: 'expired', startedAt: timestamp, completedAt: timestamp, idempotencyKey: 'attempt-idempotency', createdAt: timestamp, updatedAt: timestamp,
  });
}

describe('Apply safety persistence observability', () => {
  it('reports best-effort manual-review persistence failures without making claim fail open', async () => {
    const incidents: Array<{ reason: string; attemptId: string; intentId: string }> = [];
    const executor = ExecutorRegistrationSchema.parse({
      executorId: 'worker-1', name: 'Worker', version: '1', hostLabel: null, status: 'ready', browserBackends: ['fixture-backend'], adapterIds: ['generic-ats'], executionModes: ['fill_only'],
      capabilities: { resumeUpload: false, humanControl: true, persistentSession: true, screenshots: false, semanticMapping: false }, maxConcurrency: 1,
      lastHeartbeatAt: timestamp, metadata: {}, createdAt: timestamp, updatedAt: timestamp,
    });
    const store = {
      abandonExpiredAttempts: async () => [crossedAttempt()],
      getExecutor: async () => executor,
      countLeasedAttempts: async () => 0,
      listAttempts: async () => ({ items: [], total: 0 }),
    } as ApplyStorePort;
    const runtime = createApplyControlPlane(
      store,
      { create: async () => { throw new Error('unused'); } },
      {
        beginExternal: async () => undefined,
        confirmExternal: async () => undefined,
        failExternal: async () => undefined,
        markManualReview: async () => { throw new Error('career persistence unavailable'); },
      },
      {
        now: () => timestamp,
        onSafetyPersistenceError: (incident) => { incidents.push(incident); },
      },
    );

    await expect(runtime.attempts.claim({ executorId: 'worker-1', leaseSeconds: 90 })).resolves.toBeNull();
    expect(incidents).toEqual([expect.objectContaining({
      reason: 'lease_expired', attemptId: 'attempt-expired', intentId: 'intent-expired',
    })]);
  });
});
