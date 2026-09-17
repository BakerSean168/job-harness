import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { ApplyNotReadyError, createApplyControlPlane } from '@job-harness/apply-runtime';
import { SqliteApplyStore, SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

const times = [
  '2026-09-17T12:00:00.000Z',
  '2026-09-17T12:01:00.000Z',
  '2026-09-17T12:02:00.000Z',
  '2026-09-17T12:03:00.000Z',
  '2026-09-17T12:04:00.000Z',
  '2026-09-17T12:20:01.000Z',
] as const;

describe('durable browser session handoff', () => {
  it('retains only an opaque browser-session reference across human handoff and rejects silent resume after expiry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-apply-handoff-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');
    const careerStore = new SqliteCareerStore(databasePath);
    const applyStore = new SqliteApplyStore(databasePath);
    let clock: string = times[0];
    let careerId = 0;
    const career = createCareerApplicationService(careerStore, { now: () => clock, idFactory: () => `career-${++careerId}` });
    const inserted = await career.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Handoff Co', title: 'Frontend Engineer', city: 'Hangzhou', observedAt: clock,
      listings: [{ sourceKind: 'official', url: 'https://jobs.example.test/handoff', identityKind: 'url', status: 'active' }],
    }] });
    const job = await career.jobs.getJob(inserted.items[0]!.jobId!);
    const listing = job!.listings[0]!;
    const intent = await career.submissionIntents.prepare({
      jobId: job!.id, listingId: listing.id, executor: 'other', externalTargetUrl: listing.url, idempotencyKey: 'handoff-intent',
    });

    let applyId = 0;
    const apply = createApplyControlPlane(
      applyStore,
      { async create(input) { return {
        intentId: input.intentId, attemptId: input.attemptId, jobId: job!.id, listingId: listing.id, listingUrl: listing.url,
        company: job!.companyName, title: job!.title, city: job!.city, resumeProfileId: null, resumeRevisionId: null,
        resumeArtifact: null, applicantCatalogVersion: null, answerSetVersion: null, answerSetHash: null,
        policySnapshot: input.policySnapshot, createdAt: input.createdAt,
      }; } },
      { async markManualReview() {} },
      { now: () => clock, idFactory: () => `apply-${++applyId}`, leaseTokenFactory: () => `lease-${'x'.repeat(48)}-${applyId}` },
    );
    await apply.executors.register({
      executorId: 'steel-worker', name: 'Steel Worker', version: '1', status: 'ready', browserBackends: ['steel'], adapterIds: ['generic-ats'],
      executionModes: ['fill_only'], capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: true, semanticMapping: false }, maxConcurrency: 1, metadata: {},
    });

    const dispatch = async (key: string) => apply.attempts.dispatch({
      intentId: intent.id, executionMode: 'fill_only', requiredAdapterId: 'generic-ats', preferredBrowserBackend: 'steel',
      requiredCapabilities: ['humanControl'], policySnapshot: { readinessOnly: false }, idempotencyKey: key,
    });
    const first = await dispatch('handoff-dispatch-1');
    clock = times[1];
    const claim = await apply.attempts.claim({ executorId: 'steel-worker', leaseSeconds: 90 });
    await apply.attempts.start({ attemptId: first.id, executorId: 'steel-worker', leaseToken: claim!.leaseToken, adapterId: 'generic-ats', adapterVersion: '1', browserBackend: 'steel' });
    clock = times[2];
    const handoff = {
      backendId: 'steel',
      sessionRef: 'steel-session-opaque-123',
      humanControlUrl: 'https://viewer.example.test/ui',
      retainedAt: times[2],
      expiresAt: '2026-09-17T12:20:00.000Z',
    } as const;
    const waiting = await apply.attempts.waiting({
      attemptId: first.id, executorId: 'steel-worker', leaseToken: claim!.leaseToken, checkpoint: 'review',
      reasonCode: 'human_review', summary: 'Review the filled form', browserSessionHandoff: handoff,
    });
    expect(waiting).toMatchObject({ state: 'waiting_for_user', leaseOwner: null, browserSessionHandoff: handoff });
    const stored = await apply.attempts.get(first.id);
    expect(stored?.attempt.browserSessionHandoff).toEqual(handoff);
    expect(JSON.stringify(stored)).not.toContain('cookie');

    clock = times[3];
    const resumed = await apply.attempts.resume({ attemptId: first.id });
    expect(resumed).toMatchObject({ state: 'queued', browserSessionHandoff: handoff });
    await apply.executors.heartbeat({ executorId: 'steel-worker', status: 'ready' });
    const reclaimed = await apply.attempts.claim({ executorId: 'steel-worker', leaseSeconds: 90 });
    expect(reclaimed?.attempt.browserSessionHandoff).toEqual(handoff);
    await apply.attempts.start({ attemptId: first.id, executorId: 'steel-worker', leaseToken: reclaimed!.leaseToken, adapterId: 'generic-ats', adapterVersion: '1', browserBackend: 'steel' });
    const completed = await apply.attempts.complete({ attemptId: first.id, executorId: 'steel-worker', leaseToken: reclaimed!.leaseToken, checkpoint: 'review-complete' });
    expect(completed.browserSessionHandoff).toBeNull();

    clock = times[4];
    const second = await dispatch('handoff-dispatch-2');
    await apply.executors.heartbeat({ executorId: 'steel-worker', status: 'ready' });
    const secondClaim = await apply.attempts.claim({ executorId: 'steel-worker', leaseSeconds: 90 });
    await apply.attempts.start({ attemptId: second.id, executorId: 'steel-worker', leaseToken: secondClaim!.leaseToken, adapterId: 'generic-ats', adapterVersion: '1', browserBackend: 'steel' });
    await apply.attempts.waiting({
      attemptId: second.id, executorId: 'steel-worker', leaseToken: secondClaim!.leaseToken, reasonCode: 'human_review', summary: 'Review',
      browserSessionHandoff: { ...handoff, retainedAt: times[4], expiresAt: '2026-09-17T12:20:00.000Z' },
    });
    clock = times[5];
    await expect(apply.attempts.resume({ attemptId: second.id })).rejects.toBeInstanceOf(ApplyNotReadyError);
    expect((await apply.attempts.get(second.id))?.attempt.state).toBe('waiting_for_user');

    applyStore.close();
    careerStore.close();
  });
});
