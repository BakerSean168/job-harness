import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { ApplyConflictError, createApplyControlPlane } from '@job-harness/apply-runtime';
import { SqliteApplyStore, SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

const t0 = '2026-09-17T13:00:00.000Z';
const t1 = '2026-09-17T13:01:00.000Z';
const t2 = '2026-09-17T13:02:00.000Z';
const t3 = '2026-09-17T13:03:00.000Z';
const t4 = '2026-09-17T13:04:00.000Z';
const t5 = '2026-09-17T13:05:00.000Z';
const t6 = '2026-09-17T13:06:00.000Z';
const formHash = 'a'.repeat(64);

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'jh-submit-safety-'));
  dirs.push(dir);
  const databasePath = join(dir, 'career.db');
  const careerStore = new SqliteCareerStore(databasePath);
  const applyStore = new SqliteApplyStore(databasePath);
  let clock = t0;
  let careerId = 0;
  const career = createCareerApplicationService(careerStore, { now: () => clock, idFactory: () => `career-${++careerId}` });
  const inserted = await career.jobs.upsertJobsBatch({ jobs: [{
    companyName: 'Safety Co', title: 'Frontend Engineer', city: 'Hangzhou', observedAt: t0,
    listings: [{ sourceKind: 'official', url: 'https://jobs.example.test/safety', identityKind: 'url', status: 'active' }],
  }] });
  const job = await career.jobs.getJob(inserted.items[0]!.jobId!);
  const listing = job!.listings[0]!;
  const intent = await career.submissionIntents.prepare({
    jobId: job!.id, listingId: listing.id, executor: 'other', externalTargetUrl: listing.url, idempotencyKey: 'intent-safety-1',
  });
  const safetyCalls: Array<{ kind: string; intentId: string }> = [];
  let applyId = 0;
  const apply = createApplyControlPlane(
    applyStore,
    { async create(input) { return {
      intentId: input.intentId, attemptId: input.attemptId, jobId: job!.id, listingId: listing.id, listingUrl: listing.url,
      company: job!.companyName, title: job!.title, city: job!.city, resumeProfileId: null, resumeRevisionId: null, resumeArtifact: null,
      applicantCatalogVersion: 'fixture-v1', answerSetVersion: null, answerSetHash: null, policySnapshot: input.policySnapshot, createdAt: input.createdAt,
    }; } },
    {
      async beginExternal(input) { safetyCalls.push({ kind: 'begin', intentId: input.intentId }); },
      async confirmExternal(input) { safetyCalls.push({ kind: 'confirm', intentId: input.intentId }); },
      async failExternal(input) { safetyCalls.push({ kind: `fail:${input.status}`, intentId: input.intentId }); },
      async markManualReview(input) { safetyCalls.push({ kind: 'manual', intentId: input.intentId }); },
    },
    { now: () => clock, idFactory: () => `apply-${++applyId}`, leaseTokenFactory: () => `lease-${'x'.repeat(50)}-${applyId}` },
  );
  await apply.executors.register({
    executorId: 'safety-worker', name: 'Safety Worker', version: '1', status: 'ready', browserBackends: ['steel'], adapterIds: ['generic-ats'], executionModes: ['fill_only'],
    capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: true, semanticMapping: false }, maxConcurrency: 1, metadata: {},
  });
  const attempt = await apply.attempts.dispatch({
    intentId: intent.id, executionMode: 'fill_only', requiredAdapterId: 'generic-ats', preferredBrowserBackend: 'steel', requiredCapabilities: ['humanControl'], policySnapshot: {}, idempotencyKey: 'dispatch-safety-1',
  });
  return {
    dir, careerStore, applyStore, apply, attempt, intent, safetyCalls,
    setClock(value: string) { clock = value; },
  };
}

