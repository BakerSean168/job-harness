import { z } from 'zod';
import {
  RESUME_ARTIFACT_KINDS,
  RESUME_HEADER_LAYOUTS,
  RESUME_LOCALES,
  RESUME_PAGE_SIZES,
  RESUME_REVISION_ACTORS,
  RESUME_SECTIONS,
} from '@job-harness/resume-domain';

export const ResumeEntityIdSchema = z.string().trim().min(1).max(200);
export const ResumeIsoDateTimeSchema = z.iso.datetime({ offset: true });
export const ResumeYearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM');
export const ResumeLocaleSchema = z.enum(RESUME_LOCALES);
export const ResumeSectionSchema = z.enum(RESUME_SECTIONS);
export const ResumeArtifactKindSchema = z.enum(RESUME_ARTIFACT_KINDS);

export const LocalizedTextSchema = z
  .object({
    'zh-CN': z.string().trim().min(1).optional(),
    en: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value['zh-CN'] && !value.en) {
      ctx.addIssue({ code: 'custom', message: 'at least one locale is required' });
    }
  });

export const LocalizedRichTextSchema = LocalizedTextSchema;

export const ResumePeriodSchema = z
  .object({
    start: ResumeYearMonthSchema.nullable().default(null),
    end: ResumeYearMonthSchema.nullable().default(null),
    current: z.boolean().default(false),
    note: LocalizedTextSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.current && value.end) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'current period must not have an end month' });
    }
    if (value.start && value.end && value.end < value.start) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'end month must not be before start month' });
    }
  });

export const ResumeLinkSchema = z
  .object({
    label: LocalizedTextSchema.nullable().default(null),
    url: z.url(),
  })
  .strict();

export const ResumeContactSchema = z
  .object({
    phone: LocalizedTextSchema.nullable().default(null),
    email: z.email().nullable().default(null),
    website: z.url().nullable().default(null),
    github: z.url().nullable().default(null),
    location: LocalizedTextSchema.nullable().default(null),
  })
  .strict();

export const ResumeBasicsSchema = z
  .object({
    displayName: LocalizedTextSchema,
    contact: ResumeContactSchema,
    photoAssetId: ResumeEntityIdSchema.nullable().default(null),
  })
  .strict();

export const ResumeEducationSchema = z
  .object({
    id: ResumeEntityIdSchema,
    institution: LocalizedTextSchema,
    institutionTag: LocalizedTextSchema.nullable().default(null),
    major: LocalizedTextSchema,
    degree: LocalizedTextSchema,
    department: LocalizedTextSchema.nullable().default(null),
    studyType: LocalizedTextSchema.nullable().default(null),
    location: LocalizedTextSchema.nullable().default(null),
    period: ResumePeriodSchema,
    courseSummary: LocalizedTextSchema.nullable().default(null),
  })
  .strict();

export const ResumeSkillBlockSchema = z
  .object({
    id: ResumeEntityIdSchema,
    label: LocalizedTextSchema.nullable().default(null),
    content: LocalizedRichTextSchema,
    keywords: z.array(z.string().trim().min(1).max(100)).default([]),
  })
  .strict();

export const ResumeWorkBulletSchema = z
  .object({
    id: ResumeEntityIdSchema,
    content: LocalizedRichTextSchema,
  })
  .strict();

export const ResumeWorkExperienceSchema = z
  .object({
    id: ResumeEntityIdSchema,
    company: LocalizedTextSchema,
    role: LocalizedTextSchema,
    department: LocalizedTextSchema.nullable().default(null),
    location: LocalizedTextSchema.nullable().default(null),
    period: ResumePeriodSchema,
    bullets: z.array(ResumeWorkBulletSchema).default([]),
  })
  .strict();

