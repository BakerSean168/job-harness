import { describe, expect, it } from 'vitest';
import { locales, messagesFor } from '../src/i18n';

const pageKeys = [
  'overview',
  'inbox',
  'jobs',
  'applications',
  'companies',
  'campaigns',
  'resumes',
  'discovery',
  'analytics',
  'settings',
].sort();

describe('Web i18n catalogs', () => {
  it('keeps every supported locale complete for stable workspace routes', () => {
    for (const locale of locales) {
      const messages = messagesFor(locale);
      expect(Object.keys(messages.pages).sort()).toEqual(pageKeys);
      expect(Object.values(messages.nav).every((value) => value.trim().length > 0)).toBe(true);
      expect(Object.values(messages.pages).every((page) => page.title.trim() && page.description.trim())).toBe(true);
      expect(messages.meta.description.trim().length).toBeGreaterThan(0);
    }
  });
});
