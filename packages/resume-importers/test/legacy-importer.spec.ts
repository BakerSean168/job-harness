import { describe, expect, it } from 'vitest';
import { resolveResume } from '@job-harness/resume-application';
import { importLegacyResumeBundle } from '../src';

const at = '2026-09-17T01:44:00.000Z';

const bundle = {
  zh: {
    name: '测试用户', contact: { phone: '13800000000', phoneIntl: '(+86) 138 0000 0000', email: 'test@example.com', website: 'https://example.com', github: 'https://github.com/example' },
    education: [{ id: 'school', school: '示例大学', major: '计算机', degree: '本科', date: '2022年09月 - 2026年06月', courses: { zh: '数据结构' } }],
    skills: [{ id: 'agent', zh: '<strong>Agent：</strong>工程实践' }],
    work: [{ id: 'work', company: '公司', role: '工程师', date: '2025年07月 - 2025年11月', bullets: [{ id: 'delivery', zh: '交付' }] }],
    projects: [{ id: 'project', name: '项目', date: '2026年02月 - 至今（持续维护）', description: { zh: '默认描述' }, stack: '默认栈', descriptionAgent: { zh: 'Agent 描述' }, stackAgent: 'Agent 栈', nameAi: { zh: 'AI 项目', en: 'AI Project' }, highlights: [{ id: 'runtime', label: { zh: '运行时：' }, detail: { zh: '可恢复' } }] }],
    certificates: [{ id: 'cert', zh: '证书' }], summary: [],
  },
  en: {
    name: 'Test User', contact: { phone: '13800000000', phoneIntl: '(+86) 138 0000 0000', email: 'test@example.com', website: 'https://example.com', github: 'https://github.com/example' },
    education: [{ id: 'school', school: 'Example University', major: 'Computer Science', degree: 'B.Eng.', date: 'Sep 2022 - Jun 2026', courses: { en: 'Data Structures' } }],
    skills: [{ id: 'agent', en: '<strong>Agent:</strong> engineering' }],
    work: [{ id: 'work', company: 'Company', role: 'Engineer', date: 'Jul 2025 - Nov 2025', bullets: [{ id: 'delivery', en: 'Delivery' }] }],
    projects: [{ id: 'project', name: 'Project', date: 'Feb 2026 - Present', description: { en: 'Default' }, stack: 'Default Stack', highlights: [{ id: 'runtime', label: { en: 'Runtime:' }, detail: { en: 'Recoverable' } }] }],
    certificates: [{ id: 'cert', en: 'Certificate' }], summary: [],
  },
  profiles: [{
    meta: { name: 'Agent 简历', lang: 'zh', variant: 'agent', title: 'Agent 简历', description: 'Agent profile', onlineUrl: 'https://example.com/resume' }, positioning: 'Agent 工程师', layout: { header: 'without-photo' }, sections: ['education', 'skills', 'projects', 'work', 'certificates'],
    include: { skills: ['agent'], work: ['work'], workBullets: { work: ['delivery'] }, projects: ['project'], projectHighlights: { project: ['runtime'] }, certificates: ['cert'], summary: [] },
    overrides: { projects: { project: { nameField: 'nameAi', descriptionField: 'descriptionAgent', stackField: 'stackAgent' } } }, export: { pdfName: 'Agent简历' },
  }],
};

describe('legacy Resume importer', () => {
  it('merges locale trees, semantic dates and dynamic project fields into v2 contracts', () => {
    const imported = importLegacyResumeBundle(bundle as never, at);
    expect(imported.library.basics.contact.phone).toEqual({ 'zh-CN': '13800000000', en: '(+86) 138 0000 0000' });
    expect(imported.library.projects[0]?.period).toEqual({ start: '2026-02', end: null, current: true, note: { 'zh-CN': '（持续维护）' } });
    const presentation = imported.library.projects[0]?.presentations.find((item) => item.id === 'agent');
    expect(presentation?.name).toEqual({ 'zh-CN': 'AI 项目', en: 'AI Project' });
    expect(presentation?.description).toEqual({ 'zh-CN': 'Agent 描述' });
    const resolved = resolveResume(imported.library, imported.profiles[0]!);
    expect(resolved.projects[0]).toMatchObject({ name: 'AI 项目', description: 'Agent 描述', stack: 'Agent 栈' });
    expect(resolved.projects[0]?.period.note).toBe('（持续维护）');
  });
});
