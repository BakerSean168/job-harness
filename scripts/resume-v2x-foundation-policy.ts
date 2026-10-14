import type { ResolvedResume, ResumeProfile } from '@job-harness/resume-contracts';

/**
 * V2.x is the presentation/data baseline for future role-specific variants,
 * not a migration rule: previously published revisions are immutable.
 * The policy inspects resolved, user-facing content (after Profile overrides).
 */
export interface V2xFoundationFinding {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}
export interface V2xFoundationReport {
  profileId: string;
  templateId: string;
  role: string;
  errors: V2xFoundationFinding[];
  warnings: V2xFoundationFinding[];
  projectNames: string[];
}

export function auditV2xFoundation(profile: ResumeProfile, resume: ResolvedResume): V2xFoundationReport {
  const findings: V2xFoundationFinding[] = [];
  const fail = (code: string, message: string) => findings.push({ code, message, severity: 'error' });
  const warn = (code: string, message: string) => findings.push({ code, message, severity: 'warning' });
  const role = profile.targetRole[profile.locale] ?? '';
  const positioning = profile.positioning?.[profile.locale] ?? '';

  if (profile.templateId !== 'compact-project-links-v2') fail('TEMPLATE', 'Use the opt-in compact-project-links-v2 template, not frozen classic-v1');
  if (profile.layout.pageSize !== 'A4') fail('PAGE_SIZE', 'The print layout must be A4');
  if (profile.layout.header !== 'without-photo' && profile.layout.header !== 'with-photo') fail('HEADER_VARIANT', 'Unknown header style');
  if (profile.layout.header !== 'without-photo') warn('PHOTO_VARIANT', 'The default graduate resume is without a portrait; photograph variants must be explicit');
  if (!role || !positioning.startsWith(role) || /求职意向\s*[:：]/u.test(positioning)) fail('POSITIONING', 'Use concise <role>｜2026届本科毕业生 without 求职意向 prefix');
  if (!positioning.includes('2026届本科毕业生')) warn('COHORT', 'Verify graduation cohort is visible in the positioning');
  if (profile.locale !== 'zh-CN') warn('LOCALE', 'This review preset is written for zh-CN resumes');

  const expected = ['education', 'skills', 'work', 'projects', 'certificates'];
  if (JSON.stringify(profile.sectionOrder) !== JSON.stringify(expected)) fail('SECTION_ORDER', 'Expected education → skills → work → projects → certificates');
  if (resume.education.length !== 1) warn('EDUCATION', 'Standard one-page graduate edition uses one education record');
  if (resume.skills.length !== 4) fail('SKILL_GROUPS', 'Use four grouped technical skill lines, not a long keyword list');
  if (resume.workExperiences.length !== 1) warn('WORK', 'Keep one confirmed internship when present; other experience requires evidence');
  if (resume.workExperiences.some(item => item.bullets.length < 2 || item.bullets.length > 3)) warn('WORK_BULLETS', 'Each internship should use 2-3 evidence-backed contributions');
  if (resume.projects.length !== 2) fail('PROJECT_COUNT', 'The baseline uses two complementary projects');
  if (resume.certificates.length < 1) warn('CERTIFICATE', 'Preserve already verified relevant certificates');

  if (role.includes('前端')) {
    const skills = resume.skills.map(skill => skill.content).join(' ');
    for (const term of ['JavaScript', 'TypeScript', 'HTML5/CSS3', 'Vue 3', 'React']) {
      if (!skills.includes(term)) fail('FRONTEND_KEYWORD', 'Missing essential frontend term: '+term);
    }
  }

  for (const project of resume.projects) {
    const label = project.id;
    if (project.name.trim().length > 25 || project.name.trim().length === 0) warn('PROJECT_NAME', label+': prefer a concise project/brand name');
    if (!project.role || !project.role.includes('个人项目')) fail('PROJECT_ROLE', label+': identify independent work as a personal project, never invent a company');
    if (project.description.trim().length < 25 || project.description.trim().length > 150) warn('PROJECT_INTRO', label+': intro should be a concise product-value statement (25-150 characters)');
    if (project.highlights.length !== 2) fail('HIGHLIGHT_COUNT', label+': use exactly two job-relevant, source-verifiable highlights');
    if (!project.stack || project.stack.trim().length < 8) fail('STACK', label+': provide a relevant actual technical stack');
    for (const h of project.highlights) {
      if (!h.label || !h.detail) fail('HIGHLIGHT_EMPTY', label+': technical contributions need a label and detail');
      if (h.detail.length > 160) warn('HIGHLIGHT_LENGTH', label+': a highlight longer than 160 characters is difficult to scan');
    }
    const expectedLabels = ['GitHub', '项目展示'];
    if (project.links.length !== 2 || project.links.some((link,i) => link.label !== expectedLabels[i])) {
      fail('PROJECT_LINKS', label+': provide GitHub and Showcase as two separately labeled links');
    }
    for (const [i, link] of project.links.entries()) {
      let url: URL;
      try { url = new URL(link.url); } catch { fail('PROJECT_LINK_URL', label+': malformed URL'); continue; }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') fail('PROJECT_LINK_SCHEME', label+': only HTTP(S) links are permitted');
      if (url.username || url.password) fail('PROJECT_LINK_CREDENTIALS', label+': links may not embed credentials');
      if (i === 0 && url.hostname !== 'github.com') fail('GITHUB_HOST', label+': first link must point to a GitHub repository');
    }
  }

  const meta = profile.output.description?.[profile.locale] ?? '';
  if (/验证草稿|待本人核验|样例简历|test resume/i.test(meta)) fail('PUBLIC_METADATA', 'Production resume output metadata must not be a test draft');
  return {
    profileId: profile.id,
    templateId: profile.templateId,
    role,
    errors: findings.filter(f => f.severity === 'error'),
    warnings: findings.filter(f => f.severity === 'warning'),
    projectNames: resume.projects.map(p => p.name),
  };
}
