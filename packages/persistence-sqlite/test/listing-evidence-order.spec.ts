import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('verified listing state and evidence order', () => {
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
