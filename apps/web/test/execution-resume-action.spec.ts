import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJobHarnessRestClient } from '@job-harness/client';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../../server/src';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
const originalApiUrl = process.env.JOB_HARNESS_API_URL;
const originalToken = process.env.JOB_HARNESS_AUTH_TOKEN;

afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
  if (originalApiUrl === undefined) delete process.env.JOB_HARNESS_API_URL; else process.env.JOB_HARNESS_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.JOB_HARNESS_AUTH_TOKEN; else process.env.JOB_HARNESS_AUTH_TOKEN = originalToken;
  vi.clearAllMocks();
});

describe('Web execution human-handoff resume action', () => {
  it('requeues a retained pre-submit attempt without crossing the external-effect boundary', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-web-executor-resume-'));
    running = await startJobHarnessServer({
      databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0,
      authToken: 'global-secret', executorAuthToken: 'worker-secret', submissionReconcileIntervalMs: null,
    });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'global-secret';
    const global = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'global-secret' });
    const worker = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'worker-secret' });
    const now = '2026-09-17T13:00:00.000Z';

    const jobs = await global.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Handoff Co', title: 'Frontend Engineer', city: 'Hangzhou', observedAt: now,
      listings: [{ sourceKind: 'other', url: 'https://jobs.example.test/job/123', identityKind: 'url', status: 'active' }],
    }] });
    const jobId = jobs.items[0]!.jobId!;
    const job = await global.workspace.getJobDetail(jobId);
    const listingId = job!.job.listings[0]!.id;
    const intent = await global.submissionIntents.prepare({
      jobId, listingId, executor: 'other', externalTargetUrl: 'https://jobs.example.test/job/123', idempotencyKey: 'handoff-intent-1',
    });

    await worker.apply.executors.register({
      executorId: 'handoff-worker', name: 'Handoff Worker', version: '0.2.0', hostLabel: 'test', status: 'ready',
      browserBackends: ['steel'], adapterIds: ['generic-ats'], executionModes: ['fill_only'],
      capabilities: { resumeUpload: false, humanControl: true, persistentSession: true, screenshots: false, semanticMapping: false },
      maxConcurrency: 1, metadata: {},
    });
    const attempt = await global.apply.attempts.dispatch({
      intentId: intent.id, executionMode: 'fill_only', requiredAdapterId: 'generic-ats', preferredBrowserBackend: 'steel', requiredCapabilities: ['humanControl'],
      policySnapshot: { allowFormFill: true }, idempotencyKey: 'handoff-attempt-1',
    });
    const claim = await worker.apply.attempts.claim({ executorId: 'handoff-worker', leaseSeconds: 90 });
    expect(claim).not.toBeNull();
    const leaseToken = claim!.leaseToken;
    await worker.apply.attempts.start({
      attemptId: attempt.id, executorId: 'handoff-worker', leaseToken, adapterId: 'generic-ats', adapterVersion: '1.0.0', browserBackend: 'steel', checkpoint: 'form-inspection',
    });
    await worker.apply.attempts.waiting({
      attemptId: attempt.id, executorId: 'handoff-worker', leaseToken, checkpoint: 'human-entry:login_required',
      reasonCode: 'login_required', summary: 'Human login is required before form inspection.', payload: { pageState: 'login_required' },
      browserSessionHandoff: {
        backendId: 'steel', sessionRef: 'fixture-session', humanControlUrl: 'https://viewer.example.test/ui',
        retainedAt: '2026-09-17T13:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
      },
    });

    const form = new FormData();
    form.set('attemptId', attempt.id);
    const { resumeExecutionAttemptAction } = await import('../src/app/executors/actions');
    await resumeExecutionAttemptAction(form);

    const after = await global.apply.attempts.get(attempt.id);
    expect(after?.attempt).toMatchObject({
      state: 'queued', externalEffectState: 'not_crossed', browserSessionHandoff: { sessionRef: 'fixture-session' },
    });
    const intentAfter = await global.submissionIntents.get(intent.id);
    expect(intentAfter?.status).toBe('planned');
    expect((await global.workspace.listApplicationBoard({ limit: 20, offset: 0 })).total).toBe(0);

    const { revalidatePath } = await import('next/cache');
    expect(revalidatePath).toHaveBeenCalledWith('/executors');
    expect(revalidatePath).toHaveBeenCalledWith(`/executors/${attempt.id}`);
  });
});
