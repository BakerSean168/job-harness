import { describe, expect, it } from 'vitest';
import { facetValues, filterSamples, resumeSamples, rulesForSection, writingGuide } from '../src/lib/resume-learning';

describe('resume learning content', () => {
  it('keeps every sample sourced, dated in YYYY[-MM] form and tagged', () => {
    const ids = new Set<string>();
    for (const s of resumeSamples) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.source_url).toMatch(/^https?:\/\//);
      if (s.resume_date !== null) expect(s.resume_date).toMatch(/^\d{4}(-(0[1-9]|1[0-2]))?$/);
      expect(s.role_tags.length).toBeGreaterThan(0);
      expect(s.level_tags.length).toBeGreaterThan(0);
      expect(['good', 'mixed', 'bad-example']).toContain(s.quality);
      expect(['zh', 'en']).toContain(s.language);
      expect(s.excerpts.length).toBeGreaterThan(0);
    }
  });

  it('only cites sources that exist in the guide source table', () => {
    const known = new Set(writingGuide.sources.map((s) => s.id));
    for (const rule of writingGuide.rules) {
      expect(['must', 'should', 'avoid']).toContain(rule.strength);
      for (const id of rule.sources) expect(known.has(id), `${rule.id} cites ${id}`).toBe(true);
    }
  });

  it('places every rule in a rendered guide section', () => {
    const rendered = writingGuide.sections.reduce((n, sec) => n + rulesForSection(writingGuide, sec.id).length, 0);
    expect(rendered).toBe(writingGuide.rules.length);
  });

  it('filters by role, year and keyword and sorts newest first', () => {
    const facets = facetValues(resumeSamples);
    expect(facets.roles).toContain('前端');
    const fe = filterSamples(resumeSamples, { role: '前端' });
    expect(fe.length).toBeGreaterThan(0);
    expect(fe.every((s) => s.role_tags.includes('前端'))).toBe(true);
    const dates = fe.map((s) => s.resume_date ?? '');
    expect([...dates].sort().reverse()).toEqual(dates);
    const y = facets.years[0]!;
    expect(filterSamples(resumeSamples, { year: y }).every((s) => s.resume_date?.startsWith(y))).toBe(true);
    expect(filterSamples(resumeSamples, { q: 'zzz-no-such-keyword' })).toEqual([]);
  });
});
