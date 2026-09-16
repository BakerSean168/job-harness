import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STAGES,
  JOB_STATES,
  buildJobIdentityKey,
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

describe('job identity', () => {
  it('prefers source external identity over URL and composite identity', () => {
    expect(
      buildJobIdentityKey({
        companyName: 'Acme',
        title: 'Agent Engineer',
        city: 'Hangzhou',
        canonicalUrl: 'https://example.com/jobs/1',
        externalIdentity: { source: 'Moka', externalId: 'ABC-1' },
      }),
    ).toBe('external:moka:abc-1');
  });

  it('normalizes canonical URLs before using them for dedupe', () => {
    expect(
      buildJobIdentityKey({
        companyName: 'Acme',
        title: 'Agent Engineer',
        canonicalUrl: 'https://example.com/jobs/1/?utm_source=chatgpt#details',
      }),
    ).toBe('url:https://example.com/jobs/1');
  });
});

describe('hash-router job identity', () => {
  it('preserves semantic Moka #/job routes while still dropping decorative hashes', () => {
    expect(
      buildJobIdentityKey({
        companyName: 'DeepSeek',
        title: 'Agent Harness',
        canonicalUrl: 'https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/8d40c764-d2b2-49b1-826c-e3f2adb75c01',
      }),
    ).toContain('#/job/8d40c764-d2b2-49b1-826c-e3f2adb75c01');
    expect(
      buildJobIdentityKey({
        companyName: 'Acme',
        title: 'Agent',
        canonicalUrl: 'https://example.com/jobs/1#details',
      }),
    ).toBe('url:https://example.com/jobs/1');
  });
});
