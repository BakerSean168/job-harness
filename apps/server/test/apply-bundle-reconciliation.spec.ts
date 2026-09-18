import { describe, expect, it } from 'vitest';
import type { CareerRuntimePorts } from '@job-harness/application';
import { ApplyConflictError } from '@job-harness/apply-runtime';
import { createApplyBundleFactory } from '../src/apply-bundle';

const intent = {
  id: 'intent-1', jobId: 'job-1', listingId: 'listing-1', externalTargetUrl: 'https://www.nowcoder.com/jobs/detail/463747',
  status: 'needs_manual_review', resumeProfileId: null, resumeRevisionId: null, resumeArtifactId: null,
};
const job = {
  id: 'job-1', companyName: 'Example', title: 'Agent Engineer', city: '上海',
  listings: [{ id: 'listing-1', url: 'https://www.nowcoder.com/jobs/detail/463747' }],
};
const career = {
  submissionIntents: { async get() { return intent; } },
  jobs: { async getJob() { return job; } },
} as unknown as CareerRuntimePorts;
const resumeStore = { async getRevision() { return null; }, async getArtifact() { return null; } };

describe('ApplyBundle manual-review reconciliation gate', () => {
  it('permits needs_manual_review only for reconciliationOnly bundle creation', async () => {
    const factory = createApplyBundleFactory(career, resumeStore);
    await expect(factory.create({ intentId: intent.id, attemptId: 'attempt-1', policySnapshot: {}, createdAt: '2026-09-18T05:30:00.000Z' }))
      .rejects.toBeInstanceOf(ApplyConflictError);
    await expect(factory.create({
      intentId: intent.id, attemptId: 'attempt-2', policySnapshot: { reconciliationOnly: true }, createdAt: '2026-09-18T05:30:00.000Z',
    })).resolves.toMatchObject({ intentId: intent.id, listingUrl: job.listings[0]!.url });
  });
});
