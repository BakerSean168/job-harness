import { describe, expect, it } from 'vitest';
import {
  ApplicationSchema,
  JobSchema,
  UpsertJobsBatchInputSchema,
} from '../src';

const now = '2026-09-16T08:00:00.000Z';

describe('canonical contracts', () => {
  it('rejects Application stages masquerading as Job states', () => {
    const parsed = JobSchema.safeParse({
      id: 'job-1',
      companyId: 'company-1',
      companyName: 'Acme',
      title: 'AI Agent Engineer',
      city: 'Hangzhou',
      state: 'screening',
      description: null,
      listings: [],
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects Job states masquerading as Application stages', () => {
    const parsed = ApplicationSchema.safeParse({
      id: 'app-1',
      jobId: 'job-1',
      currentStage: 'shortlisted',
      appliedAt: now,
      resumeProfileId: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a listing-aware batch discovered by an external AI without coupling to a search provider', () => {
    const parsed = UpsertJobsBatchInputSchema.safeParse({
      jobs: [
        {
          companyName: 'Acme',
          title: 'AI Agent Engineer',
          city: 'Hangzhou',
          listings: [{
            sourceKind: 'official',
            url: 'https://example.com/jobs/1',
            identityKind: 'url',
            status: 'active',
          }],
          observedAt: now,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
