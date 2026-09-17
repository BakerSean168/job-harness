import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '@job-harness/persistence-sqlite';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
});

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${running!.apiUrl}${path}`, {
    ...init,
    headers: { authorization: 'Bearer intent-secret', 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const type = response.headers.get('content-type') ?? '';
  return { response, body: type.includes('application/json') ? await response.json() : await response.text() };
}

describe('SubmissionIntent durable external-action boundary', () => {
  it('persists intent before the side effect and reconciles confirmed success idempotently', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-intent-'));
    running = await startJobHarnessServer({ databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0, authToken: 'intent-secret' });
    const at = '2026-09-17T06:10:00.000Z';

    const inserted = await request('/jobs/batch', { method: 'POST', body: JSON.stringify({ jobs: [{
      companyName: 'Intent Co', title: 'AI Engineer', city: 'Hangzhou',
      listings: [{ sourceKind: 'boss', url: 'https://example.invalid/intent-job', identityKind: 'url', status: 'active' }],
      observedAt: at,
    }] }) });
    const jobId = String((inserted.body as any).items[0].jobId);
    const jobDetail = await request(`/jobs/${encodeURIComponent(jobId)}`);
    const listingId = String((jobDetail.body as any).primaryListing.id);

    const prepareBody = {
      jobId, listingId, executor: 'job-honey', externalTargetUrl: 'https://example.invalid/intent-job',
      idempotencyKey: 'intent-prepare-1', note: 'browser executor handoff',
    };
    const prepared = await request('/submission-intents', { method: 'POST', body: JSON.stringify(prepareBody) });
    expect(prepared.response.status).toBe(201);
    expect(prepared.body).toMatchObject({ jobId, listingId, executor: 'job-honey', status: 'planned', retryCount: 0 });
    const intentId = String((prepared.body as any).id);

    const prepareRetry = await request('/submission-intents', { method: 'POST', body: JSON.stringify(prepareBody) });
    expect((prepareRetry.body as any).id).toBe(intentId);

    const begun = await request(`/submission-intents/${encodeURIComponent(intentId)}/begin`, {
      method: 'POST', body: JSON.stringify({ occurredAt: '2026-09-17T06:11:00.000Z' }),
    });
    expect(begun.body).toMatchObject({ id: intentId, status: 'external_in_progress', externalStartedAt: '2026-09-17T06:11:00.000Z' });

    const confirmed = await request(`/submission-intents/${encodeURIComponent(intentId)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({
        confirmedAt: '2026-09-17T06:12:00.000Z',
        appliedAt: '2026-09-17T06:12:00.000Z',
        externalReference: 'boss-confirmation-123',
        externalEvidence: { confirmationText: 'submitted' },
      }),
    });
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.body).toMatchObject({ persistenceCommitted: true, intent: { id: intentId, status: 'committed', externalReference: 'boss-confirmation-123', retryCount: 0 }, application: { submissions: [expect.objectContaining({ idempotencyKey: `submission-intent:${intentId}`, channel: 'boss' })] } });
    const applicationId = String((confirmed.body as any).application.application.id);

    const confirmRetry = await request(`/submission-intents/${encodeURIComponent(intentId)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ confirmedAt: '2026-09-17T06:12:00.000Z', appliedAt: '2026-09-17T06:12:00.000Z', externalReference: 'boss-confirmation-123', externalEvidence: { confirmationText: 'submitted' } }),
    });
    expect(confirmRetry.body).toMatchObject({ persistenceCommitted: true, intent: { id: intentId, status: 'committed', applicationId } });
    expect((confirmRetry.body as any).application.submissions).toHaveLength(1);

    const listed = await request('/submission-intents?statuses=committed');
    expect(listed.body).toMatchObject({ total: 1, items: [expect.objectContaining({ id: intentId, status: 'committed' })] });
  });

  it('keeps external success durable as persistence_pending and supports bounded/manual recovery', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-intent-pending-'));
    const databasePath = join(dir, 'career.db');
    const seedStore = new SqliteCareerStore(databasePath);
    try {
      const career = createCareerApplicationService(seedStore, { now: () => '2026-09-17T06:19:00.000Z' });
      await career.resumeRegistry.syncResumeProfiles([{
        id: 'resume-pending', name: 'Pending Resume', source: 'resume-harness', externalProfileId: 'pending',
        targetRole: 'AI Engineer', version: 'v1', hash: null, artifactUri: null, updatedAt: '2026-09-17T06:19:00.000Z',
      }]);
    } finally { seedStore.close(); }
    running = await startJobHarnessServer({ databasePath, host: '127.0.0.1', port: 0, authToken: 'intent-secret', submissionReconcileIntervalMs: 0 });
    const inserted = await request('/jobs/batch', { method: 'POST', body: JSON.stringify({ jobs: [{
      companyName: 'Pending Co', title: 'AI Engineer', listings: [{ sourceKind: 'official', url: 'https://example.invalid/pending-job', identityKind: 'url', status: 'active' }], observedAt: '2026-09-17T06:20:00.000Z',
    }] }) });
    const jobId = String((inserted.body as any).items[0].jobId);

    const prepared = await request('/submission-intents', { method: 'POST', body: JSON.stringify({
      jobId, executor: 'browser-extension', executorSessionId: 'browser-session-42', resumeProfileId: 'resume-pending', idempotencyKey: 'intent-pending-1',
    }) });
    expect(prepared.response.status).toBe(201);
    expect(prepared.body).toMatchObject({ executorSessionId: 'browser-session-42', resumeProfileId: 'resume-pending' });
    const intentId = String((prepared.body as any).id);
    await request(`/submission-intents/${encodeURIComponent(intentId)}/begin`, { method: 'POST', body: JSON.stringify({ occurredAt: '2026-09-17T06:21:00.000Z' }) });

    const mutate = new DatabaseSync(databasePath);
    try { mutate.prepare('DELETE FROM resume_profile_refs WHERE id = ?').run('resume-pending'); } finally { mutate.close(); }

    const confirmed = await request(`/submission-intents/${encodeURIComponent(intentId)}/confirm`, { method: 'POST', body: JSON.stringify({ confirmedAt: '2026-09-17T06:22:00.000Z', appliedAt: '2026-09-17T06:22:00.000Z', externalEvidence: { confirmationText: 'success' } }) });
    expect(confirmed.body).toMatchObject({ persistenceCommitted: false, intent: { id: intentId, status: 'persistence_pending', retryCount: 1, externalConfirmedAt: '2026-09-17T06:22:00.000Z' }, application: null });

    const sweep = await request('/submission-intents/reconcile-pending', {
      method: 'POST', body: JSON.stringify({ limit: 10, maxAutomaticRetries: 1, staleBefore: '2099-01-01T00:00:00.000Z' }),
    });
    expect(sweep.body).toMatchObject({ scanned: 1, committed: 0, pending: 0, manualReview: 1, items: [expect.objectContaining({ intentId, beforeStatus: 'persistence_pending', afterStatus: 'needs_manual_review', action: 'manual_review' })] });

    const restore = new SqliteCareerStore(databasePath);
    try {
      await createCareerApplicationService(restore).resumeRegistry.syncResumeProfiles([{
        id: 'resume-pending', name: 'Pending Resume', source: 'resume-harness', externalProfileId: 'pending',
        targetRole: 'AI Engineer', version: 'v1', hash: null, artifactUri: null, updatedAt: '2026-09-17T06:23:00.000Z',
      }]);
    } finally { restore.close(); }

    const retried = await request(`/submission-intents/${encodeURIComponent(intentId)}/reconcile`, { method: 'POST' });
    expect(retried.body).toMatchObject({ persistenceCommitted: true, intent: { status: 'committed', retryCount: 1 }, application: { submissions: [expect.objectContaining({ idempotencyKey: `submission-intent:${intentId}` })] } });
  });

  it('reconciles durable persistence_pending work automatically after a server restart', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-intent-restart-'));
    const databasePath = join(dir, 'career.db');
    const store = new SqliteCareerStore(databasePath);
    let intentId = '';
    try {
      const career = createCareerApplicationService(store, { now: () => '2026-09-17T06:50:00.000Z' });
      await career.resumeRegistry.syncResumeProfiles([{
        id: 'resume-restart', name: 'Restart Resume', source: 'resume-harness', externalProfileId: 'restart',
        targetRole: 'Agent Engineer', version: 'v1', hash: null, artifactUri: null, updatedAt: '2026-09-17T06:49:00.000Z',
      }]);
      const jobs = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Restart Co', title: 'Agent Engineer', listings: [{ sourceKind: 'official', url: 'https://example.invalid/restart-job', identityKind: 'url', status: 'active' }], observedAt: '2026-09-17T06:49:00.000Z',
      }] });
      const jobId = jobs.items[0]!.jobId!;
      const intent = await career.submissionIntents.prepare({ jobId, executor: 'job-honey', resumeProfileId: 'resume-restart', idempotencyKey: 'restart-intent' });
      intentId = intent.id;
      await career.submissionIntents.begin({ intentId, occurredAt: '2026-09-17T06:50:00.000Z' });
      const db = new DatabaseSync(databasePath);
      try { db.prepare('DELETE FROM resume_profile_refs WHERE id = ?').run('resume-restart'); } finally { db.close(); }
      const pending = await career.submissionIntents.confirm({ intentId, confirmedAt: '2026-09-17T06:51:00.000Z', appliedAt: '2026-09-17T06:51:00.000Z', externalEvidence: { confirmationText: 'success' } });
      expect(pending.intent.status).toBe('persistence_pending');
      await career.resumeRegistry.syncResumeProfiles([{
        id: 'resume-restart', name: 'Restart Resume', source: 'resume-harness', externalProfileId: 'restart',
        targetRole: 'Agent Engineer', version: 'v1', hash: null, artifactUri: null, updatedAt: '2026-09-17T06:52:00.000Z',
      }]);
    } finally { store.close(); }

    running = await startJobHarnessServer({
      databasePath, host: '127.0.0.1', port: 0, authToken: 'intent-secret',
      submissionReconcileIntervalMs: 50, submissionStaleAfterMs: 60_000, submissionMaxAutomaticRetries: 8,
    });

    let detail: any = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      detail = (await request(`/submission-intents/${encodeURIComponent(intentId)}`)).body;
      if (detail.status === 'committed') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(detail).toMatchObject({ status: 'committed', applicationId: expect.any(String), submissionId: expect.any(String) });
  });

  it('flags stale in-progress work for manual review without fabricating external success', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-intent-stale-'));
    running = await startJobHarnessServer({ databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0, authToken: 'intent-secret', submissionReconcileIntervalMs: 0 });
    const inserted = await request('/jobs/batch', { method: 'POST', body: JSON.stringify({ jobs: [{
      companyName: 'Stale Co', title: 'Frontend Engineer', listings: [{ sourceKind: 'boss', url: 'https://example.invalid/stale-job', identityKind: 'url', status: 'active' }], observedAt: '2026-09-17T06:30:00.000Z',
    }] }) });
    const jobId = String((inserted.body as any).items[0].jobId);
    const prepared = await request('/submission-intents', { method: 'POST', body: JSON.stringify({ jobId, executor: 'job-honey', idempotencyKey: 'intent-stale-1' }) });
    const intentId = String((prepared.body as any).id);
    await request(`/submission-intents/${encodeURIComponent(intentId)}/begin`, { method: 'POST', body: JSON.stringify({ occurredAt: '2026-09-17T06:31:00.000Z' }) });

    const sweep = await request('/submission-intents/reconcile-pending', { method: 'POST', body: JSON.stringify({ staleBefore: '2099-01-01T00:00:00.000Z', limit: 10 }) });
    expect(sweep.body).toMatchObject({ manualReview: 1, items: [expect.objectContaining({ intentId, beforeStatus: 'external_in_progress', afterStatus: 'needs_manual_review', persistenceCommitted: false })] });
    const detail = await request(`/submission-intents/${encodeURIComponent(intentId)}`);
    expect(detail.body).toMatchObject({ status: 'needs_manual_review', externalConfirmedAt: null, appliedAt: null });

    const unsafeReconcile = await request(`/submission-intents/${encodeURIComponent(intentId)}/reconcile`, { method: 'POST' });
    expect(unsafeReconcile.response.status).toBe(409);

    const manuallyConfirmed = await request(`/submission-intents/${encodeURIComponent(intentId)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ confirmedAt: '2026-09-17T06:40:00.000Z', appliedAt: '2026-09-17T06:40:00.000Z', externalEvidence: { verifiedByUser: true } }),
    });
    expect(manuallyConfirmed.body).toMatchObject({ persistenceCommitted: true, intent: { status: 'committed' } });
  });
});
