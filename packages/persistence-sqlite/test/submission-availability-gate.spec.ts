import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true }))); });

describe('new external submission eligibility gate', () => {
  it('blocks expired deadlines at prepare and begin while preserving pre-existing application intent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-applyability-'));
    dirs.push(dir);
    const store = new SqliteCareerStore(join(dir, 'career.db'));
    let now = '2026-10-15T08:00:00Z';
    const career = createCareerApplicationService(store, { now: () => now });
    const url = 'https://example.com/jobs/gate';
    const deadline = {
      precision: 'datetime' as const, at: '2026-10-20T00:00:00+08:00',
      sourceText: 'Apply before Oct 20', sourceUrl: url,
      observedAt: now,
    };
    try {
      const jobs = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Gate Corp', title: 'Fullstack Engineer', city: 'Shanghai', observedAt: now,
        listings: [{ sourceKind: 'official', url, identityKind: 'url', status: 'active',
          closingPolicy: 'fixed_deadline', applicationDeadline: deadline }],
      }] });
      const jobId = jobs.items[0]!.jobId!;
      const job = await career.jobs.getJob(jobId);
      const listingId = job!.listings[0]!.id;
      const planned = await career.submissionIntents.prepare({
        jobId, listingId, executor: 'manual', idempotencyKey: 'prepared-before-expiry',
      });
      now = '2026-10-21T00:00:00Z';
      await expect(career.submissionIntents.prepare({
        jobId, listingId, executor: 'manual', idempotencyKey: 'prepared-after-expiry',
      })).rejects.toThrow(/deadline_passed/);
      await expect(career.submissionIntents.begin({
        intentId: planned.id, occurredAt: now,
      })).rejects.toThrow(/deadline_passed/);
      expect((await career.submissionIntents.get(planned.id))?.status).toBe('planned');
      // A previously recorded application is immutable recruiting history:
      // expiry prevents new external effects, not a retroactive record.
      const recorded = await career.applications.recordApplication({
        jobId, listingId, appliedAt: '2026-10-16T00:00:00Z', actor: 'user', idempotencyKey: 'past-application',
      });
      expect(recorded.application.jobId).toBe(jobId);
    } finally { store.close(); }
  });
});
