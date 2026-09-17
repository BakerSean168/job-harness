import { z } from 'zod';

const IdSchema = z.string().trim().min(1).max(200);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const FactKeySchema = z.string().trim().min(1).max(240).regex(/^[a-z0-9_.\[\]-]+$/);

export const ApplicantFactValueTypeSchema = z.enum([
  'text', 'multiline', 'email', 'phone', 'url', 'number', 'date', 'boolean', 'choice', 'multi_choice',
]);
export const ApplicantFactSensitivitySchema = z.enum(['public', 'personal', 'sensitive', 'legal', 'protected']);
export const ApplicantLiteralValueSchema = z.union([
  z.string().max(100_000),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string().max(10_000), z.number(), z.boolean()])).max(500),
]);

export const ApplicantEducationSchema = z.object({
  id: IdSchema,
  school: z.string().trim().min(1).max(500),
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
  location: z.string().trim().max(300).nullable().default(null),
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
}).strict();

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
  siteHost: z.string().trim().max(500).nullable().default(null),
  enabled: z.boolean().default(true),
}).strict().superRefine((value, ctx) => {
  if ((value.sensitivity === 'legal' || value.sensitivity === 'protected') && value.aliases.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['aliases'], message: 'legal/protected answers require at least one explicit alias' });
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
}).strict();

export const SaveApplicationAnswerSetInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  answerSet: ApplicationAnswerSetSchema,
}).strict();

export const ApplicationAnswerSetContextSchema = z.object({
  answerSet: ApplicationAnswerSetSchema,
  latestRevision: ApplicationAnswerSetRevisionSchema,
}).strict();

export type ApplicantProfile = z.infer<typeof ApplicantProfileSchema>;
export type ApplicantProfileRevision = z.infer<typeof ApplicantProfileRevisionSchema>;
export type SaveApplicantProfileInput = z.infer<typeof SaveApplicantProfileInputSchema>;
export type ApplicantProfileContext = z.infer<typeof ApplicantProfileContextSchema>;
export type ApplicationAnswerEntry = z.infer<typeof ApplicationAnswerEntrySchema>;
export type ApplicationAnswerSet = z.infer<typeof ApplicationAnswerSetSchema>;
export type ApplicationAnswerSetRevision = z.infer<typeof ApplicationAnswerSetRevisionSchema>;
export type SaveApplicationAnswerSetInput = z.infer<typeof SaveApplicationAnswerSetInputSchema>;
export type ApplicationAnswerSetContext = z.infer<typeof ApplicationAnswerSetContextSchema>;
