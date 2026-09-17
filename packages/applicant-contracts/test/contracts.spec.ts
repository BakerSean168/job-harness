import { describe, expect, it } from 'vitest';
import { ApplicationAnswerEntrySchema } from '../src';

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
