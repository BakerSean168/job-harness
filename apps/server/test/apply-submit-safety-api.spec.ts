import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null; dir = null;
});

async function request(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${running!.apiUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

describe('supervised submit-safety REST protocol', () => {
  it('requires global user authorization, enters SubmissionIntent external_in_progress before click permission, then commits one Application on exact success evidence', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-submit-safety-api-'));
    running = await startJobHarnessServer({ databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0, authToken: 'global-secret', executorAuthToken: 'worker-secret' });
    const global = 'global-secret';
    const worker = 'worker-secret';
    const t0 = '2026-09-17T14:00:00.000Z';
    const formStateHash = 'a'.repeat(64);

    const jobs = await request('/jobs/batch', global, { method: 'POST', body: JSON.stringify({ jobs: [{
      companyName: 'Protocol Co', title: 'Frontend Engineer', city: 'Hangzhou', observedAt: t0,
      listings: [{ sourceKind: 'official', url: 'https://jobs.example.test/protocol', identityKind: 'url', status: 'active' }],
    }] }) });
    const jobId = String(jobs.body.items[0].jobId);
    const job = await request(`/jobs/${jobId}`, global);
    const listingId = String(job.body.job.listings[0].id);
    const intent = await request('/submission-intents', global, { method: 'POST', body: JSON.stringify({
      jobId, listingId, executor: 'other', externalTargetUrl: 'https://jobs.example.test/protocol', idempotencyKey: 'protocol-intent-1',
    }) });
    const intentId = String(intent.body.id);

    await request('/executors/register', worker, { method: 'POST', body: JSON.stringify({
      executorId: 'protocol-worker', name: 'Protocol Worker', version: '1', status: 'ready', browserBackends: ['steel'], adapterIds: ['generic-ats'], executionModes: ['fill_only'], capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: true, semanticMapping: false }, maxConcurrency: 1, metadata: {},
    }) });
    const dispatched = await request('/execution-attempts', global, { method: 'POST', body: JSON.stringify({
      intentId, executionMode: 'fill_only', requiredAdapterId: 'generic-ats', preferredBrowserBackend: 'steel', requiredCapabilities: ['humanControl'], policySnapshot: {}, idempotencyKey: 'protocol-attempt-1',
    }) });
    const attemptId = String(dispatched.body.id);
    const claim1 = await request('/execution-attempts/claim', worker, { method: 'POST', body: JSON.stringify({ executorId: 'protocol-worker', leaseSeconds: 300 }) });
    const lease1 = String(claim1.body.leaseToken);
    await request(`/execution-attempts/${attemptId}/start`, worker, { method: 'POST', body: JSON.stringify({ executorId: 'protocol-worker', leaseToken: lease1, adapterId: 'generic-ats', adapterVersion: '1', browserBackend: 'steel' }) });
    const snapshot = await request(`/execution-attempts/${attemptId}/review-snapshots`, worker, { method: 'POST', body: JSON.stringify({
      executorId: 'protocol-worker', leaseToken: lease1, formStateHash, formVersion: 'form-v1', catalogVersion: 'catalog-v1', siteAdapterId: 'generic-ats', siteAdapterVersion: '1', browserSessionRef: 'protocol-session-1',
      summary: { fieldCount: 3, bindingCount: 3, filled: 3, failed: 0, manual: 0, requiredPending: 0, prohibitedCount: 0, blockingIssueCodes: [], readyForSubmit: true },
    }) });
    expect(snapshot.response.status).toBe(201);
    const reviewSnapshotId = String(snapshot.body.id);
    await request(`/execution-attempts/${attemptId}/waiting`, worker, { method: 'POST', body: JSON.stringify({
      executorId: 'protocol-worker', leaseToken: lease1, reasonCode: 'review_ready', summary: 'Ready',
      browserSessionHandoff: { backendId: 'steel', sessionRef: 'protocol-session-1', humanControlUrl: 'https://viewer.example.test/ui', retainedAt: '2026-09-17T14:01:00.000Z', expiresAt: '2026-09-17T15:00:00.000Z' },
    }) });

    const workerCannotAuthorize = await request(`/execution-attempts/${attemptId}/submit-authorizations`, worker, { method: 'POST', body: JSON.stringify({ reviewSnapshotId, expiresInSeconds: 300, idempotencyKey: 'should-not-work', actor: 'user' }) });
    expect(workerCannotAuthorize.response.status).toBe(401);
    const authorization = await request(`/execution-attempts/${attemptId}/submit-authorizations`, global, { method: 'POST', body: JSON.stringify({ reviewSnapshotId, expiresInSeconds: 300, idempotencyKey: 'protocol-auth-1', actor: 'user' }) });
    expect(authorization.response.status).toBe(201);
    const authorizationId = String(authorization.body.id);

    await request(`/execution-attempts/${attemptId}/resume`, global, { method: 'POST', body: '{}' });
    await request('/executors/protocol-worker/heartbeat', worker, { method: 'POST', body: JSON.stringify({ status: 'ready' }) });
    const claim2 = await request('/execution-attempts/claim', worker, { method: 'POST', body: JSON.stringify({ executorId: 'protocol-worker', leaseSeconds: 300 }) });
    const lease2 = String(claim2.body.leaseToken);
    await request(`/execution-attempts/${attemptId}/start`, worker, { method: 'POST', body: JSON.stringify({ executorId: 'protocol-worker', leaseToken: lease2, adapterId: 'generic-ats', adapterVersion: '1', browserBackend: 'steel' }) });

    const begin = await request(`/execution-attempts/${attemptId}/begin-submit`, worker, { method: 'POST', body: JSON.stringify({ executorId: 'protocol-worker', leaseToken: lease2, authorizationId, formStateHash, occurredAt: '2026-09-17T14:03:00.000Z' }) });
    expect(begin.response.status).toBe(200);
    expect(begin.body.externalEffectState).toBe('crossed');
    expect(begin.body.authorization.status).toBe('consumed');
    const inProgress = await request(`/submission-intents/${intentId}`, global);
    expect(inProgress.body.status).toBe('external_in_progress');

    const success = await request(`/execution-attempts/${attemptId}/submit-success`, worker, { method: 'POST', body: JSON.stringify({
      executorId: 'protocol-worker', leaseToken: lease2, confirmedAt: '2026-09-17T14:04:00.000Z', appliedAt: '2026-09-17T14:04:00.000Z', externalReference: 'confirmation-123', externalEvidence: { confirmationPage: true },
    }) });
    expect(success.response.status).toBe(200);
    expect(success.body.state).toBe('completed');
    const committed = await request(`/submission-intents/${intentId}`, global);
    expect(committed.body.status).toBe('committed');
    const applications = await request('/applications?limit=50&offset=0', global);
    expect(applications.body.total).toBe(1);
    expect(applications.body.items[0].application.jobId).toBe(jobId);

    const duplicateBegin = await request(`/execution-attempts/${attemptId}/begin-submit`, worker, { method: 'POST', body: JSON.stringify({ executorId: 'protocol-worker', leaseToken: lease2, authorizationId, formStateHash, occurredAt: '2026-09-17T14:05:00.000Z' }) });
    expect(duplicateBegin.response.status).toBe(409);
    const stillOne = await request('/applications?limit=50&offset=0', global);
    expect(stillOne.body.total).toBe(1);
  });
});
