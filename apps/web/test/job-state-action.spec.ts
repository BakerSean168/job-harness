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

describe('Web job triage server action', () => {
  it('persists a state transition through REST without browser access to the bearer token', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-web-action-'));
    running = await startJobHarnessServer({
      databasePath: join(dir, 'career.db'),
      host: '127.0.0.1',
      port: 0,
      authToken: 'integration-secret',
    });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'integration-secret';

    const client = createJobHarnessRestClient({
      baseUrl: running.apiUrl,
      authToken: 'integration-secret',
    });
    const inserted = await client.jobs.upsertJobsBatch({
      jobs: [{
        companyName: 'Acme AI',
        title: 'Agent Engineer',
        city: 'Hangzhou',
        listings: [{
          sourceKind: 'official',
          url: 'https://jobs.example.com/agent-ui-action',
          identityKind: 'url',
          status: 'active',
        }],
        observedAt: '2026-09-16T10:00:00.000Z',
      }],
    });
    const jobId = inserted.items[0]!.jobId!;

    const { setJobStateAction } = await import('../src/app/jobs/actions');
    const result = await setJobStateAction(jobId, 'shortlisted', 'intent-ui-1');
    expect(result).toEqual({ ok: true });

    const detail = await client.workspace.getJobDetail(jobId);
    expect(detail?.job.state).toBe('shortlisted');

    const { revalidatePath } = await import('next/cache');
    expect(revalidatePath).toHaveBeenCalledWith('/jobs');
    expect(revalidatePath).toHaveBeenCalledWith('/inbox');
    expect(revalidatePath).toHaveBeenCalledWith(`/jobs/${jobId}`);
  });
});
