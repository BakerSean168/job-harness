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

function campaignForm(status = 'active') {
  const form = new FormData();
  form.set('campaignId', 'campaign-web-test');
  form.set('name', status === 'active' ? 'AI Agent Search' : 'AI Agent Search Updated');
  form.set('targetRoles', 'AI Agent Engineer, AI Fullstack Engineer');
  form.set('cities', 'Hangzhou, Shenzhen');
  form.set('graduationYears', '2026');
  form.set('experience', '0-1y');
  form.set('keywords', 'Agent, TypeScript');
  form.set('exclusions', 'C++ only');
  form.append('sources', 'official');
  form.append('sources', 'boss');
  form.set('status', status);
  return form;
}

describe('Web campaign Server Action', () => {
  it('creates and edits one campaign through the REST/application boundary', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-campaign-action-'));
    running = await startJobHarnessServer({ databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0, authToken: 'campaign-secret' });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'campaign-secret';
    const client = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'campaign-secret' });
    const { initialCampaignActionState, saveCampaignAction } = await import('../src/app/campaigns/actions');

    const created = await saveCampaignAction(initialCampaignActionState, campaignForm());
    expect(created).toEqual({ ok: true, id: 'campaign-web-test' });
    const first = await client.campaigns.get('campaign-web-test');
    expect(first).toMatchObject({
      name: 'AI Agent Search', status: 'active', targetRoles: ['AI Agent Engineer', 'AI Fullstack Engineer'], cities: ['Hangzhou', 'Shenzhen'], graduationYears: [2026], sources: ['official', 'boss'],
    });

    const updated = await saveCampaignAction(created, campaignForm('paused'));
    expect(updated).toEqual({ ok: true, id: 'campaign-web-test' });
    const second = await client.campaigns.get('campaign-web-test');
    expect(second).toMatchObject({ name: 'AI Agent Search Updated', status: 'paused' });
    expect((await client.campaigns.list({ limit: 20, offset: 0 })).total).toBe(1);

    const { revalidatePath } = await import('next/cache');
    expect(revalidatePath).toHaveBeenCalledWith('/campaigns');
    expect(revalidatePath).toHaveBeenCalledWith('/');
    expect(revalidatePath).toHaveBeenCalledWith('/jobs');
    expect(revalidatePath).toHaveBeenCalledWith('/applications');
  });
});
