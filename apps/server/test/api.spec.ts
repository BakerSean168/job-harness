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
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json();
  return { response, body };
}

describe('REST v1 facade', () => {
  it('runs the Job -> Application -> Dashboard path through application ports', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-api-'));
    running = await startJobHarnessServer({ databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0 });

    const campaign = await json('/campaigns/campaign-agent', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'AI Agent Search',
        targetRoles: ['AI Agent Engineer'],
        cities: ['Hangzhou'],
        graduationYears: [2026],
        experience: ['0-1y'],
        keywords: ['Agent'],
        exclusions: [],
        sources: ['official'],
        resumeProfileIds: [],
        status: 'active',
      }),
    });
    expect(campaign.response.status).toBe(200);
    expect(campaign.body).toMatchObject({ id: 'campaign-agent', status: 'active' });

    const inserted = await json('/jobs/batch', {
      method: 'POST',
      body: JSON.stringify({
        jobs: [{
          companyName: 'Acme AI',
          title: 'AI Agent Engineer',
          city: 'Hangzhou',
          listings: [{
            sourceKind: 'official',
            url: 'https://jobs.example.com/agent-1',
            identityKind: 'url',
            status: 'active',
          }],
          observedAt: '2026-09-16T08:00:00.000Z',
        }],
      }),
    });
    expect(inserted.response.status).toBe(200);
    expect(inserted.body.items[0]).toMatchObject({ status: 'inserted' });
    const jobId = String(inserted.body.items[0].jobId);

    const jobs = await json('/jobs?states=discovered&sourceKinds=official&limit=20&offset=0');
    expect(jobs.response.status).toBe(200);
    expect(jobs.body.total).toBe(1);
    expect(jobs.body.items[0]).toMatchObject({
      jobId,
      companyName: 'Acme AI',
      primaryListing: { sourceKind: 'official' },
    });

    const state = await json(`/jobs/${jobId}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'shortlisted', idempotencyKey: 'shortlist-api-1' }),
    });
    expect(state.response.status).toBe(200);
    expect(state.body.state).toBe('shortlisted');

    const applied = await json('/applications', {
      method: 'POST',
      body: JSON.stringify({
        jobId,
        appliedAt: '2026-09-16T09:00:00.000Z',
        idempotencyKey: 'apply-api-1',
        actor: 'user',
        note: 'Submitted manually',
      }),
    });
    expect(applied.response.status).toBe(201);
    expect(applied.body.application).toMatchObject({ jobId, currentStage: 'applied' });
    const applicationId = String(applied.body.application.id);

    const transitioned = await json(`/applications/${applicationId}/transition`, {
      method: 'POST',
      body: JSON.stringify({
        toStage: 'screening',
        occurredAt: '2026-09-16T10:00:00.000Z',
        idempotencyKey: 'screen-api-1',
        actor: 'system',
      }),
    });
    expect(transitioned.response.status).toBe(200);
    expect(transitioned.body.application.currentStage).toBe('screening');

    const board = await json('/applications?stages=screening');
    expect(board.response.status).toBe(200);
    expect(board.body.total).toBe(1);
    expect(board.body.items[0]).toMatchObject({
      companyName: 'Acme AI',
      application: { id: applicationId, currentStage: 'screening' },
      latestEvent: { type: 'stage_changed' },
    });

    const activeOnly = await json('/applications?terminal=exclude');
    expect(activeOnly.response.status).toBe(200);
    expect(activeOnly.body.total).toBe(1);
    const outcomesOnly = await json('/applications?terminal=only');
    expect(outcomesOnly.response.status).toBe(200);
    expect(outcomesOnly.body.total).toBe(0);
    const invalidTerminal = await json('/applications?terminal=maybe');
    expect(invalidTerminal.response.status).toBe(400);
    expect(invalidTerminal.body.error.code).toBe('VALIDATION_ERROR');

    const jobDetail = await json(`/jobs/${jobId}`);
    expect(jobDetail.body).toMatchObject({
      job: { id: jobId, state: 'shortlisted' },
      application: { application: { id: applicationId, currentStage: 'screening' } },
    });

    const applicationDetail = await json(`/applications/${applicationId}`);
    expect(applicationDetail.body).toMatchObject({
      application: { id: applicationId, currentStage: 'screening' },
      job: { id: jobId },
      stageEnteredAt: '2026-09-16T10:00:00.000Z',
    });

    const dashboard = await json('/dashboard');
    expect(dashboard.body.kpis).toMatchObject({ knownJobs: 1, shortlisted: 1, applications: 1, activePipeline: 1 });
    expect(dashboard.body.funnel.screening).toBe(1);

    const campaigns = await json('/campaigns');
    expect(campaigns.body.total).toBe(1);
    const campaignDetail = await json('/campaigns/campaign-agent');
    expect(campaignDetail.body.name).toBe('AI Agent Search');

    const invalidTransition = await json(`/applications/${applicationId}/transition`, {
      method: 'POST',
      body: JSON.stringify({
        toStage: 'applied',
        occurredAt: '2026-09-16T11:00:00.000Z',
        idempotencyKey: 'invalid-api-1',
        actor: 'user',
      }),
    });
    expect(invalidTransition.response.status).toBe(422);
    expect(invalidTransition.body.error.code).toBe('INVALID_TRANSITION');

    const invalidQuery = await json('/jobs?applied=maybe');
    expect(invalidQuery.response.status).toBe(400);
    expect(invalidQuery.body.error.code).toBe('VALIDATION_ERROR');

    const missing = await json('/jobs/missing-job');
    expect(missing.response.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('protects REST with the same bearer boundary as MCP', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-api-auth-'));
    running = await startJobHarnessServer({
      databasePath: join(dir, 'career.db'),
      host: '127.0.0.1',
      port: 0,
      authToken: 'test-secret',
    });

    const unauthorized = await fetch(`${running.apiUrl}/dashboard`);
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });

    const authorized = await fetch(`${running.apiUrl}/dashboard`, {
      headers: { authorization: 'Bearer test-secret' },
    });
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toMatchObject({ kpis: { knownJobs: 0, applications: 0 } });
  });
});
