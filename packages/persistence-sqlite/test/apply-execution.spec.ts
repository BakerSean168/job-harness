import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { createApplyControlPlane, ApplyConflictError, ApplyLeaseLostError } from '@job-harness/apply-runtime';
import { SqliteApplyStore, SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

const t0 = '2026-09-17T09:00:00.000Z';
const t1 = '2026-09-17T09:01:00.000Z';
const t2 = '2026-09-17T09:02:00.000Z';
const t3 = '2026-09-17T09:03:00.000Z';
const t4 = '2026-09-17T09:04:00.000Z';
const t5 = '2026-09-17T09:05:00.000Z';
const t5b = '2026-09-17T09:05:31.000Z';
const t6 = '2026-09-17T09:06:00.000Z';

describe('Apply Executor control plane', () => {
  it('keeps technical attempts separate from submission intent truth and protects leases/idempotency', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-apply-control-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');
    const careerStore = new SqliteCareerStore(databasePath);
    const applyStore = new SqliteApplyStore(databasePath);
    let clock = t0;
    let careerId = 0;
    const career = createCareerApplicationService(careerStore, { now: () => clock, idFactory: () => `career-id-${++careerId}` });

    const upserted = await career.jobs.upsertJobsBatch({
      jobs: [{
        companyName: 'Acme',
        title: 'Frontend Engineer',
        city: '杭州',
        listings: [{ sourceKind: 'official', url: 'https://jobs.example.com/roles/frontend-1', identityKind: 'url', status: 'active' }],
        observedAt: t0,
      }],
    });
    const jobId = upserted.items[0]!.jobId!;
    const job = await career.jobs.getJob(jobId);
    const listing = job!.listings[0]!;
    const intent = await career.submissionIntents.prepare({
      jobId,
      listingId: listing.id,
      executor: 'other',
      externalTargetUrl: listing.url,
      idempotencyKey: 'prepare-acme-front',
    });

    let id = 0;
    const apply = createApplyControlPlane(
      applyStore,
      {
        async create(input) {
          return {
            intentId: input.intentId,
            attemptId: input.attemptId,
            jobId,
            listingId: listing.id,
            listingUrl: listing.url,
            company: job!.companyName,
            title: job!.title,
            city: job!.city,
            resumeProfileId: null,
            resumeRevisionId: null,
            resumeArtifact: null,
            applicantCatalogVersion: input.applicantCatalogVersion,
            answerSetVersion: input.answerSetVersion,
            answerSetHash: input.answerSetHash,
            policySnapshot: input.policySnapshot,
            createdAt: input.createdAt,
          };
        },
      },
      {
        async markManualReview(input) {
          await career.submissionIntents.fail({
            intentId: input.intentId,
            occurredAt: input.occurredAt,
            status: 'needs_manual_review',
            error: input.error,
            externalEvidence: input.evidence,
          });
        },
      },
      {
        now: () => clock,
        idFactory: () => `apply-id-${++id}`,
        leaseTokenFactory: () => `lease-token-${'x'.repeat(40)}-${id}`,
      },
    );

    await apply.executors.register({
      executorId: 'oracle2-steel',
      name: 'Oracle2 Steel Worker',
      version: '0.1.0',
      status: 'ready',
      browserBackends: ['steel'],
      adapterIds: ['generic-ats'],
      executionModes: ['fill_only', 'review_then_submit'],
      capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: true, semanticMapping: false },
      maxConcurrency: 1,
      metadata: { host: 'oracle2' },
    });

    const dispatchInput = {
      intentId: intent.id,
      executionMode: 'fill_only' as const,
      requiredAdapterId: 'generic-ats',
      preferredBrowserBackend: 'steel',
      requiredCapabilities: ['humanControl'] as const,
      policySnapshot: { submit: false },
      idempotencyKey: 'dispatch-acme-front-1',
    };
    const attempt = await apply.attempts.dispatch(dispatchInput);
    expect(attempt.state).toBe('queued');
    expect((await apply.attempts.dispatch(dispatchInput)).id).toBe(attempt.id);
    await expect(apply.attempts.dispatch({ ...dispatchInput, executionMode: 'review_then_submit' }))
      .rejects.toBeInstanceOf(ApplyConflictError);
    await expect(apply.attempts.dispatch({ ...dispatchInput, idempotencyKey: 'dispatch-acme-front-active' }))
      .rejects.toBeInstanceOf(ApplyConflictError);

    clock = t1;
    const claimed = await apply.attempts.claim({ executorId: 'oracle2-steel', leaseSeconds: 90 });
    expect(claimed?.attempt.id).toBe(attempt.id);
    expect(claimed?.attempt.state).toBe('claimed');
    expect(await apply.attempts.claim({ executorId: 'oracle2-steel', leaseSeconds: 90 })).toBeNull();
    await expect(apply.attempts.heartbeat({
      attemptId: attempt.id,
      executorId: 'oracle2-steel',
      leaseToken: `wrong-${'x'.repeat(40)}`,
      leaseSeconds: 90,
    })).rejects.toBeInstanceOf(ApplyLeaseLostError);

    clock = t2;
    await apply.attempts.heartbeat({
      attemptId: attempt.id,
      executorId: 'oracle2-steel',
      leaseToken: claimed!.leaseToken,
      leaseSeconds: 90,
      checkpoint: 'browser-ready',
    });
    const running = await apply.attempts.start({
      attemptId: attempt.id,
      executorId: 'oracle2-steel',
      leaseToken: claimed!.leaseToken,
      adapterId: 'generic-ats',
      adapterVersion: '1.0.0',
      browserBackend: 'steel',
      checkpoint: 'form-open',
    });
    expect(running.state).toBe('running');

    clock = t3;
    const waiting = await apply.attempts.waiting({
      attemptId: attempt.id,
      executorId: 'oracle2-steel',
      leaseToken: claimed!.leaseToken,
      checkpoint: 'captcha',
      reasonCode: 'captcha_required',
      summary: 'Human verification required',
    });
    expect(waiting.state).toBe('waiting_for_user');
    expect(waiting.leaseOwner).toBeNull();
    expect((await apply.attempts.resume({ attemptId: attempt.id })).state).toBe('queued');

    clock = t4;
    await apply.executors.heartbeat({ executorId: 'oracle2-steel', status: 'ready' });
    const claimedAgain = await apply.attempts.claim({ executorId: 'oracle2-steel', leaseSeconds: 90 });
    await apply.attempts.start({
      attemptId: attempt.id,
      executorId: 'oracle2-steel',
      leaseToken: claimedAgain!.leaseToken,
      adapterId: 'generic-ats',
      adapterVersion: '1.0.0',
      browserBackend: 'steel',
      checkpoint: 'review',
    });
    const completed = await apply.attempts.complete({
      attemptId: attempt.id,
      executorId: 'oracle2-steel',
      leaseToken: claimedAgain!.leaseToken,
      checkpoint: 'review',
      payload: { mode: 'fill-only' },
    });
    expect(completed.state).toBe('completed');
    expect((await career.submissionIntents.get(intent.id))?.status).toBe('planned');

    const expired = await apply.attempts.dispatch({ ...dispatchInput, idempotencyKey: 'dispatch-acme-front-expired' });
    clock = t5;
    await apply.executors.heartbeat({ executorId: 'oracle2-steel', status: 'ready' });
    const expiredClaim = await apply.attempts.claim({ executorId: 'oracle2-steel', leaseSeconds: 30 });
    expect(expiredClaim?.attempt.id).toBe(expired.id);
    clock = t5b;
    expect(await apply.attempts.claim({ executorId: 'oracle2-steel', leaseSeconds: 30 })).toBeNull();
    expect((await apply.attempts.get(expired.id))?.attempt.state).toBe('abandoned');
    expect((await apply.attempts.get(expired.id))?.events.at(-1)?.type).toBe('attempt_abandoned');

    const second = await apply.attempts.dispatch({ ...dispatchInput, idempotencyKey: 'dispatch-acme-front-2' });
    clock = t6;
    await apply.executors.heartbeat({ executorId: 'oracle2-steel', status: 'ready' });
    const secondClaim = await apply.attempts.claim({ executorId: 'oracle2-steel', leaseSeconds: 90 });
    await apply.attempts.start({
      attemptId: second.id,
      executorId: 'oracle2-steel',
      leaseToken: secondClaim!.leaseToken,
      adapterId: 'generic-ats',
      adapterVersion: '1.0.0',
      browserBackend: 'steel',
    });
    const failed = await apply.attempts.fail({
      attemptId: second.id,
      executorId: 'oracle2-steel',
      leaseToken: secondClaim!.leaseToken,
      errorCode: 'browser_session_failed',
      errorSummary: 'Browser session failed before the external-effect boundary',
      externalEffectState: 'not_crossed',
      payload: { sanitized: true },
    });
    expect(failed.externalEffectState).toBe('not_crossed');
    expect((await career.submissionIntents.get(intent.id))?.status).toBe('planned');
    const retryAttempt = await apply.attempts.dispatch({ ...dispatchInput, idempotencyKey: 'dispatch-acme-front-3' });
    expect(retryAttempt.state).toBe('queued');

    const detail = await apply.attempts.get(attempt.id);
    expect(detail?.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(detail?.events.map((event) => event.type)).toEqual([
      'attempt_queued', 'attempt_claimed', 'attempt_started', 'human_action_required', 'attempt_resumed', 'attempt_claimed', 'attempt_started',
      'attempt_completed',
    ]);

    applyStore.close();
    careerStore.close();
  });
});
