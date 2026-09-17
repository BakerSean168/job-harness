import { describe, expect, it } from 'vitest';
import { ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { ResumeResolutionError, resolveResume } from '../src';

const at = '2026-09-17T01:44:00.000Z';
const both = (cn: string, en: string) => ({ 'zh-CN': cn, en });
const zh = (value: string) => ({ 'zh-CN': value });

const library = ResumeLibrarySchema.parse({
  id: 'primary', schemaVersion: 2, version: 3,
  basics: { displayName: both('测试用户', 'Test User'), contact: { phone: both('1', '+1'), email: 'test@example.com', website: null, github: null, location: both('杭州', 'Hangzhou') }, photoAssetId: null },
  education: [{ id: 'school', institution: both('学校', 'University'), major: both('专业', 'Major'), degree: both('本科', 'Bachelor'), period: { start: '2022-09', end: '2026-06', current: false, note: null } }],
  skills: [{ id: 'agent', content: both('基础技能', 'Base skill') }],
  workExperiences: [{ id: 'work', company: both('公司', 'Company'), role: both('工程师', 'Engineer'), period: { start: '2025-07', end: '2025-11', current: false, note: null }, bullets: [{ id: 'delivery', content: both('原始描述', 'Original') }] }],
  projects: [{ id: 'project', name: both('项目', 'Project'), period: { start: '2026-01', end: null, current: true, note: null }, presentations: [{ id: 'default', description: both('默认', 'Default') }, { id: 'agent', description: both('Agent 描述', 'Agent description'), stack: both('技术栈', 'Stack') }], highlights: [{ id: 'runtime', label: both('运行时：', 'Runtime:'), detail: both('原始亮点', 'Original highlight') }] }],
  certificates: [{ id: 'cert', label: both('证书', 'Certificate') }], summaries: [{ id: 'summary', detail: both('总结', 'Summary') }],
  createdAt: at, updatedAt: at,
});

function profile(locale: 'zh-CN' | 'en' = 'zh-CN') {
  return ResumeProfileSchema.parse({
    id: 'agent-profile', libraryId: 'primary', version: 5, name: both('Agent 简历', 'Agent Resume'), targetRole: both('Agent 工程师', 'Agent Engineer'), locale, templateId: 'classic-v1', positioning: both('Agent 工程师', 'Agent Engineer'), output: { documentTitle: both('Agent 简历', 'Agent Resume'), description: null, onlineUrl: null, pdfName: both('Agent简历', 'Agent-Resume') }, layout: { header: 'without-photo', pageSize: 'A4' },
    sectionOrder: ['education', 'skills', 'projects', 'work', 'certificates', 'summary'], educationIds: ['school'], skillIds: ['agent'], workSelections: [{ experienceId: 'work', bulletIds: ['delivery'] }], projectSelections: [{ projectId: 'project', presentationId: 'agent', highlightIds: ['runtime'] }], certificateIds: ['cert'], summaryIds: ['summary'], overrides: [
      { kind: 'work-bullet', experienceId: 'work', bulletId: 'delivery', value: both('定向描述', 'Tailored') },
      { kind: 'project-highlight', projectId: 'project', highlightId: 'runtime', value: both('定向亮点', 'Tailored highlight') },
    ], createdAt: at, updatedAt: at, archivedAt: null,
  });
}

describe('resolveResume', () => {
  it('resolves one locale, profile selections, presentation and typed overrides', () => {
    const resolved = resolveResume(library, profile());
    expect(resolved.libraryVersion).toBe(3);
    expect(resolved.profileVersion).toBe(5);
    expect(resolved.basics.displayName).toBe('测试用户');
    expect(resolved.projects[0]?.description).toBe('Agent 描述');
    expect(resolved.projects[0]?.highlights[0]?.detail).toBe('定向亮点');
    expect(resolved.workExperiences[0]?.bullets[0]?.content).toBe('定向描述');
  });

  it('fails closed when a selected field has no target locale', () => {
    const brokenLibrary = ResumeLibrarySchema.parse({ ...library, skills: [{ id: 'agent', content: zh('仅中文') }] });
    expect(() => resolveResume(brokenLibrary, profile('en'))).toThrow(ResumeResolutionError);
    try { resolveResume(brokenLibrary, profile('en')); } catch (error) {
      expect((error as ResumeResolutionError).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'skillIds.0.content', message: 'locale en is missing' }),
      ]));
    }
  });

  it('fails closed on dangling profile references before rendering', () => {
    const broken = ResumeProfileSchema.parse({ ...profile(), skillIds: ['missing'] });
    expect(() => resolveResume(library, broken)).toThrow(ResumeResolutionError);
  });
});