export const ResumeProjectPresentationSchema = z
  .object({
    id: ResumeEntityIdSchema,
    name: LocalizedTextSchema.nullable().default(null),
    description: LocalizedRichTextSchema,
    stack: LocalizedTextSchema.nullable().default(null),
    role: LocalizedTextSchema.nullable().default(null),
  })
  .strict();

export const ResumeProjectHighlightSchema = z
  .object({
    id: ResumeEntityIdSchema,
    label: LocalizedTextSchema.nullable().default(null),
    detail: LocalizedRichTextSchema,
  })
  .strict();

function addDuplicateIdIssues(
  items: readonly { id: string }[],
  ctx: z.RefinementCtx,
  pathPrefix: readonly (string | number)[] = [],
) {
  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    const first = seen.get(item.id);
    if (first !== undefined) {
      ctx.addIssue({ code: 'custom', path: [...pathPrefix, index, 'id'], message: `duplicate id: ${item.id}` });
    } else {
      seen.set(item.id, index);
    }
  });
}

export const ResumeProjectExperienceSchema = z
  .object({
    id: ResumeEntityIdSchema,
    name: LocalizedTextSchema,
    role: LocalizedTextSchema.nullable().default(null),
    location: LocalizedTextSchema.nullable().default(null),
    period: ResumePeriodSchema,
    links: z.array(ResumeLinkSchema).default([]),
    presentations: z.array(ResumeProjectPresentationSchema).min(1),
    highlights: z.array(ResumeProjectHighlightSchema).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    addDuplicateIdIssues(value.presentations, ctx, ['presentations']);
    addDuplicateIdIssues(value.highlights, ctx, ['highlights']);
  });

export const ResumeCertificateSchema = z
  .object({
    id: ResumeEntityIdSchema,
    label: LocalizedTextSchema,
    issuer: LocalizedTextSchema.nullable().default(null),
    issuedAt: ResumeYearMonthSchema.nullable().default(null),
  })
  .strict();

export const ResumeSummaryBlockSchema = z
  .object({
    id: ResumeEntityIdSchema,
    label: LocalizedTextSchema.nullable().default(null),
    detail: LocalizedRichTextSchema,
  })
  .strict();

export const ResumeLibrarySchema = z
  .object({
    id: ResumeEntityIdSchema,
    schemaVersion: z.literal(2),
    version: z.number().int().positive(),
    basics: ResumeBasicsSchema,
    education: z.array(ResumeEducationSchema).default([]),
    skills: z.array(ResumeSkillBlockSchema).default([]),
    workExperiences: z.array(ResumeWorkExperienceSchema).default([]),
    projects: z.array(ResumeProjectExperienceSchema).default([]),
    certificates: z.array(ResumeCertificateSchema).default([]),
    summaries: z.array(ResumeSummaryBlockSchema).default([]),
    createdAt: ResumeIsoDateTimeSchema,
    updatedAt: ResumeIsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    addDuplicateIdIssues(value.education, ctx, ['education']);
    addDuplicateIdIssues(value.skills, ctx, ['skills']);
    addDuplicateIdIssues(value.workExperiences, ctx, ['workExperiences']);
    addDuplicateIdIssues(value.projects, ctx, ['projects']);
    addDuplicateIdIssues(value.certificates, ctx, ['certificates']);
    addDuplicateIdIssues(value.summaries, ctx, ['summaries']);
    value.workExperiences.forEach((work, index) => addDuplicateIdIssues(work.bullets, ctx, ['workExperiences', index, 'bullets']));
  });

export const ResumeLayoutSchema = z
  .object({
    header: z.enum(RESUME_HEADER_LAYOUTS),
    pageSize: z.enum(RESUME_PAGE_SIZES).default('A4'),
  })
  .strict();

export const ResumeWorkSelectionSchema = z
  .object({
    experienceId: ResumeEntityIdSchema,
    bulletIds: z.array(ResumeEntityIdSchema).default([]),
  })
  .strict();

