import { describe, expect, it } from 'vitest';
import { validateJobBatch } from '../../../scripts/validate-job-batch';

describe('batch upsert preflight (read-only)', () => {
  const valid = {
    jobs: [{
      companyName: 'Example',
      title: 'Technical AI Product Manager',
      city: 'Hangzhou',
      observedAt: '2026-10-19T11:24:00Z',
      listings: [{
        sourceKind: 'official',
        identityKind: 'url',
        url: 'https://jobs.example.org/job/1',
        status: 'unknown',
      }],
    }],
  };

  it('accepts valid payload without mutation', () => {
    expect(validateJobBatch(valid)).toEqual({ valid: true, count: 1, issues: [], warnings: [] });
  });

  it('pinpoints nested invalid fields and rejects batches over 100', () => {
    const bad = structuredClone(valid);
    bad.jobs[0]!.listings[0]!.url = 'invalid-url';
    expect(validateJobBatch(bad)).toMatchObject({
      valid: false, count: 1, issues: [expect.objectContaining({ path: 'jobs[0].listings[0].url' })],
    });
    const oversized = { jobs: Array.from({ length: 101 }, () => valid.jobs[0]) };
    expect(validateJobBatch(oversized)).toMatchObject({
      valid: false, count: 101, issues: [expect.objectContaining({ path: 'jobs' })],
    });
  });

  it('warns on scoped-only identities and unverified active listing', () => {
    const payload = structuredClone(valid);
    payload.jobs[0]!.listings[0]!.identityKind = 'scoped';
    payload.jobs[0]!.listings[0]!.status = 'active';
    expect(validateJobBatch(payload)).toMatchObject({ valid: true, warnings: [
      expect.objectContaining({ path: 'jobs[0].listings[0].identityKind' }),
      expect.objectContaining({ path: 'jobs[0].listings[0].status' }),
    ] });
  });
});
