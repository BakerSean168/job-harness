import { describe, expect, it } from 'vitest';
import type { CareerRuntimePorts } from '@job-harness/application';
import { ApplyConflictError, ApplyNotReadyError } from '@job-harness/apply-runtime';
import type { ResumeArtifact, ResumeRevision } from '@job-harness/resume-contracts';
import type { SiteResumeBinding } from '@job-harness/contracts';
import { createApplyBundleFactory } from '../src/apply-bundle';

const createdAt = '2026-09-18T09:45:00.000Z';
const intent = {
  id: 'intent-zhilian-1', jobId: 'job-1', listingId: 'listing-1', externalTargetUrl: 'https://www.zhaopin.com/jobdetail/CC1.htm', status: 'planned',
  resumeProfileId: 'ai-agent-forgeflow', resumeRevisionId: 'rev-1', resumeArtifactId: 'artifact-1',
};
const job = {
  id: 'job-1', companyName: 'Example', title: 'Agent Engineer', city: '杭州',
  listings: [{ id: 'listing-1', url: 'https://www.zhaopin.com/jobdetail/CC1.htm' }],
};
const career = { submissionIntents: { async get() { return intent; } }, jobs: { async getJob() { return job; } } } as unknown as CareerRuntimePorts;
const artifact = {
  id: 'artifact-1', revisionId: 'rev-1', kind: 'pdf', mimeType: 'application/pdf', sha256: 'a'.repeat(64), byteSize: 1234,
} as ResumeArtifact;
const revision = {
  id: 'rev-1', profileId: 'ai-agent-forgeflow', contentHash: 'b'.repeat(64),
  resolvedDocumentSnapshot: { output: { pdfName: 'candidate.pdf', documentTitle: 'Candidate' } },
} as unknown as ResumeRevision;
const resumeStore = {
  async getArtifact(id: string) { return id === artifact.id ? artifact : null; },
  async getRevision(id: string) { return id === revision.id ? revision : null; },
};
const binding: SiteResumeBinding = {
  id: 'binding-1', siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary', profileId: 'ai-agent-forgeflow', resumeRevisionId: 'rev-1', resumeArtifactId: 'artifact-1',
  externalResumeLabel: 'AI Agent简历', assurance: 'user-confirmed-label', characterizationRunId: 'run-1', characterizationFormStateHash: 'c'.repeat(64),
  characterizationObservedAt: createdAt, status: 'active', createdAt, updatedAt: createdAt, revokedAt: null, idempotencyKey: 'bind-1', requestHash: 'd'.repeat(64),
  revokeIdempotencyKey: null, revokeRequestHash: null,
};
const bindingStore = { async get(id: string) { return id === binding.id ? binding : null; } };

describe('ApplyBundle site-managed resume evidence', () => {
  it('freezes the exact active site resume binding into the bundle', async () => {
    const factory = createApplyBundleFactory(career, resumeStore, null, bindingStore);
    const bundle = await factory.create({
      intentId: intent.id, attemptId: 'attempt-1', createdAt,
      policySnapshot: { siteResumeBindingId: binding.id, requiredBrowserAgentId: binding.browserAgentId },
    });
    expect(bundle.siteResumeBinding).toEqual(expect.objectContaining({
      id: binding.id, siteFamily: 'zhilian', browserAgentId: binding.browserAgentId, profileId: intent.resumeProfileId,
      resumeRevisionId: intent.resumeRevisionId, resumeArtifactId: intent.resumeArtifactId, externalResumeLabel: binding.externalResumeLabel,
    }));
    expect(bundle.resumeArtifact).toEqual(expect.objectContaining({ id: 'artifact-1', sha256: 'a'.repeat(64), fileName: 'candidate.pdf' }));
  });

  it('rejects a binding for a different browser account or resume artifact', async () => {
    const factory = createApplyBundleFactory(career, resumeStore, null, bindingStore);
    await expect(factory.create({
      intentId: intent.id, attemptId: 'attempt-agent-mismatch', createdAt,
      policySnapshot: { siteResumeBindingId: binding.id, requiredBrowserAgentId: 'other-chrome' },
    })).rejects.toBeInstanceOf(ApplyConflictError);
    const wrong = { ...binding, resumeArtifactId: 'artifact-other' };
    const wrongStore = { async get() { return wrong; } };
    await expect(createApplyBundleFactory(career, resumeStore, null, wrongStore).create({
      intentId: intent.id, attemptId: 'attempt-artifact-mismatch', createdAt,
      policySnapshot: { siteResumeBindingId: wrong.id, requiredBrowserAgentId: wrong.browserAgentId },
    })).rejects.toBeInstanceOf(ApplyConflictError);
  });

  it('requires frozen site-resume evidence before supervised submit on characterized managed sites', async () => {
    const factory = createApplyBundleFactory(career, resumeStore, null, bindingStore);
    await expect(factory.create({
      intentId: intent.id, attemptId: 'attempt-submit-without-binding', createdAt,
      policySnapshot: { submitAllowed: true },
    })).rejects.toBeInstanceOf(ApplyNotReadyError);
  });
});
