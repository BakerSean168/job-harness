import { z } from 'zod';

const LegacyI18nSchema = z.object({ zh: z.string().optional(), en: z.string().optional() }).passthrough();
const LegacyContactSchema = z.object({
  phone: z.string(), phoneIntl: z.string().optional(), email: z.string(), website: z.string(), github: z.string(),
}).passthrough();
const LegacyEducationSchema = z.object({
  id: z.string(), school: z.string(), schoolTag: z.string().optional(), major: z.string(), degree: z.string(), department: z.string().optional(), type: z.string().optional(), location: z.string().optional(), date: z.string(), courses: LegacyI18nSchema.optional(),
}).passthrough();
const LegacySkillSchema = z.object({ id: z.string(), zh: z.string().optional(), en: z.string().optional() }).passthrough();
const LegacyBulletSchema = z.object({ id: z.string(), zh: z.string().optional(), en: z.string().optional() }).passthrough();
const LegacyWorkSchema = z.object({
  id: z.string(), company: z.string(), role: z.string(), department: z.string().optional(), location: z.string().optional(), date: z.string(), bullets: z.array(LegacyBulletSchema),
}).passthrough();
const LegacyHighlightSchema = z.object({ id: z.string(), label: LegacyI18nSchema.optional(), detail: LegacyI18nSchema }).passthrough();
const LegacyProjectSchema = z.object({
  id: z.string(), name: z.string(), date: z.string(), role: z.string().optional(), link: z.string().optional(), location: z.string().optional(), description: LegacyI18nSchema.optional(), stack: z.string().optional(), highlights: z.array(LegacyHighlightSchema),
}).passthrough();
const LegacyCertificateSchema = z.object({ id: z.string(), zh: z.string().optional(), en: z.string().optional() }).passthrough();
const LegacySummarySchema = z.object({ id: z.string(), label: LegacyI18nSchema.optional(), detail: LegacyI18nSchema }).passthrough();

export const LegacyResumeDataSchema = z.object({
  meta: z.record(z.string(), z.unknown()).optional(),
  name: z.string(),
  contact: LegacyContactSchema,
  education: z.array(LegacyEducationSchema),
  skills: z.array(LegacySkillSchema),
  work: z.array(LegacyWorkSchema),
  projects: z.array(LegacyProjectSchema),
  certificates: z.array(LegacyCertificateSchema),
  summary: z.array(LegacySummarySchema),
}).passthrough();

const IncludeListSchema = z.union([z.array(z.string()), z.literal('all')]);
export const LegacyProfileSchema = z.object({
  meta: z.object({
    name: z.string(), nameEn: z.string().optional(), lang: z.enum(['zh', 'en']), variant: z.string(), title: z.string(), titleEn: z.string().optional(), description: z.string().optional(), onlineUrl: z.string().optional(),
  }).passthrough(),
  positioning: z.string(),
  layout: z.object({ header: z.enum(['with-photo', 'without-photo']) }).optional(),
  sections: z.array(z.enum(['education', 'skills', 'work', 'projects', 'certificates', 'summary'])),
  include: z.object({
    skills: IncludeListSchema,
    work: IncludeListSchema,
    workBullets: z.record(z.string(), z.array(z.string())).optional(),
    projects: IncludeListSchema,
    projectHighlights: z.record(z.string(), z.array(z.string())).optional(),
    certificates: IncludeListSchema,
    summary: IncludeListSchema,
  }).passthrough(),
  overrides: z.object({ projects: z.record(z.string(), z.object({
    nameField: z.string().optional(), descriptionField: z.string().optional(), stackField: z.string().optional(),
  }).passthrough()).optional() }).passthrough().optional(),
  export: z.object({ pdfName: z.string() }).passthrough().optional(),
}).passthrough();

export const LegacyResumeBundleSchema = z.object({
  zh: LegacyResumeDataSchema,
  en: LegacyResumeDataSchema.optional(),
  profiles: z.array(LegacyProfileSchema),
}).strict();

export type LegacyResumeData = z.infer<typeof LegacyResumeDataSchema>;
export type LegacyProfile = z.infer<typeof LegacyProfileSchema>;
export type LegacyResumeBundle = z.infer<typeof LegacyResumeBundleSchema>;
