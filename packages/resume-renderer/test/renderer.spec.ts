import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ResolvedResumeSchema } from '@job-harness/resume-contracts';
import { formatResumePeriod, getResumeCss, renderResumeHtml, rewriteResumePreviewHtml } from '../src';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = '2026-09-17T01:44:00.000Z';
void at;

function resolved(locale: 'zh-CN' | 'en' = 'zh-CN') {
  return ResolvedResumeSchema.parse({
    libraryId: 'primary', libraryVersion: 1, profileId: 'ai-agent', profileVersion: 1, locale, templateId: 'classic-v1',
    positioning: locale === 'en' ? 'AI Agent Engineer' : 'AI Agent 工程师',
    output: { documentTitle: locale === 'en' ? 'Test Resume' : '测试简历', description: null, onlineUrl: null, pdfName: null },
    layout: { header: 'without-photo', pageSize: 'A4' },
    sectionOrder: ['education', 'skills', 'projects', 'work', 'certificates', 'summary'],
    basics: {
      displayName: locale === 'en' ? 'Test User' : '测试用户',
      contact: { phone: '13800000000', email: 'test@example.com', website: 'https://example.com', github: 'https://github.com/example', location: null },
      photoAssetId: null,
    },
    education: [{ id: 'school', institution: locale === 'en' ? 'Example University' : '示例大学', institutionTag: null, major: locale === 'en' ? 'Computer Science' : '计算机科学', degree: locale === 'en' ? 'B.Eng.' : '本科', department: null, studyType: null, location: locale === 'en' ? 'Hangzhou' : '杭州', period: { start: '2022-09', end: '2026-06', current: false, note: null }, courseSummary: null }],
    skills: [{ id: 'skill', label: null, content: '<strong>TypeScript:</strong> strict typing', keywords: ['TypeScript'] }],
    workExperiences: [{ id: 'work', company: 'Example Co.', role: 'Engineer', department: null, location: 'Hangzhou', period: { start: '2025-07', end: '2025-11', current: false, note: null }, bullets: [{ id: 'b1', content: '<strong>Delivery:</strong> shipped features' }] }],
    projects: [{ id: 'body-sense', name: 'BodySense', role: 'Full-stack', location: null, period: { start: '2026-01', end: null, current: true, note: null }, links: [{ label: null, url: 'https://example.com/body-sense' }], description: 'Agent product', stack: 'React + Go + Python', highlights: [{ id: 'h1', label: 'Runtime:', detail: 'checkpoint + HITL' }] }],
    certificates: [{ id: 'cet6', label: 'CET-6', issuer: null, issuedAt: null }],
    summaries: [{ id: 'summary', label: 'Focus:', detail: 'AI application engineering' }],
  });
}

describe('resume renderer', () => {
  it('renders the existing semantic template from a resolved domain document', () => {
    const html = renderResumeHtml(resolved());
    expect(html).toContain('<main id="resume-wrapper" class="resume">');
    expect(html).toContain('测试用户');
    expect(html).toContain('AI Agent 工程师');
    expect(html).toContain('<strong>TypeScript:</strong> strict typing');
    expect(html).toContain('2022年09月 - 2026年06月');
  });

  it('formats semantic dates per locale', () => {
    expect(formatResumePeriod({ start: '2022-09', end: '2026-06', current: false, note: null }, 'zh-CN')).toBe('2022年09月 - 2026年06月');
    expect(formatResumePeriod({ start: '2026-01', end: null, current: true, note: null }, 'en')).toBe('Jan 2026 - Present');
  });

  it('rewrites preview resource URLs without changing persisted HTML', () => {
    expect(rewriteResumePreviewHtml('<link href="./resume.css"><img src="./assets/a.png">', { cssHref: '/resume/css', assetsBase: '/resume/assets' }))
      .toBe('<link href="/resume/css"><img src="/resume/assets/a.png">');
  });

  it('preserves the frozen legacy template and CSS source bytes', () => {
    const manifest = fs.readFileSync(path.join(root, 'test/fixtures/legacy/source-sha256.txt'), 'utf8').trim().split('\n');
    for (const line of manifest) {
      const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
      expect(match).not.toBeNull();
      const [, expected, relative] = match!;
      const actual = createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
      expect(actual, relative).toBe(expected);
    }
    expect(getResumeCss()).toContain('@media print');
  });

  it('records all five legacy rendered HTML hashes without committing personal HTML', () => {
    const manifest = fs.readFileSync(path.join(root, 'test/fixtures/legacy/html-sha256.txt'), 'utf8').trim().split('\n');
    expect(manifest).toHaveLength(5);
    for (const line of manifest) expect(line).toMatch(/^[a-f0-9]{64}\s+test\/fixtures\/legacy\/[a-z0-9-]+\.html$/);
  });
});