export const ResumeProjectSelectionSchema = z
  .object({
    projectId: ResumeEntityIdSchema,
    presentationId: ResumeEntityIdSchema,
    highlightIds: z.array(ResumeEntityIdSchema).default([]),
  })
  .strict();

const ResumeSkillOverrideSchema = z.object({
  kind: z.literal('skill'),
  skillId: ResumeEntityIdSchema,
  value: LocalizedRichTextSchema,
}).strict();
const ResumeWorkBulletOverrideSchema = z.object({
  kind: z.literal('work-bullet'),
  experienceId: ResumeEntityIdSchema,
  bulletId: ResumeEntityIdSchema,
  value: LocalizedRichTextSchema,
}).strict();
const ResumeProjectHighlightOverrideSchema = z.object({
  kind: z.literal('project-highlight'),
  projectId: ResumeEntityIdSchema,
  highlightId: ResumeEntityIdSchema,
  value: LocalizedRichTextSchema,
}).strict();
const ResumeSummaryOverrideSchema = z.object({
  kind: z.literal('summary'),
  summaryId: ResumeEntityIdSchema,
  value: LocalizedRichTextSchema,
}).strict();
export const ResumeProfileOverrideSchema = z.discriminatedUnion('kind', [
  ResumeSkillOverrideSchema,
  ResumeWorkBulletOverrideSchema,
  ResumeProjectHighlightOverrideSchema,
  ResumeSummaryOverrideSchema,
]);

export const ResumeProfileSchema = z
  .object({
    id: ResumeEntityIdSchema,
    libraryId: ResumeEntityIdSchema,
    version: z.number().int().positive(),
    name: LocalizedTextSchema,
    targetRole: LocalizedTextSchema,
    locale: ResumeLocaleSchema,
    templateId: ResumeEntityIdSchema,
    positioning: LocalizedTextSchema,
    output: z.object({
      documentTitle: LocalizedTextSchema,
      description: LocalizedTextSchema.nullable().default(null),
      onlineUrl: z.url().nullable().default(null),
      pdfName: LocalizedTextSchema.nullable().default(null),
    }).strict(),
    layout: ResumeLayoutSchema,
    sectionOrder: z.array(ResumeSectionSchema).min(1),
    educationIds: z.array(ResumeEntityIdSchema).default([]),
    skillIds: z.array(ResumeEntityIdSchema).default([]),
    workSelections: z.array(ResumeWorkSelectionSchema).default([]),
    projectSelections: z.array(ResumeProjectSelectionSchema).default([]),
    certificateIds: z.array(ResumeEntityIdSchema).default([]),
    summaryIds: z.array(ResumeEntityIdSchema).default([]),
    overrides: z.array(ResumeProfileOverrideSchema).default([]),
    createdAt: ResumeIsoDateTimeSchema,
    updatedAt: ResumeIsoDateTimeSchema,
    archivedAt: ResumeIsoDateTimeSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.sectionOrder.forEach((section, index) => {
      if (seen.has(section)) ctx.addIssue({ code: 'custom', path: ['sectionOrder', index], message: `duplicate section: ${section}` });
      seen.add(section);
    });
    addDuplicateIdIssues(value.workSelections.map((item) => ({ id: item.experienceId })), ctx, ['workSelections']);
    addDuplicateIdIssues(value.projectSelections.map((item) => ({ id: item.projectId })), ctx, ['projectSelections']);
  });

export const ResolvedResumePeriodSchema = z.object({
  start: ResumeYearMonthSchema.nullable(),
  end: ResumeYearMonthSchema.nullable(),
  current: z.boolean(),
  note: z.string().nullable(),
}).strict();

const ResolvedContactSchema = z.object({
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  github: z.string().nullable(),
  location: z.string().nullable(),
}).strict();

