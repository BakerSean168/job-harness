import { describe, expect, it } from 'vitest';
import type { SiteResumeBinding, SubmissionIntent } from '@job-harness/contracts';
import { exactSiteResumeBindingExists, makeAtsBindingTarget, managedSiteIntentRoute, sameManagedJob } from '../src/lib/ats-binding-targets';

const intent = (overrides: Partial<SubmissionIntent> = {}): SubmissionIntent => ({
  id: 'intent-1', jobId: 'job-1', listingId: 'listing-1', channel: 'liepin',
  resumeProfileId: 'ai-agent-app', resumeRevisionId: 'rev-1', resumeArtifactId: 'artifact-1',
  executor: 'browser-extension', executorSessionId: null,
  externalTargetUrl: 'https://www.liepin.com/job/1985379181.shtml?from=search', status: 'planned',
  externalStartedAt: null, externalConfirmedAt: null, appliedAt: null, externalReference: null,
  externalEvidence: {}, applicationId: null, submissionId: null, lastError: null, retryCount: 0,
  note: null, idempotencyKey: 'intent-key', requestHash: 'a'.repeat(64),
  createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z', ...overrides,
});
const binding = (overrides: Partial<SiteResumeBinding> = {}): SiteResumeBinding => ({
  id: 'binding-1', siteFamily: 'liepin', browserAgentId: 'windows-chrome-primary', profileId: 'ai-agent-app',
  resumeRevisionId: 'rev-1', resumeArtifactId: 'artifact-1', externalResumeLabel: 'AI Agent简历', assurance: 'user-confirmed-label',
  characterizationRunId: 'run-1', characterizationFormStateHash: 'b'.repeat(64), characterizationObservedAt: '2026-09-18T00:00:00.000Z',
  status: 'active', createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z', revokedAt: null,
  idempotencyKey: 'binding-key', requestHash: 'c'.repeat(64), revokeIdempotencyKey: null, revokeRequestHash: null, ...overrides,
});

describe('ATS pending binding targets', () => {
  it('normalizes managed-site jobs to stable host/path and rejects unsupported routes', () => {
    expect(managedSiteIntentRoute(intent())).toEqual({ siteFamily: 'liepin', targetUrl: 'https://www.liepin.com/job/1985379181.shtml' });
    expect(managedSiteIntentRoute(intent({ externalTargetUrl: 'https://www.liepin.com/a/123.shtml' }))).toBeNull();
    expect(managedSiteIntentRoute(intent({ externalTargetUrl: 'https://example.com/job/1' }))).toBeNull();
    expect(sameManagedJob('https://www.liepin.com/job/1.shtml?a=1', 'https://www.liepin.com/job/1.shtml?b=2')).toBe(true);
  });

  it('treats only the exact frozen Profile/Revision/Artifact as an existing binding', () => {
    const route = managedSiteIntentRoute(intent())!;
    expect(exactSiteResumeBindingExists(intent(), route, [binding()])).toBe(true);
    expect(exactSiteResumeBindingExists(intent(), route, [binding({ resumeRevisionId: 'old-rev' })])).toBe(false);
    expect(exactSiteResumeBindingExists(intent(), route, [binding({ status: 'revoked', revokedAt: '2026-09-18T01:00:00.000Z', revokeIdempotencyKey: 'r', revokeRequestHash: 'd'.repeat(64) })])).toBe(false);
  });

  it('builds a UI target from the same frozen intent evidence', () => {
    const detail: any = { job: { title: 'AI Agent应用开发工程师', companyName: 'Example AI' } };
    expect(makeAtsBindingTarget(intent(), detail)).toEqual({
      intentId: 'intent-1', jobId: 'job-1', siteFamily: 'liepin', targetUrl: 'https://www.liepin.com/job/1985379181.shtml',
      profileId: 'ai-agent-app', resumeRevisionId: 'rev-1', resumeArtifactId: 'artifact-1', title: 'AI Agent应用开发工程师', companyName: 'Example AI',
    });
  });
});
