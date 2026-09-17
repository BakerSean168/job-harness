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
  running = null;
  dir = null;
});

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${running!.apiUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  return { response, body: await response.json() };
}

describe('Apply Executor REST control plane', () => {
  it('dispatches a prepared intent through registration, lease, human handoff and resume without touching an external site', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-apply-api-'));
    running = await startJobHarnessServer({ databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0 });

    const inserted = await json('/jobs/batch', {
      method: 'POST',
      body: JSON.stringify({ jobs: [{
        companyName: 'Acme', title: 'Frontend Engineer', city: '杭州', observedAt: '2026-09-17T09:00:00.000Z',
        listings: [{ sourceKind: 'official', url: 'https://jobs.example.com/roles/frontend-1', identityKind: 'url', status: 'active' }],
      }] }),
    });
    const jobId = String(inserted.body.items[0].jobId);
    const detail = await json(`/jobs/${jobId}`);
    const listingId = String(detail.body.job.listings[0].id);

    const intent = await json('/submission-intents', {
      method: 'POST',
      body: JSON.stringify({
        jobId, listingId, executor: 'other', externalTargetUrl: 'https://jobs.example.com/roles/frontend-1',
        idempotencyKey: 'prepare-api-apply-1',
      }),
    });
    expect(intent.response.status).toBe(201);
    const intentId = String(intent.body.id);

    const registration = await json('/executors/register', {
      method: 'POST',
      body: JSON.stringify({
        executorId: 'oracle2-steel', name: 'Oracle2 Steel', version: '0.1.0', status: 'ready',
        browserBackends: ['steel'], adapterIds: ['generic-ats'], executionModes: ['fill_only'],
        capabilities: { resumeUpload: false, humanControl: true, persistentSession: true, screenshots: true, semanticMapping: false },
        maxConcurrency: 1, metadata: { environment: 'test' },
      }),
    });
    expect(registration.response.status).toBe(200);

    const dispatched = await json('/execution-attempts', {
      method: 'POST',
      body: JSON.stringify({
        intentId, executionMode: 'fill_only', requiredAdapterId: 'generic-ats', preferredBrowserBackend: 'steel',
        requiredCapabilities: ['humanControl'], policySnapshot: { submitAllowed: false }, idempotencyKey: 'dispatch-api-1',
      }),
    });
    expect(dispatched.response.status).toBe(201);
    expect(dispatched.body).toMatchObject({ intentId, state: 'queued', externalEffectState: 'not_crossed' });
    const attemptId = String(dispatched.body.id);

    const claimed = await json('/execution-attempts/claim', {
      method: 'POST', body: JSON.stringify({ executorId: 'oracle2-steel', leaseSeconds: 90 }),
    });
    expect(claimed.response.status).toBe(200);
    expect(claimed.body.attempt).toMatchObject({ id: attemptId, state: 'claimed', executorId: 'oracle2-steel' });
    const leaseToken = String(claimed.body.leaseToken);

    const started = await json(`/execution-attempts/${attemptId}/start`, {
      method: 'POST',
      body: JSON.stringify({ executorId: 'oracle2-steel', leaseToken, adapterId: 'generic-ats', adapterVersion: '1.0.0', browserBackend: 'steel' }),
    });
    expect(started.body.state).toBe('running');

    const waiting = await json(`/execution-attempts/${attemptId}/waiting`, {
      method: 'POST',
      body: JSON.stringify({ executorId: 'oracle2-steel', leaseToken, reasonCode: 'login_required', summary: 'Sign in before continuing', checkpoint: 'login' }),
    });
    expect(waiting.body).toMatchObject({ state: 'waiting_for_user', leaseOwner: null, checkpoint: 'login' });

    const resumed = await json(`/execution-attempts/${attemptId}/resume`, { method: 'POST', body: '{}' });
    expect(resumed.body.state).toBe('queued');

    const attemptDetail = await json(`/execution-attempts/${attemptId}`);
    expect(attemptDetail.response.status).toBe(200);
    expect(attemptDetail.body.events.map((event: { type: string }) => event.type)).toEqual([
      'attempt_queued', 'attempt_claimed', 'attempt_started', 'human_action_required', 'attempt_resumed',
    ]);

    const list = await json('/execution-attempts?states=queued&externalEffectStates=not_crossed');
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(attemptId);

    const intentAfter = await json(`/submission-intents/${intentId}`);
    expect(intentAfter.body.status).toBe('planned');
  });

  it('documents the Apply Executor control surface in generated OpenAPI', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-apply-openapi-'));
    running = await startJobHarnessServer({ databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0 });
    const response = await fetch(running.openApiUrl);
    const document = await response.json() as { paths: Record<string, unknown> };
    expect(document.paths).toHaveProperty('/api/v1/executors');
    expect(document.paths).toHaveProperty('/api/v1/execution-attempts');
    expect(document.paths).toHaveProperty('/api/v1/execution-attempts/claim');
    expect(document.paths).toHaveProperty('/api/v1/execution-attempts/{attemptId}/waiting');
  });
});
