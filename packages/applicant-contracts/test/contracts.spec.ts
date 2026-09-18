import { describe, expect, it } from 'vitest';
import { ApplicantProfileSchema, ApplicationAnswerEntrySchema } from '../src';

const base = {
  id: 'answer-1',
  key: 'legal.visa_sponsorship_required',
  label: '需要签证担保',
  sensitivity: 'legal' as const,
  aliases: ['Will you require sponsorship?'],
  enabled: true,
};

describe('ApplicationAnswerEntry runtime invariants', () => {
  it('rejects a literal whose runtime shape disagrees with valueType', () => {
    expect(ApplicationAnswerEntrySchema.safeParse({ ...base, valueType: 'boolean', value: 'no', siteHost: null }).success).toBe(false);
    expect(ApplicationAnswerEntrySchema.safeParse({ ...base, valueType: 'multi_choice', value: 'Hangzhou', siteHost: null }).success).toBe(false);
    expect(ApplicationAnswerEntrySchema.safeParse({ ...base, valueType: 'text', value: ['Hangzhou'], siteHost: null }).success).toBe(false);
  });

  it('requires a canonical bare site hostname and rejects ambiguous scope values', () => {
    const parsed = ApplicationAnswerEntrySchema.parse({ ...base, valueType: 'boolean', value: false, siteHost: 'jobs.example.com' });
    expect(parsed.siteHost).toBe('jobs.example.com');
    expect(ApplicationAnswerEntrySchema.safeParse({ ...base, valueType: 'boolean', value: false, siteHost: 'Jobs.Example.COM.' }).success).toBe(false);
    expect(ApplicationAnswerEntrySchema.safeParse({ ...base, valueType: 'boolean', value: false, siteHost: 'https://jobs.example.com/apply' }).success).toBe(false);
    expect(ApplicationAnswerEntrySchema.safeParse({ ...base, valueType: 'boolean', value: false, siteHost: 'jobs.example.com:443' }).success).toBe(false);
  });

  it('validates typed email and URL literals', () => {
    expect(ApplicationAnswerEntrySchema.safeParse({ ...base, key: 'contact.email', sensitivity: 'sensitive', aliases: [], valueType: 'email', value: 'not-email', siteHost: null }).success).toBe(false);
    expect(ApplicationAnswerEntrySchema.safeParse({ ...base, key: 'links.portfolio', sensitivity: 'public', aliases: [], valueType: 'url', value: 'not-url', siteHost: null }).success).toBe(false);
  });
});


describe('ApplicantProfile stable autofill facts', () => {
  const profile = {
    id: 'default-applicant', version: 1, displayName: 'Candidate', phone: null, email: 'candidate@example.com', location: null,
    website: null, github: null, education: [], targetRoles: ['AI Agent'], targetCities: ['杭州'], availableFrom: null, notes: null,
    createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
  };

  it('keeps new personal facts nullable for migrated profiles and validates explicit values', () => {
    expect(ApplicantProfileSchema.parse(profile)).toMatchObject({ gender: null, birthDate: null, jobSearchStatus: null });
    expect(ApplicantProfileSchema.parse({ ...profile, gender:'male', birthDate:'2001-04-09', jobSearchStatus:'actively_looking' })).toMatchObject({ gender:'male', birthDate:'2001-04-09', jobSearchStatus:'actively_looking' });
    expect(ApplicantProfileSchema.safeParse({ ...profile, gender:'unknown' }).success).toBe(false);
    expect(ApplicantProfileSchema.safeParse({ ...profile, birthDate:'2001-13-40' }).success).toBe(false);
  });
});
