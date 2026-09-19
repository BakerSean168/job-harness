import { z } from 'zod';

const IdSchema = z.string().trim().min(1).max(200);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const FactKeySchema = z.string().trim().min(1).max(240).regex(/^[a-z0-9_.\[\]-]+$/);
export const ApplicantGenderSchema = z.enum(['male', 'female']);
export const ApplicantJobSearchStatusSchema = z.enum(['actively_looking', 'open_to_opportunities', 'not_looking']);
export const ApplicantCareerIdentitySchema = z.enum(['student', 'new_graduate', 'professional']);

export const APPLICANT_FACT_VALUE_TYPES = ['text', 'multiline', 'email', 'phone', 'url', 'number', 'date', 'boolean', 'choice', 'multi_choice'] as const;
export const APPLICANT_FACT_SENSITIVITIES = ['public', 'personal', 'sensitive', 'legal', 'protected'] as const;
export const ApplicantFactValueTypeSchema = z.enum(APPLICANT_FACT_VALUE_TYPES);
export const ApplicantFactSensitivitySchema = z.enum(APPLICANT_FACT_SENSITIVITIES);
export const ApplicantLiteralValueSchema = z.union([
  z.string().max(100_000),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string().max(10_000), z.number(), z.boolean()])).max(500),
]);


const SiteHostSchema = z.string().trim().min(1).max(500).superRefine((value, ctx) => {
  if (/[\/?#@:]/.test(value)) {
    ctx.addIssue({ code: 'custom', message: 'siteHost must be a bare hostname without scheme, path, port, credentials, query, or fragment' });
    return;
  }
  try {
    const canonical = new URL(`https://${value}`).hostname.toLowerCase().replace(/\.$/, '');
    if (!canonical || canonical.length > 253 || canonical !== value) {
      ctx.addIssue({ code: 'custom', message: 'siteHost must already be a canonical lower-case hostname without a trailing dot' });
    }
  } catch {
    ctx.addIssue({ code: 'custom', message: 'siteHost is not a valid hostname' });
  }
});

function validateLiteralValueType(valueType: z.infer<typeof ApplicantFactValueTypeSchema>, value: z.infer<typeof ApplicantLiteralValueSchema>): string | null {
  switch (valueType) {
    case 'boolean': return typeof value === 'boolean' ? null : 'boolean answers require a boolean literal';
    case 'number': return typeof value === 'number' && Number.isFinite(value) ? null : 'number answers require a finite numeric literal';
    case 'multi_choice': return Array.isArray(value) ? null : 'multi_choice answers require an array literal';
    case 'text':
    case 'multiline':
    case 'email':
    case 'phone':
    case 'url':
    case 'date':
    case 'choice':
      return typeof value === 'string' ? null : `${valueType} answers require a string literal`;
  }
}

export const ApplicantEducationSchema = z.object({
  id: IdSchema,
  school: z.string().trim().min(1).max(500),
  institutionTag: z.string().trim().max(300).nullable().default(null),
  major: z.string().trim().min(1).max(500),
  degree: z.string().trim().max(300).nullable().default(null),
  department: z.string().trim().max(500).nullable().default(null),
  location: z.string().trim().max(300).nullable().default(null),
  startMonth: MonthSchema.nullable().default(null),
  endMonth: MonthSchema.nullable().default(null),
}).strict();

export const ApplicantProfileSchema = z.object({
  id: IdSchema,
  version: z.number().int().positive(),
  displayName: z.string().trim().min(1).max(300),
  phone: z.string().trim().max(100).nullable().default(null),
  email: z.email().nullable().default(null),
  gender: ApplicantGenderSchema.nullable().default(null),
  birthDate: z.iso.date().nullable().default(null),
  location: z.string().trim().max(300).nullable().default(null),
  jobSearchStatus: ApplicantJobSearchStatusSchema.nullable().default(null),
  careerIdentity: ApplicantCareerIdentitySchema.nullable().default(null),
  website: z.url().nullable().default(null),
  github: z.url().nullable().default(null),
  education: z.array(ApplicantEducationSchema).max(20).default([]),
  targetRoles: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  targetCities: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  availableFrom: z.string().trim().max(100).nullable().default(null),
  notes: z.string().trim().max(4000).nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict();

export const ApplicantProfileRevisionSchema = z.object({
  id: IdSchema,
  profileId: IdSchema,
  revisionNumber: z.number().int().positive(),
  profileVersion: z.number().int().positive(),
  snapshot: ApplicantProfileSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: IsoDateTimeSchema,
  createdBy: z.enum(['user', 'import', 'system']),
}).strict().superRefine((value, ctx) => {
  if (value.snapshot.id !== value.profileId) ctx.addIssue({ code: 'custom', path: ['snapshot', 'id'], message: 'snapshot id must match profileId' });
  if (value.snapshot.version !== value.profileVersion) ctx.addIssue({ code: 'custom', path: ['snapshot', 'version'], message: 'snapshot version must match profileVersion' });
});

export const SaveApplicantProfileInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  profile: ApplicantProfileSchema,
}).strict();

export const ApplicantProfileContextSchema = z.object({
  profile: ApplicantProfileSchema,
  latestRevision: ApplicantProfileRevisionSchema,
}).strict();

export const ApplicationAnswerEntrySchema = z.object({
  id: IdSchema,
  key: FactKeySchema,
  label: z.string().trim().min(1).max(500),
  valueType: ApplicantFactValueTypeSchema,
  sensitivity: ApplicantFactSensitivitySchema,
  value: ApplicantLiteralValueSchema,
  aliases: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  siteHost: SiteHostSchema.nullable().default(null),
  enabled: z.boolean().default(true),
}).strict().superRefine((value, ctx) => {
  if ((value.sensitivity === 'legal' || value.sensitivity === 'protected') && value.aliases.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['aliases'], message: 'legal/protected answers require at least one explicit alias' });
  }
  const typeIssue = validateLiteralValueType(value.valueType, value.value);
  if (typeIssue) ctx.addIssue({ code: 'custom', path: ['value'], message: typeIssue });
  if (value.valueType === 'email' && typeof value.value === 'string' && !z.email().safeParse(value.value).success) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'email answers require a valid email address' });
  }
  if (value.valueType === 'url' && typeof value.value === 'string' && !z.url().safeParse(value.value).success) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'url answers require a valid URL' });
  }
});

