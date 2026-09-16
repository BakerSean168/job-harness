import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STAGES,
  JOB_STATES,
  buildJobListingIdentityKey,
  buildOpportunityCandidateKey,
  canTransitionApplicationStage,
  canTransitionJobState,
} from '../src';

describe('career domain vocabulary', () => {
  it('keeps Job state and Application stage separate', () => {
    expect(JOB_STATES).not.toContain('screening');
    expect(APPLICATION_STAGES).not.toContain('shortlisted');
  });

  it('keeps terminal application stages terminal', () => {
    expect(canTransitionApplicationStage('rejected', 'screening')).toBe(false);
    expect(canTransitionApplicationStage('offer', 'interview')).toBe(false);
    expect(canTransitionApplicationStage('interview', 'interview')).toBe(true);
  });

  it('supports reversible human triage and explicit rediscovery of a closed job', () => {
    expect(canTransitionJobState('ignored', 'shortlisted')).toBe(true);
    expect(canTransitionJobState('closed', 'discovered')).toBe(true);
  });
});

describe('JobListing identity', () => {
  it('uses source namespace + external id as strong listing identity', () => {
    expect(buildJobListingIdentityKey({
      sourceKind: 'moka',
      identityKind: 'external-id',
      externalNamespace: 'Moka',
      externalId: 'ABC-1',
    })).toBe('external:moka:abc-1');
  });

  it('normalizes URL identities without turning them into Opportunity identity', () => {
    expect(buildJobListingIdentityKey({
      sourceKind: 'official',
      identityKind: 'url',
      url: 'https://example.com/jobs/1/?utm_source=chatgpt#details',
    })).toBe('url:https://example.com/jobs/1');
    expect(buildOpportunityCandidateKey({
      companyName: 'Acme',
      title: 'Agent Engineer',
      city: 'Hangzhou',
    })).toBe('candidate:acme:agent engineer:hangzhou');
  });

  it('returns no global identity for a scoped generic careers listing', () => {
    expect(buildJobListingIdentityKey({
      sourceKind: 'official',
      identityKind: 'scoped',
      url: 'https://example.com/careers',
    })).toBeNull();
  });
});

describe('hash-router listing identity', () => {
  it('preserves semantic Moka #/job routes while still dropping decorative hashes', () => {
    expect(buildJobListingIdentityKey({
      sourceKind: 'moka',
      identityKind: 'url',
      url: 'https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/8d40c764-d2b2-49b1-826c-e3f2adb75c01',
    })).toContain('#/job/8d40c764-d2b2-49b1-826c-e3f2adb75c01');
    expect(buildJobListingIdentityKey({
      sourceKind: 'official',
      identityKind: 'url',
      url: 'https://example.com/jobs/1#details',
    })).toBe('url:https://example.com/jobs/1');
  });
});
