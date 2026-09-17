export const RESUME_LOCALES = ['zh-CN', 'en'] as const;
export type ResumeLocale = (typeof RESUME_LOCALES)[number];

export const RESUME_SECTIONS = [
  'basics',
  'education',
  'skills',
  'work',
  'projects',
  'certificates',
  'summary',
] as const;
export type ResumeSection = (typeof RESUME_SECTIONS)[number];

export const RESUME_HEADER_LAYOUTS = ['with-photo', 'without-photo'] as const;
export type ResumeHeaderLayout = (typeof RESUME_HEADER_LAYOUTS)[number];

export const RESUME_PAGE_SIZES = ['A4', 'Letter'] as const;
export type ResumePageSize = (typeof RESUME_PAGE_SIZES)[number];

export const RESUME_ARTIFACT_KINDS = ['html', 'pdf', 'json', 'markdown'] as const;
export type ResumeArtifactKind = (typeof RESUME_ARTIFACT_KINDS)[number];

export const RESUME_REVISION_ACTORS = ['user', 'import', 'system'] as const;
export type ResumeRevisionActor = (typeof RESUME_REVISION_ACTORS)[number];