export const ResolvedResumeSchema = z
  .object({
    libraryId: ResumeEntityIdSchema,
    libraryVersion: z.number().int().positive(),
    profileId: ResumeEntityIdSchema,
    profileVersion: z.number().int().positive(),
    locale: ResumeLocaleSchema,
    templateId: ResumeEntityIdSchema,
    positioning: z.string().trim().min(1),
    output: z.object({
      documentTitle: z.string().trim().min(1),
      description: z.string().nullable(),
      onlineUrl: z.url().nullable(),
      pdfName: z.string().nullable(),
    }).strict(),
    layout: ResumeLayoutSchema,
    sectionOrder: z.array(ResumeSectionSchema).min(1),
    basics: z.object({ displayName: z.string().trim().min(1), contact: ResolvedContactSchema, photoAssetId: ResumeEntityIdSchema.nullable() }).strict(),
    education: z.array(z.object({ id: ResumeEntityIdSchema, institution: z.string(), institutionTag: z.string().nullable(), major: z.string(), degree: z.string(), department: z.string().nullable(), studyType: z.string().nullable(), location: z.string().nullable(), period: ResolvedResumePeriodSchema, courseSummary: z.string().nullable() }).strict()),
    skills: z.array(z.object({ id: ResumeEntityIdSchema, label: z.string().nullable(), content: z.string(), keywords: z.array(z.string()) }).strict()),
    workExperiences: z.array(z.object({ id: ResumeEntityIdSchema, company: z.string(), role: z.string(), department: z.string().nullable(), location: z.string().nullable(), period: ResolvedResumePeriodSchema, bullets: z.array(z.object({ id: ResumeEntityIdSchema, content: z.string() }).strict()) }).strict()),
    projects: z.array(z.object({ id: ResumeEntityIdSchema, name: z.string(), role: z.string().nullable(), location: z.string().nullable(), period: ResolvedResumePeriodSchema, links: z.array(z.object({ label: z.string().nullable(), url: z.url() }).strict()), description: z.string(), stack: z.string().nullable(), highlights: z.array(z.object({ id: ResumeEntityIdSchema, label: z.string().nullable(), detail: z.string() }).strict()) }).strict()),
    certificates: z.array(z.object({ id: ResumeEntityIdSchema, label: z.string(), issuer: z.string().nullable(), issuedAt: ResumeYearMonthSchema.nullable() }).strict()),
    summaries: z.array(z.object({ id: ResumeEntityIdSchema, label: z.string().nullable(), detail: z.string() }).strict()),
  })
  .strict();

export const ResumeRevisionSchema = z
  .object({
    id: ResumeEntityIdSchema,
    profileId: ResumeEntityIdSchema,
    revisionNumber: z.number().int().positive(),
    libraryId: ResumeEntityIdSchema,
    libraryVersion: z.number().int().positive(),
    profileVersion: z.number().int().positive(),
    resolvedDocumentSnapshot: ResolvedResumeSchema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i, 'expected SHA-256 hex'),
    createdAt: ResumeIsoDateTimeSchema,
    createdBy: z.enum(RESUME_REVISION_ACTORS),
    note: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();

export const ResumeArtifactSchema = z
  .object({
    id: ResumeEntityIdSchema,
    revisionId: ResumeEntityIdSchema,
    kind: ResumeArtifactKindSchema,
    mimeType: z.string().trim().min(1).max(200),
    storageUri: z.string().trim().min(1).max(2000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i, 'expected SHA-256 hex'),
    byteSize: z.number().int().nonnegative(),
    rendererId: ResumeEntityIdSchema,
    rendererVersion: z.string().trim().min(1).max(100),
    createdAt: ResumeIsoDateTimeSchema,
  })
  .strict();

export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
export type ResumeLibrary = z.infer<typeof ResumeLibrarySchema>;
export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;
export type ResolvedResume = z.infer<typeof ResolvedResumeSchema>;
export type ResumeRevision = z.infer<typeof ResumeRevisionSchema>;
export type ResumeArtifact = z.infer<typeof ResumeArtifactSchema>;
