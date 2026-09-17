import { describe, expect, it } from 'vitest';
import type { ResolvedResume } from '@job-harness/resume-contracts';
import { diffResumeSnapshots, hashResolvedResume } from '../src';

const resolved: ResolvedResume = {
  libraryId: 'primary', libraryVersion: 1, profileId: 'agent', profileVersion: 1,
  locale: 'zh-CN', templateId: 'classic-v1', positioning: 'Agent 工程师',
  output: { documentTitle: 'Agent 简历', description: null, onlineUrl: null, pdfName: 'Agent' },
  layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'],
  basics: { displayName: '张三', contact: { phone: null, email: null, website: null, github: null, location: null }, photoAssetId: null },
  education: [], skills: [{ id: 'typescript', label: null, content: 'TypeScript', keywords: ['typescript'] }], workExperiences: [], projects: [], certificates: [], summaries: [],
};

describe('Resume revision primitives', () => {
  it('hashes canonical resume content independently of object key order', () => {
    const reordered = {
      ...resolved,
      output: { pdfName: 'Agent', onlineUrl: null, description: null, documentTitle: 'Agent 简历' },
      basics: { photoAssetId: null, contact: { location: null, github: null, website: null, email: null, phone: null }, displayName: '张三' },
    } as ResolvedResume;
    expect(hashResolvedResume(resolved)).toBe(hashResolvedResume(reordered));
  });

  it('emits JSON-pointer changes while preserving ordered array semantics', () => {
    const next = structuredClone(resolved);
    next.positioning = 'Senior Agent 工程师';
    next.skills[0]!.content = 'TypeScript / Zod';
    next.skills.push({ id: 'python', label: null, content: 'Python', keywords: ['python'] });
    expect(diffResumeSnapshots(resolved, next)).toEqual([
      { path: '/positioning', kind: 'changed', before: 'Agent 工程师', after: 'Senior Agent 工程师' },
      { path: '/skills/0/content', kind: 'changed', before: 'TypeScript', after: 'TypeScript / Zod' },
      { path: '/skills/1', kind: 'added', before: null, after: { id: 'python', label: null, content: 'Python', keywords: ['python'] } },
    ]);
  });
});