async function claimStart(f: Awaited<ReturnType<typeof fixture>>) {
  const claim = await f.apply.attempts.claim({ executorId: 'safety-worker', leaseSeconds: 300 });
  if (!claim) throw new Error('expected claim');
  await f.apply.attempts.start({
    attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: claim.leaseToken,
    adapterId: 'generic-ats', adapterVersion: '1.0.0', browserBackend: 'steel', checkpoint: 'review-capture',
  });
  return claim.leaseToken;
}

describe('review snapshot and submit authorization safety boundary', () => {
  it('binds user authorization to the exact redacted form-state hash before crossing the external-effect boundary', async () => {
    const f = await fixture();
    f.setClock(t1);
    const lease1 = await claimStart(f);
    const snapshot = await f.apply.attempts.createReviewSnapshot({
      attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease1, formStateHash: formHash,
      formVersion: 'form-v1-fixture', catalogVersion: 'fixture-v1', siteAdapterId: 'generic-ats', siteAdapterVersion: '1.0.0',
      browserSessionRef: 'steel-session-1',
      summary: { fieldCount: 8, bindingCount: 8, filled: 8, failed: 0, manual: 0, requiredPending: 0, prohibitedCount: 0, blockingIssueCodes: [], readyForSubmit: true },
    });
    expect(snapshot.reviewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(snapshot)).not.toContain('Fixture User');

    f.setClock(t2);
    await f.apply.attempts.waiting({
      attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease1, reasonCode: 'review_ready', summary: 'Ready for review',
      browserSessionHandoff: { backendId: 'steel', sessionRef: 'steel-session-1', humanControlUrl: 'https://viewer.example.test/ui', retainedAt: t2, expiresAt: '2026-09-17T13:20:00.000Z' },
    });
    const authorization = await f.apply.attempts.authorizeSubmit({
      attemptId: f.attempt.id, reviewSnapshotId: snapshot.id, expiresInSeconds: 300, idempotencyKey: 'authorize-safety-1', actor: 'user',
    });
    const retry = await f.apply.attempts.authorizeSubmit({
      attemptId: f.attempt.id, reviewSnapshotId: snapshot.id, expiresInSeconds: 300, idempotencyKey: 'authorize-safety-1', actor: 'user',
    });
    expect(retry.id).toBe(authorization.id);
    expect(authorization.status).toBe('active');

    f.setClock(t3);
    await f.apply.attempts.resume({ attemptId: f.attempt.id });
    await f.apply.executors.heartbeat({ executorId: 'safety-worker', status: 'ready' });
    const lease2 = await claimStart(f);
    await expect(f.apply.attempts.beginSubmit({
      attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease2, authorizationId: authorization.id,
      formStateHash: 'b'.repeat(64), occurredAt: t3,
    })).rejects.toBeInstanceOf(ApplyConflictError);
    expect(f.safetyCalls).toEqual([]);

    f.setClock(t4);
    const boundary = await f.apply.attempts.beginSubmit({
      attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease2, authorizationId: authorization.id,
      formStateHash: formHash, occurredAt: t4,
    });
    expect(boundary.externalEffectState).toBe('crossed');
    expect(boundary.authorization.status).toBe('consumed');
    expect(f.safetyCalls).toEqual([{ kind: 'begin', intentId: f.intent.id }]);
    const detail = await f.apply.attempts.get(f.attempt.id);
    expect(detail?.events.map((event) => event.type)).toContain('submit_authorized');
    expect(detail?.events.map((event) => event.type)).toContain('submit_triggered');

    f.setClock(t5);
    const completed = await f.apply.attempts.reportSubmitSuccess({
      attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease2, confirmedAt: t5, appliedAt: t5,
      externalReference: 'fixture-confirmation-123', externalEvidence: { confirmationKind: 'fixture' },
    });
    expect(completed).toMatchObject({ state: 'completed', externalEffectState: 'crossed' });
    expect(f.safetyCalls).toEqual([{ kind: 'begin', intentId: f.intent.id }, { kind: 'confirm', intentId: f.intent.id }]);
    const after = await f.apply.attempts.get(f.attempt.id);
    expect(after?.events.map((event) => event.type)).toContain('external_success_observed');
    expect(after?.events.map((event) => event.type)).toContain('attempt_completed');

    f.applyStore.close(); f.careerStore.close();
  });

  it('refuses authorization when the redacted review says required form work is still blocking', async () => {
    const f = await fixture();
    f.setClock(t1);
    const lease = await claimStart(f);
    const snapshot = await f.apply.attempts.createReviewSnapshot({
      attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease, formStateHash: formHash,
      formVersion: 'form-v1-fixture', catalogVersion: 'fixture-v1', siteAdapterId: 'generic-ats', siteAdapterVersion: '1.0.0',
      summary: { fieldCount: 8, bindingCount: 7, filled: 7, failed: 0, manual: 1, requiredPending: 1, prohibitedCount: 0, blockingIssueCodes: ['required_field_pending'], readyForSubmit: false },
    });
    f.setClock(t2);
    await f.apply.attempts.waiting({ attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease, reasonCode: 'manual_review', summary: 'Blocked' });
    await expect(f.apply.attempts.authorizeSubmit({ attemptId: f.attempt.id, reviewSnapshotId: snapshot.id, expiresInSeconds: 300, idempotencyKey: 'blocked-auth', actor: 'user' }))
      .rejects.toBeInstanceOf(ApplyConflictError);
    f.applyStore.close(); f.careerStore.close();
  });

  it('routes an uncertain post-boundary result to manual review rather than allowing a retry-submit loop', async () => {
    const f = await fixture();
    f.setClock(t1);
    const lease1 = await claimStart(f);
    const snapshot = await f.apply.attempts.createReviewSnapshot({
      attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease1, formStateHash: formHash,
      formVersion: 'f', catalogVersion: 'c', siteAdapterId: 'generic-ats', siteAdapterVersion: '1', browserSessionRef: 's1',
      summary: { fieldCount: 1, bindingCount: 1, filled: 1, failed: 0, manual: 0, requiredPending: 0, prohibitedCount: 0, blockingIssueCodes: [], readyForSubmit: true },
    });
    await f.apply.attempts.waiting({ attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease1, reasonCode: 'review_ready', summary: 'Ready', browserSessionHandoff: { backendId: 'steel', sessionRef: 's1', humanControlUrl: null, retainedAt: t1, expiresAt: '2026-09-17T13:20:00.000Z' } });
    const auth = await f.apply.attempts.authorizeSubmit({ attemptId: f.attempt.id, reviewSnapshotId: snapshot.id, idempotencyKey: 'uncertain-auth', actor: 'user' });
    f.setClock(t3);
    await f.apply.attempts.resume({ attemptId: f.attempt.id });
    await f.apply.executors.heartbeat({ executorId: 'safety-worker', status: 'ready' });
    const lease2 = await claimStart(f);
    await f.apply.attempts.beginSubmit({ attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease2, authorizationId: auth.id, formStateHash: formHash, occurredAt: t4 });
    f.setClock(t6);
    const failed = await f.apply.attempts.reportSubmitFailure({ attemptId: f.attempt.id, executorId: 'safety-worker', leaseToken: lease2, occurredAt: t6, outcome: 'uncertain', error: 'Connection lost after click', externalEvidence: { stage: 'after-click' } });
    expect(failed).toMatchObject({ state: 'failed', externalEffectState: 'uncertain' });
    expect(f.safetyCalls.map((item) => item.kind)).toEqual(['begin','fail:needs_manual_review']);
    await f.apply.executors.heartbeat({ executorId: 'safety-worker', status: 'ready' });
    expect(await f.apply.attempts.claim({ executorId: 'safety-worker', leaseSeconds: 90 })).toBeNull();
    f.applyStore.close(); f.careerStore.close();
  });
});
