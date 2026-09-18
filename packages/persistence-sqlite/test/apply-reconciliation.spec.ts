import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { ApplyConflictError, createApplyControlPlane } from '@job-harness/apply-runtime';
import { SqliteApplyStore, SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe('manual-review reconciliation-only execution', () => {
  it('allows only the frozen read-only readiness contract for needs_manual_review intents', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-apply-reconcile-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');
    const careerStore = new SqliteCareerStore(databasePath);
    const applyStore = new SqliteApplyStore(databasePath);
    let id = 0;
    const now = () => '2026-09-18T05:30:00.000Z';
    const career = createCareerApplicationService(careerStore, { now, idFactory: () => `career-${++id}` });
    const imported = await career.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Example', title: 'Agent Engineer', city: '上海', observedAt: now(),
      listings: [{ sourceKind: 'other', url: 'https://www.nowcoder.com/jobs/detail/463747', identityKind: 'url', status: 'active' }],
    }] });
    const job = await career.jobs.getJob(imported.items[0]!.jobId!);
    const intent = await career.submissionIntents.prepare({
      jobId: job!.id, listingId: job!.listings[0]!.id, executor: 'other', externalTargetUrl: job!.listings[0]!.url,
      idempotencyKey: 'prepare-reconcile-fixture',
    });
    await career.submissionIntents.fail({
      intentId: intent.id, occurredAt: now(), status: 'needs_manual_review', error: 'uncertain external result',
      externalEvidence: { site: 'nowcoder' },
    });

    const apply = createApplyControlPlane(
      applyStore,
      { async create(input) { return {
        intentId: input.intentId, attemptId: input.attemptId, jobId: job!.id, listingId: job!.listings[0]!.id,
        listingUrl: job!.listings[0]!.url, company: job!.companyName, title: job!.title, city: job!.city,
        resumeProfileId: null, resumeRevisionId: null, resumeArtifact: null, applicantCatalogVersion: null,
        answerSetVersion: null, answerSetHash: null, policySnapshot: input.policySnapshot, createdAt: input.createdAt,
      }; } },
      { async markManualReview() {} },
      { now, idFactory: () => `apply-${++id}`, leaseTokenFactory: () => `lease-${'x'.repeat(48)}` },
    );

    const base = {
      intentId: intent.id,
      executionMode: 'fill_only' as const,
      requiredAdapterId: 'readiness-v1',
      preferredBrowserBackend: 'extension',
      requiredCapabilities: ['humanControl'] as const,
      policySnapshot: {
        reconciliationOnly: true, readinessOnly: true, allowFormFill: false, allowApplicationEntry: false, submitAllowed: false,
      },
    };

    await expect(apply.attempts.dispatch({
      ...base,
      idempotencyKey: 'bad-reconcile-write-enabled',
      policySnapshot: { ...base.policySnapshot, allowFormFill: true },
    })).rejects.toBeInstanceOf(ApplyConflictError);

    await expect(apply.attempts.dispatch({
      ...base,
      idempotencyKey: 'bad-reconcile-wrong-backend',
      preferredBrowserBackend: 'steel',
    })).rejects.toBeInstanceOf(ApplyConflictError);

    const attempt = await apply.attempts.dispatch({ ...base, idempotencyKey: 'good-reconcile-read-only' });
    expect(attempt).toMatchObject({
      state: 'queued', executionMode: 'fill_only', requiredAdapterId: 'readiness-v1', preferredBrowserBackend: 'extension',
      externalEffectState: 'not_crossed',
    });

    applyStore.close();
    careerStore.close();
  });
});