export const ApplicationAnswerSetSchema = z.object({
  id: IdSchema,
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(300),
  entries: z.array(ApplicationAnswerEntrySchema).max(1000).default([]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict().superRefine((value, ctx) => {
  const keys = new Set<string>();
  const ids = new Set<string>();
  value.entries.forEach((entry, index) => {
    const scoped = `${entry.siteHost ?? '*'}\u0000${entry.key}`;
    if (keys.has(scoped)) ctx.addIssue({ code: 'custom', path: ['entries', index, 'key'], message: 'duplicate answer key in the same scope' });
    if (ids.has(entry.id)) ctx.addIssue({ code: 'custom', path: ['entries', index, 'id'], message: 'duplicate answer entry id' });
    keys.add(scoped); ids.add(entry.id);
  });
});

export const ApplicationAnswerSetRevisionSchema = z.object({
  id: IdSchema,
  answerSetId: IdSchema,
  revisionNumber: z.number().int().positive(),
  answerSetVersion: z.number().int().positive(),
  snapshot: ApplicationAnswerSetSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: IsoDateTimeSchema,
  createdBy: z.enum(['user', 'import', 'system']),
}).strict().superRefine((value, ctx) => {
  if (value.snapshot.id !== value.answerSetId) ctx.addIssue({ code: 'custom', path: ['snapshot', 'id'], message: 'snapshot id must match answerSetId' });
  if (value.snapshot.version !== value.answerSetVersion) ctx.addIssue({ code: 'custom', path: ['snapshot', 'version'], message: 'snapshot version must match answerSetVersion' });
});

export const SaveApplicationAnswerSetInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  answerSet: ApplicationAnswerSetSchema,
}).strict();

export const ApplicationAnswerSetContextSchema = z.object({
  answerSet: ApplicationAnswerSetSchema,
  latestRevision: ApplicationAnswerSetRevisionSchema,
}).strict();

export type ApplicantGender = z.infer<typeof ApplicantGenderSchema>;
export type ApplicantJobSearchStatus = z.infer<typeof ApplicantJobSearchStatusSchema>;
export type ApplicantCareerIdentity = z.infer<typeof ApplicantCareerIdentitySchema>;
export type ApplicantProfile = z.infer<typeof ApplicantProfileSchema>;
export type ApplicantProfileRevision = z.infer<typeof ApplicantProfileRevisionSchema>;
export type SaveApplicantProfileInput = z.infer<typeof SaveApplicantProfileInputSchema>;
export type ApplicantProfileContext = z.infer<typeof ApplicantProfileContextSchema>;
export type ApplicationAnswerEntry = z.infer<typeof ApplicationAnswerEntrySchema>;
export type ApplicationAnswerSet = z.infer<typeof ApplicationAnswerSetSchema>;
export type ApplicationAnswerSetRevision = z.infer<typeof ApplicationAnswerSetRevisionSchema>;
export type SaveApplicationAnswerSetInput = z.infer<typeof SaveApplicationAnswerSetInputSchema>;
export type ApplicationAnswerSetContext = z.infer<typeof ApplicationAnswerSetContextSchema>;
