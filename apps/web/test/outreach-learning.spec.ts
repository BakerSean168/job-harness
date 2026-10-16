import { describe, expect, it } from 'vitest';
import { GREETING_PREVIEW_CHARS, charCount, greetingPreview, outreachGuide, outreachSamples } from '../src/lib/outreach-learning';

describe('outreach learning content', () => {
  it('renders the three parts: BOSS greeting, sending the resume, job email', () => {
    expect(outreachGuide.sections.map((s) => s.id)).toEqual(['boss', 'resume', 'email']);
    for (const sec of outreachGuide.sections) {
      expect(sec.facts.length).toBeGreaterThan(0);
      expect(sec.examples.length).toBeGreaterThan(0);
      expect(sec.checklist.length).toBeGreaterThan(0);
    }
  });

  it('only cites known, linked sources', () => {
    const known = new Set(outreachGuide.sources.map((s) => s.id));
    for (const s of outreachGuide.sources) expect(s.url).toMatch(/^https?:\/\//);
    for (const sec of outreachGuide.sections) for (const id of sec.sources) expect(known.has(id), `${sec.id} cites ${id}`).toBe(true);
    const cited = new Set(outreachGuide.sections.flatMap((s) => s.sources));
    expect([...known].every((id) => cited.has(id))).toBe(true);
  });

  it('labels every greeting draft as a 示例', () => {
    expect(outreachSamples).toHaveLength(4);
    expect(new Set(outreachSamples.map((s) => s.id)).size).toBe(outreachSamples.length);
    for (const s of outreachSamples) {
      expect(s.status).toBe('示例');
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('splits the HR-visible preview by characters, not bytes', () => {
    const text = '26届本科，5个月前端实习，熟悉 Vue 3、React';
    const { head, rest } = greetingPreview(text);
    expect(charCount(head)).toBe(GREETING_PREVIEW_CHARS);
    expect(head + rest).toBe(text);
    expect(greetingPreview('短句').rest).toBe('');
  });
});
