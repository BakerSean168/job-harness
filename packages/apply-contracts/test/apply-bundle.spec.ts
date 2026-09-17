import { describe, expect, it } from 'vitest';
import { ApplyBundleSchema } from '../src';

const base = {
  intentId: 'intent-1',
  attemptId: 'attempt-1',
  jobId: 'job-1',
  listingId: 'listing-1',
  listingUrl: 'https://jobs.example.test/apply',
  company: 'Example',
  title: 'Frontend Engineer',
  city: '杭州',
  resumeProfileId: null,
  resumeRevisionId: null,
  resumeArtifact: null,
  applicantCatalogVersion: null,
  applicantProfileRevisionId: null,
  applicantProfileHash: null,
  answerSetRevisionId: null,
  answerSetVersion: null,
  answerSetHash: null,
  policySnapshot: {},
  createdAt: '2026-09-17T16:30:00.000Z',
};

describe('ApplyBundle frozen evidence invariants', () => {
  it('requires applicant profile revision id/hash to travel together', () => {
    expect(ApplyBundleSchema.safeParse({
      ...base,
      applicantCatalogVersion: `applicant-snapshot:${'a'.repeat(64)}`,
      applicantProfileRevisionId: 'profile-rev-1',
    }).success).toBe(false);
  });

  it('requires complete answer-set evidence and a catalog version', () => {
    expect(ApplyBundleSchema.safeParse({
      ...base,
      answerSetRevisionId: 'answers-rev-1',
      answerSetVersion: 'answer-set:answers-rev-1:v1',
      answerSetHash: 'b'.repeat(64),
    }).success).toBe(false);
    expect(ApplyBundleSchema.safeParse({
      ...base,
      applicantCatalogVersion: `applicant-snapshot:${'c'.repeat(64)}`,
      answerSetRevisionId: 'answers-rev-1',
      answerSetVersion: 'answer-set:answers-rev-1:v1',
      answerSetHash: 'b'.repeat(64),
    }).success).toBe(true);
  });

  it('binds a PDF artifact to the exact frozen Resume revision', () => {
    const artifact = {
      id: 'artifact-1', revisionId: 'resume-rev-2', sha256: 'd'.repeat(64), byteSize: 42,
      mimeType: 'application/pdf', fileName: 'resume.pdf',
    };
    expect(ApplyBundleSchema.safeParse({ ...base, resumeRevisionId: 'resume-rev-1', resumeArtifact: artifact }).success).toBe(false);
    expect(ApplyBundleSchema.safeParse({ ...base, resumeRevisionId: 'resume-rev-2', resumeArtifact: artifact }).success).toBe(true);
  });
});
