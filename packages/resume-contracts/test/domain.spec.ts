import { describe, expect, it } from 'vitest';
import {
  LocalizedTextSchema,
  ResolvedResumeSchema,
  ResumeArtifactSchema,
  ResumeLibrarySchema,
  ResumeProfileSchema,
  ResumeRevisionSchema,
  validateResumeProfileReferences,
} from '../src';

const at = '2026-09-17T01:44:00.000Z';
const zh = (value: string) => ({ 'zh-CN': value });
const both = (cn: string, en: string) => ({ 'zh-CN': cn, en });

function library() {
  return ResumeLibrarySchema.parse({
    id: 'primary', schemaVersion: 2, version: 1,
    basics: { displayName: both('测试用户', 'Test User'), contact: { phone: null, email: 'test@example.com', website: null, github: null, location: null }, photoAssetId: null },
    education: [{ id: 'sicau', institution: both('四川农业大学', 'Sichuan Agricultural University'), major: both('物联网工程', 'IoT Engineering'), degree: both('本科', 'B.Eng.'), period: { start: '2022-09', end: '2026-06', current: false } }],
    skills: [{ id: 'agent', content: both('Agent 工程', 'Agent engineering') }],
    workExperiences: [{ id: 'krjx', company: zh('科睿金信'), role: zh('前端工程师'), period: { start: '2025-07', end: '2025-11', current: false }, bullets: [{ id: 'delivery', content: zh('交付业务功能') }] }],
    projects: [{ id: 'body-sense', name: zh('BodySense'), period: { start: '2026-01', end: null, current: true }, presentations: [{ id: 'default', description: zh('默认描述') }, { id: 'agent', description: zh('Agent 描述'), stack: zh('LangGraph') }], highlights: [{ id: 'runtime', detail: zh('Runtime') }] }],
    certificates: [{ id: 'cet6', label: zh('CET-6') }],
    summaries: [{ id: 'summary', detail: zh('总结') }],
    createdAt: at, updatedAt: at,
  });
}

function profile() {
  return ResumeProfileSchema.parse({
    id: 'ai-agent', version: 1, name: zh('AI Agent 简历'), targetRole: zh('AI Agent 工程师'), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh('AI Agent 工程师'),
    layout: { header: 'without-photo', pageSize: 'A4' },
    sectionOrder: ['education', 'skills', 'projects', 'work', 'certificates'],
    educationIds: ['sicau'], skillIds: ['agent'], workSelections: [{ experienceId: 'krjx', bulletIds: ['delivery'] }], projectSelections: [{ projectId: 'body-sense', presentationId: 'agent', highlightIds: ['runtime'] }], certificateIds: ['cet6'], summaryIds: [], overrides: [],
    createdAt: at, updatedAt: at, archivedAt: null,
  });
}

describe('Resume Domain v2 contracts', () => {
  it('requires at least one localized value', () => {
    expect(() => LocalizedTextSchema.parse({})).toThrow();
    expect(LocalizedTextSchema.parse({ en: 'Agent Engineer' })).toEqual({ en: 'Agent Engineer' });
  });

  it('rejects duplicate stable IDs and duplicate profile sections', () => {
    const source = library();
    expect(() => ResumeLibrarySchema.parse({ ...source, skills: [...source.skills, source.skills[0]] })).toThrow(/duplicate id/);
    const p = profile();
    expect(() => ResumeProfileSchema.parse({ ...p, sectionOrder: ['skills', 'skills'] })).toThrow(/duplicate section/);
  });

  it('uses explicit project presentation IDs instead of dynamic field names', () => {
    const source = library();
    const p = profile();
    expect(validateResumeProfileReferences(source, p)).toEqual([]);
    const broken = ResumeProfileSchema.parse({ ...p, projectSelections: [{ projectId: 'body-sense', presentationId: 'descriptionAgent', highlightIds: ['runtime'] }] });
    expect(validateResumeProfileReferences(source, broken)).toEqual([
      expect.objectContaining({ path: 'projectSelections.0.presentationId', id: 'descriptionAgent' }),
    ]);
  });

  it('fails closed on dangling selections and override targets', () => {
    const source = library();
    const p = ResumeProfileSchema.parse({ ...profile(), skillIds: ['missing'], overrides: [{ kind: 'work-bullet', experienceId: 'krjx', bulletId: 'missing', value: zh('覆盖') }] });
    expect(validateResumeProfileReferences(source, p)).toEqual([
      expect.objectContaining({ path: 'skillIds.0', id: 'missing' }),
      expect.objectContaining({ path: 'overrides.0.bulletId', id: 'missing' }),
    ]);
  });

  it('keeps a resolved resume single-locale and revision immutable-shaped', () => {
    const resolved = ResolvedResumeSchema.parse({
      libraryId: 'primary', libraryVersion: 1, profileId: 'ai-agent', profileVersion: 1, locale: 'zh-CN', templateId: 'classic-v1', positioning: 'AI Agent 工程师', layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['education'],
      basics: { displayName: '测试用户', contact: { phone: null, email: 'test@example.com', website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [], workExperiences: [], projects: [], certificates: [], summaries: [],
    });
    const revision = ResumeRevisionSchema.parse({ id: 'rev-1', profileId: 'ai-agent', revisionNumber: 1, libraryId: 'primary', libraryVersion: 1, profileVersion: 1, resolvedDocumentSnapshot: resolved, contentHash: 'a'.repeat(64), createdAt: at, createdBy: 'user', note: null });
    expect(revision.revisionNumber).toBe(1);
    expect(() => ResumeRevisionSchema.parse({ ...revision, updatedAt: at })).toThrow();
  });

  it('models artifacts independently from semantic revisions', () => {
    const artifact = ResumeArtifactSchema.parse({ id: 'artifact-1', revisionId: 'rev-1', kind: 'pdf', mimeType: 'application/pdf', storageUri: 'file:///data/resume-artifacts/rev-1.pdf', sha256: 'b'.repeat(64), byteSize: 1024, rendererId: 'nunjucks-playwright', rendererVersion: '1.0.0', createdAt: at });
    expect(artifact.kind).toBe('pdf');
  });
});
