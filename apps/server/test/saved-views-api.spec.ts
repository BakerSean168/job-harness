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

describe('Saved Views REST API', () => {
  it('creates, filters, updates, conflicts and deletes typed Saved Views', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-saved-views-api-'));
    running = await startJobHarnessServer({ databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0, authToken: 'saved-view-secret' });
    const headers = { authorization: 'Bearer saved-view-secret', 'content-type': 'application/json' };

    const create = await fetch(`${running.apiUrl}/saved-views`, {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'saved-jobs-agent', workspace: 'jobs', name: 'Agent', definition: { title: 'Agent', state: 'shortlisted' } }),
    });
    expect(create.status).toBe(200);
    const created = await create.json() as Record<string, unknown>;
    expect(created).toMatchObject({ id: 'saved-jobs-agent', workspace: 'jobs', name: 'Agent', definition: { title: 'Agent', state: 'shortlisted' } });

    const appView = await fetch(`${running.apiUrl}/saved-views`, {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'saved-app-agent', workspace: 'applications', name: 'Agent', definition: { stage: 'screening', view: 'table' } }),
    });
    expect(appView.status).toBe(200);

    const list = await fetch(`${running.apiUrl}/saved-views?workspace=jobs&limit=20&offset=0`, { headers });
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ total: 1, items: [{ id: 'saved-jobs-agent', workspace: 'jobs' }] });

    const update = await fetch(`${running.apiUrl}/saved-views`, {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'saved-jobs-agent', workspace: 'jobs', name: 'Agent', definition: { source: 'official', applied: true } }),
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ id: 'saved-jobs-agent', definition: { source: 'official', applied: true } });

    const conflict = await fetch(`${running.apiUrl}/saved-views`, {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'saved-jobs-conflict', workspace: 'jobs', name: 'agent', definition: { city: 'Hangzhou' } }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'CONFLICT' } });

    const invalid = await fetch(`${running.apiUrl}/saved-views`, {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'saved-invalid', workspace: 'jobs', name: 'Invalid', definition: { title: 'Agent', offset: 50 } }),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const deleted = await fetch(`${running.apiUrl}/saved-views/saved-jobs-agent`, { method: 'DELETE', headers });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });
    const deletedAgain = await fetch(`${running.apiUrl}/saved-views/saved-jobs-agent`, { method: 'DELETE', headers });
    expect(await deletedAgain.json()).toEqual({ deleted: false });
  });
});
