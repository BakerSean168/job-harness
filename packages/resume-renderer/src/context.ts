import type { ResolvedResume } from '@job-harness/resume-contracts';

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function formatYearMonth(value: string, locale: ResolvedResume['locale']): string {
  const [year, monthText] = value.split('-');
  const month = Number(monthText);
  if (locale === 'en') return `${EN_MONTHS[month - 1]} ${year}`;
  return `${year}年${monthText}月`;
}

export function formatResumePeriod(period: ResolvedResume['education'][number]['period'], locale: ResolvedResume['locale']): string {
  const start = period.start ? formatYearMonth(period.start, locale) : null;
  const end = period.current
    ? (locale === 'en' ? 'Present' : '至今')
    : period.end ? formatYearMonth(period.end, locale) : null;
  const base = start && end ? `${start} - ${end}` : start ?? end ?? '';
  if (!period.note) return base;
  const separator = period.note.startsWith('（') ? '' : ' ';
  return `${base}${separator}${period.note}`;
}

export interface ResumeTemplateContextOptions {
  readonly title?: string;
  readonly description?: string;
  readonly onlineUrl?: string | null;
  readonly variant?: string;
}

export function toResumeTemplateContext(resume: ResolvedResume, options: ResumeTemplateContextOptions = {}) {
  const lang = resume.locale === 'en' ? 'en' : 'zh';
  const title = options.title ?? resume.output.documentTitle;
  return {
    lang,
    variant: options.variant ?? resume.profileId,
    title,
    description: options.description ?? resume.output.description ?? '',
    onlineUrl: options.onlineUrl ?? resume.output.onlineUrl,
    name: resume.basics.displayName,
    positioning: resume.positioning,
    headerTemplate: resume.layout.header,
    contact: resume.basics.contact,
    education: resume.education.map((item) => ({
      school: item.institution,
      schoolTag: item.institutionTag,
      major: item.major,
      degree: item.degree,
      department: item.department,
      type: item.studyType,
      location: item.location,
      date: formatResumePeriod(item.period, resume.locale),
      courses: item.courseSummary,
    })),
    skills: resume.skills.map((item) => item.content),
    work: resume.workExperiences.map((item) => ({
      company: item.company,
      role: item.role,
      department: item.department,
      location: item.location,
      date: formatResumePeriod(item.period, resume.locale),
      bullets: item.bullets.map((bullet) => bullet.content),
    })),
    projects: resume.projects.map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      location: item.location,
      date: formatResumePeriod(item.period, resume.locale),
      link: item.links[0]?.url ?? null,
      description: item.description,
      stack: item.stack,
      highlights: item.highlights.map((highlight) => ({ label: highlight.label ?? '', detail: highlight.detail })),
    })),
    certificates: resume.certificates.map((item) => item.label),
    summary: resume.summaries.map((item) => ({ label: item.label ?? '', detail: item.detail })),
    sections: resume.sectionOrder.filter((section) => section !== 'basics'),
  };
}
