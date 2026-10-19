import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('verified listing state and evidence order', () => {
  it('verifies scoped careers listings by exact job/listing IDs with idempotent evidence and no duplicate jobs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-scoped-verification-'));
    dirs.push(dir);
    const store = new SqliteCareerStore(join(dir, 'career.db'));
    try {
      const career = createCareerApplicationService(store, { now: () => '2026-10-20T01:00:00Z' });
      const careers = 'https://example.com/careers';
      const jobs = await career.jobs.upsertJobsBatch({ jobs: ['AI Product Engineer', 'Backend Developer'].map((title) => ({
        companyName: 'Example Labs', title, city: 'Hangzhou',
        observedAt: '2026-10-19T00:00:00Z',
        listings: [{ sourceKind: 'official' as const, label: 'Careers',
          identityKind: 'scoped' as const, url: careers, status: 'unknown' as const }],
      })) });
      expect(jobs.items.map((x) => x.status)).toEqual(['inserted', 'inserted']);
      const firstId = jobs.items[0]!.jobId!;
      const secondId = jobs.items[1]!.jobId!;
      const firstListing = (await career.jobs.getJob(firstId))!.listings[0]!;
      const secondListing = (await career.jobs.getJob(secondId))!.listings[0]!;
      const verification = {
        jobId: firstId, listingId: firstListing.id,
        status: 'active' as const, verificationKind: 'open_confirmed' as const,
        observedAt: '2026-10-20T00:00:00Z', evidenceUrl: careers,
        verificationNote: 'The employer careers page lists this specific role as open.',
        idempotencyKey: 'verify-scoped-example-1',
      };
      const result = await career.jobs.verifyExistingListing(verification);
      expect(result).toMatchObject({
        jobId: firstId, listingId: firstListing.id, verificationKind: 'open_confirmed',
        evidenceUrl: careers, availability: 'active',
      });
      expect(await career.jobs.verifyExistingListing(verification)).toEqual(result);
      await expect(career.jobs.verifyExistingListing({
        ...verification, evidenceUrl: 'https://example.com/other-url',
      })).rejects.toThrow();
      await expect(career.jobs.verifyExistingListing({
        ...verification, listingId: secondListing.id, idempotencyKey: 'verify-scoped-foreign',
      })).rejects.toThrow();
      await expect(career.jobs.verifyExistingListing({
        ...verification, status: 'closed', idempotencyKey: 'verify-scoped-mismatch',
      })).rejects.toThrow();
      expect((await career.jobs.getJob(firstId))!.listings).toMatchObject([{
        id: firstListing.id, status: 'active', lastVerifiedOpenAt: '2026-10-20T00:00:00Z',
      }]);
      expect((await career.jobs.getJob(secondId))!.listings).toMatchObject([{
        id: secondListing.id, lastVerifiedOpenAt: null,
      }]);
      expect((await career.jobs.searchJobs({ limit: 50 })).total).toBe(2);
    } finally {
      store.close();
    }
  });

  it('keeps verified closure against newer search hits and older contradictory verification; restores with a newer explicit opening', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-state-evidence-'));
    dirs.push(dir);
    const store = new SqliteCareerStore(join(dir, 'career.db'));
    try {
      const career = createCareerApplicationService(store, { now: () => '2026-10-20T00:00:00Z' });
      const url = 'https://example.com/jobs/evidence';
      const base = {
        companyName: 'Evidence Corp', title: 'Frontend Developer', city: 'Hangzhou',
        listings: [{ sourceKind: 'official' as const, url, identityKind: 'url' as const, status: 'active' as const }],
      };
      const inserted = await career.jobs.upsertJobsBatch({ jobs: [{ ...base, observedAt: '2026-10-01T00:00:00Z' }] });
      const id = inserted.items[0]!.jobId!;
      const deadline = {
        precision: 'date' as const, date: '2026-10-25', timeZone: 'Asia/Shanghai',
        sourceText: '25 Oct 2026', sourceUrl: url, observedAt: '2026-10-01T00:00:00Z',
      };
      await career.jobs.upsertJobsBatch({ jobs: [{
        ...base, observedAt: '2026-10-03T00:00:00Z',
        listings: [{
          ...base.listings[0], status: 'active', applicationDeadline: deadline, closingPolicy: 'fixed_deadline',
        }],
      }] });
      await career.jobs.upsertJobsBatch({ jobs: [{
        ...base, observedAt: '2026-10-05T00:00:00Z',
        listings: [{ ...base.listings[0], status: 'closed', verificationKind: 'closed_confirmed',
          closureReason: 'filled', evidenceUrl: url, verificationNote: 'Employer says recruitment completed' }],
      }] });
      await career.jobs.upsertJobsBatch({ jobs: [{
        ...base, observedAt: '2026-10-06T00:00:00Z',
        listings: [{ ...base.listings[0], status: 'active' }],
      }] });
      await career.jobs.upsertJobsBatch({ jobs: [{
        ...base, observedAt: '2026-10-04T00:00:00Z',
        listings: [{ ...base.listings[0], status: 'active', verificationKind: 'open_confirmed', evidenceUrl: url }],
      }] });
      const afterStale = await career.jobs.getJob(id);
      expect(afterStale?.listings[0]).toMatchObject({
        status: 'closed', lastVerifiedAt: '2026-10-05T00:00:00Z',
        closedAt: '2026-10-05T00:00:00Z', closureReason: 'filled',
        applicationDeadline: { date: '2026-10-25' },
      });
      await career.jobs.upsertJobsBatch({ jobs: [{
        ...base, observedAt: '2026-10-07T00:00:00Z',
        listings: [{ ...base.listings[0], status: 'active', verificationKind: 'open_confirmed',
          applicationDeadline: null, closingPolicy: 'rolling', evidenceUrl: url }],
      }] });
      const reopened = await career.jobs.getJob(id);
      expect(reopened?.listings[0]).toMatchObject({
        status: 'active', lastVerifiedAt: '2026-10-07T00:00:00Z',
        lastVerifiedOpenAt: '2026-10-07T00:00:00Z', closedAt: null,
        closureReason: null, closingPolicy: 'rolling', applicationDeadline: null,
      });
      // Individual verified facts survive the current Listing projection.
      const detail = await career.workspace.getJobDetail(id);
      expect(detail?.observations.map((x) => x.observation.verificationKind)).toEqual(
        expect.arrayContaining(['closed_confirmed', 'open_confirmed'])
      );
    } finally {
      store.close();
    }
  });
});
