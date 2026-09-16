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
  if (originalApiUrl === undefined) delete process.env.JOB_HARNESS_API_URL;
  else process.env.JOB_HARNESS_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.JOB_HARNESS_AUTH_TOKEN;
  else process.env.JOB_HARNESS_AUTH_TOKEN = originalToken;
  vi.clearAllMocks();
});

describe('Web application stage server action', () => {
  it('persists stage_changed through REST and preserves domain transition errors', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-application-action-'));
    running = await startJobHarnessServer({ databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0, authToken: 'application-secret' });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'application-secret';
    const client = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'application-secret' });

    const inserted = await client.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Pipeline Co', title: 'AI Engineer', city: 'Hangzhou',
      listings: [{ sourceKind: 'official', url: 'https://example.com/pipeline', identityKind: 'url', status: 'active' }],
      observedAt: '2026-09-16T08:00:00.000Z',
    }] });
    const jobId = inserted.items[0]!.jobId!;
    const application = await client.applications.record({
      jobId, appliedAt: '2026-09-16T09:00:00.000Z', idempotencyKey: 'record-pipeline', actor: 'user',
    });

    const { transitionApplicationAction } = await import('../src/app/applications/actions');
    const transitionAt = '2026-09-16T10:00:00.000Z';
    const result = await transitionApplicationAction(application.application.id, jobId, 'screening', 'intent-screen', transitionAt, 'Recruiter acknowledged');
    expect(result).toEqual({ ok: true });

    const detail = await client.workspace.getApplicationWorkspaceDetail(application.application.id);
    expect(detail?.application.currentStage).toBe('screening');
    expect(detail?.latestEvent).toMatchObject({ type: 'stage_changed', stage: 'screening', note: 'Recruiter acknowledged' });

    const retry = await transitionApplicationAction(application.application.id, jobId, 'screening', 'intent-screen', transitionAt, 'Recruiter acknowledged');
    expect(retry).toEqual({ ok: true });
    const afterRetry = await client.workspace.getApplicationWorkspaceDetail(application.application.id);
    expect(afterRetry?.timeline.filter((event) => event.type === 'stage_changed')).toHaveLength(1);

    const rejected = await transitionApplicationAction(application.application.id, jobId, 'rejected', 'intent-reject', '2026-09-16T11:00:00.000Z', 'Role closed by recruiter');
    expect(rejected).toEqual({ ok: true });
    const rejectedDetail = await client.workspace.getApplicationWorkspaceDetail(application.application.id);
    expect(rejectedDetail?.application.currentStage).toBe('rejected');
    expect(rejectedDetail?.latestEvent).toMatchObject({ type: 'stage_changed', stage: 'rejected', note: 'Role closed by recruiter' });

    const invalid = await transitionApplicationAction(application.application.id, jobId, 'applied', 'intent-backwards', '2026-09-16T12:00:00.000Z');
    expect(invalid).toEqual({ ok: false, code: 'INVALID_TRANSITION' });

    const { revalidatePath } = await import('next/cache');
    expect(revalidatePath).toHaveBeenCalledWith('/applications');
    expect(revalidatePath).toHaveBeenCalledWith(`/applications/${application.application.id}`);
    expect(revalidatePath).toHaveBeenCalledWith('/jobs');
    expect(revalidatePath).toHaveBeenCalledWith(`/jobs/${jobId}`);
  });
});
