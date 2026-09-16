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
      title: 'AI Agent Engineer',
      city: 'Hangzhou',
      state: 'screening',
      canonicalUrl: null,
      externalIdentities: [],
      sources: [{ kind: 'official', url: 'https://example.com/jobs/1' }],
      description: null,
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

  it('accepts a batch discovered by an external AI without coupling to a search provider', () => {
    const parsed = UpsertJobsBatchInputSchema.safeParse({
      jobs: [
        {
          companyName: 'Acme',
          title: 'AI Agent Engineer',
          city: 'Hangzhou',
          canonicalUrl: 'https://example.com/jobs/1',
          sources: [{ kind: 'official', url: 'https://example.com/jobs/1' }],
          observedAt: now,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
