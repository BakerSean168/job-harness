import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CareerConflictError, createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src/store';

let dir: string | null = null;
let store: SqliteCareerStore | null = null;

afterEach(async () => {
  store?.close();
  store = null;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe('DiscoveryRun durable outcomes', () => {
  it('persists failed/aborted evidence and rejects incomplete outcome metadata', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-discovery-outcome-'));
    store = new SqliteCareerStore(join(dir, 'career.db'));
    let idSequence = 0;
    const career = createCareerApplicationService(store, { now: () => '2026-09-21T10:00:00.000Z', idFactory: () => `run-${++idSequence}` });

    const failedRun = await career.discovery.beginDiscoveryRun({
      campaignId: null,
      executor: 'manual',
      contextSnapshot: { source: 'fixture' },
      startedAt: '2026-09-21T09:00:00.000Z',
      idempotencyKey: 'failed-run',
    });
    expect(failedRun).toMatchObject({ status: 'running', failureCode: null, failureReason: null, completedAt: null });

    await expect(career.discovery.completeDiscoveryRun({
      runId: failedRun.id,
      completedAt: '2026-09-21T09:01:00.000Z',
      status: 'failed',
      failureCode: null,
      failureReason: 'provider unavailable',
      candidateCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      rejectedCount: 1,
    })).rejects.toBeInstanceOf(CareerConflictError);

    const failed = await career.discovery.completeDiscoveryRun({
      runId: failedRun.id,
      completedAt: '2026-09-21T09:01:00.000Z',
      status: 'failed',
      failureCode: 'provider_error',
      failureReason: 'provider unavailable',
      candidateCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      rejectedCount: 1,
    });
    expect(failed).toMatchObject({ status: 'failed', failureCode: 'provider_error', failureReason: 'provider unavailable' });

    const abortedRun = await career.discovery.beginDiscoveryRun({
      campaignId: null,
      executor: 'manual',
      contextSnapshot: { source: 'fixture' },
      startedAt: '2026-09-21T09:05:00.000Z',
      idempotencyKey: 'aborted-run',
    });
    const aborted = await career.discovery.completeDiscoveryRun({
      runId: abortedRun.id,
      completedAt: '2026-09-21T09:06:00.000Z',
      status: 'aborted',
      failureCode: 'operator_stop',
      failureReason: 'operator stopped the bounded canary',
      candidateCount: 4,
      insertedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
    });
    expect(aborted).toMatchObject({ status: 'aborted', failureCode: 'operator_stop' });
  });
});
