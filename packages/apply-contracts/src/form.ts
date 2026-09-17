import { z } from 'zod';

export const ApplicantFieldKeySchema = z.string().trim().min(1).max(240).regex(/^[a-z0-9_.\[\]-]+$/);
export const APPLICANT_VALUE_TYPES = ['text','multiline','email','phone','url','number','date','boolean','choice','multi_choice','file'] as const;
export const ApplicantValueTypeSchema = z.enum(APPLICANT_VALUE_TYPES);
export const APPLICANT_SENSITIVITIES = ['public','personal','sensitive','legal','protected'] as const;
export const ApplicantSensitivitySchema = z.enum(APPLICANT_SENSITIVITIES);

export const ApplicantFieldCatalogEntrySchema = z.object({
  key: ApplicantFieldKeySchema,
  label: z.string().trim().min(1).max(240),
  valueType: ApplicantValueTypeSchema,
  sensitivity: ApplicantSensitivitySchema,
  aliases: z.array(z.string().trim().min(1).max(240)).max(100).default([]),
  allowAiMapping: z.boolean().default(false),
  requiresLiteral: z.boolean().default(true),
  source: z.string().trim().min(1).max(120),
}).strict();

export const ApplicantFieldCatalogSchema = z.object({
  version: z.string().trim().min(1).max(240),
  entries: z.array(ApplicantFieldCatalogEntrySchema).max(2000),
}).strict();

export const ApplicantScalarValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const ApplicantResolvedValueSchema = z.object({
  key: ApplicantFieldKeySchema,
  value: z.union([ApplicantScalarValueSchema, z.array(ApplicantScalarValueSchema)]),
  valueType: ApplicantValueTypeSchema,
  sensitivity: ApplicantSensitivitySchema,
  provenance: z.string().trim().min(1).max(240),
  literal: z.boolean().default(true),
}).strict();
export const ResolvedApplicantValuesSchema = z.object({
  catalogVersion: z.string().trim().min(1).max(240),
  values: z.array(ApplicantResolvedValueSchema),
}).strict();

export const FORM_FIELD_TYPES = ['text','textarea','email','tel','url','number','date','select','radio','checkbox','file','unknown'] as const;
export const FormFieldTypeSchema = z.enum(FORM_FIELD_TYPES);
export const FormOptionSchema = z.object({
  value: z.string().max(2000),
  label: z.string().trim().max(500),
  disabled: z.boolean().default(false),
}).strict();

export const FieldIRSchema = z.object({
  id: z.string().trim().min(1).max(240),
  pageId: z.string().trim().min(1).max(240),
  sectionId: z.string().trim().min(1).max(240).nullable().default(null),
  controlRef: z.string().trim().min(1).max(1000),
  type: FormFieldTypeSchema,
  label: z.string().trim().max(1000),
  name: z.string().trim().max(500).nullable().default(null),
  description: z.string().trim().max(2000).nullable().default(null),
  required: z.boolean().default(false),
  disabled: z.boolean().default(false),
  readOnly: z.boolean().default(false),
  options: z.array(FormOptionSchema).max(500).default([]),
  semanticHints: z.array(z.string().trim().min(1).max(240)).max(100).default([]),
  sensitivityHint: ApplicantSensitivitySchema.nullable().default(null),
  accept: z.string().trim().max(1000).nullable().default(null),
  multiple: z.boolean().default(false),
}).strict();

export const FormSectionIRSchema = z.object({
  id: z.string().trim().min(1).max(240),
  pageId: z.string().trim().min(1).max(240),
  title: z.string().trim().max(1000).nullable().default(null),
  fieldIds: z.array(z.string().trim().min(1).max(240)).max(2000),
}).strict();

export const FormPageIRSchema = z.object({
  id: z.string().trim().min(1).max(240),
  url: z.url(),
  title: z.string().trim().max(1000).nullable().default(null),
  sectionIds: z.array(z.string().trim().min(1).max(240)).max(500),
  fieldIds: z.array(z.string().trim().min(1).max(240)).max(5000),
}).strict();

export const FormIRSchema = z.object({
  version: z.literal(1),
  pages: z.array(FormPageIRSchema).min(1).max(100),
  sections: z.array(FormSectionIRSchema).max(1000),
  fields: z.array(FieldIRSchema).max(5000),
  observedAt: z.iso.datetime({ offset: true }),
  source: z.object({
    adapterId: z.string().trim().min(1).max(200),
    adapterVersion: z.string().trim().min(1).max(100),
    host: z.string().trim().min(1).max(500),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const fieldIds = new Set<string>();
  for (const field of value.fields) {
    if (fieldIds.has(field.id)) ctx.addIssue({ code: 'custom', path: ['fields'], message: `duplicate field id '${field.id}'` });
    fieldIds.add(field.id);
  }
  const sectionIds = new Set(value.sections.map((section) => section.id));
  for (const page of value.pages) {
    for (const fieldId of page.fieldIds) if (!fieldIds.has(fieldId)) ctx.addIssue({ code: 'custom', path: ['pages'], message: `unknown page field '${fieldId}'` });
    for (const sectionId of page.sectionIds) if (!sectionIds.has(sectionId)) ctx.addIssue({ code: 'custom', path: ['pages'], message: `unknown page section '${sectionId}'` });
  }
  for (const section of value.sections) {
    for (const fieldId of section.fieldIds) if (!fieldIds.has(fieldId)) ctx.addIssue({ code: 'custom', path: ['sections'], message: `unknown section field '${fieldId}'` });
  }
});

export const FIELD_BINDING_SOURCES = ['playbook','rule','semantic','user'] as const;
export const FieldBindingSourceSchema = z.enum(FIELD_BINDING_SOURCES);
export const FieldBindingSchema = z.object({
  fieldId: z.string().trim().min(1).max(240),
  applicantKey: ApplicantFieldKeySchema,
  confidence: z.number().min(0).max(1),
  source: FieldBindingSourceSchema,
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const FILL_METHODS = ['set_text','select_option','set_checked','attach_file','manual'] as const;
export const FillMethodSchema = z.enum(FILL_METHODS);
export const FillInstructionSchema = z.object({
  fieldId: z.string().trim().min(1).max(240),
  applicantKey: ApplicantFieldKeySchema,
  method: FillMethodSchema,
  source: FieldBindingSourceSchema,
  confidence: z.number().min(0).max(1),
}).strict();
export const PendingFieldSchema = z.object({
  fieldId: z.string().trim().min(1).max(240),
  required: z.boolean(),
  reason: z.string().trim().min(1).max(1000),
}).strict();
export const ProhibitedFieldSchema = z.object({
  fieldId: z.string().trim().min(1).max(240),
  reason: z.string().trim().min(1).max(1000),
}).strict();
export const FillPlanSchema = z.object({
  version: z.literal(1),
  formVersion: z.string().trim().min(1).max(240),
  catalogVersion: z.string().trim().min(1).max(240),
  bindings: z.array(FieldBindingSchema).max(5000),
  instructions: z.array(FillInstructionSchema).max(5000),
  pending: z.array(PendingFieldSchema).max(5000),
  prohibited: z.array(ProhibitedFieldSchema).max(5000),
}).strict();

export const SemanticFieldViewSchema = FieldIRSchema.pick({
  id: true, type: true, label: true, name: true, description: true, required: true, options: true, semanticHints: true, sensitivityHint: true,
}).strict();
export const SemanticCatalogEntryViewSchema = ApplicantFieldCatalogEntrySchema.pick({
  key: true, label: true, valueType: true, sensitivity: true, aliases: true, allowAiMapping: true,
}).strict();
export const SemanticMappingViewSchema = z.object({
  fields: z.array(SemanticFieldViewSchema),
  catalog: z.array(SemanticCatalogEntryViewSchema),
}).strict();
export const SemanticMappingProposalSchema = z.object({
  fieldId: z.string().trim().min(1).max(240),
  applicantKey: ApplicantFieldKeySchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const FillFieldResultSchema = z.object({
  fieldId: z.string().trim().min(1).max(240),
  applicantKey: ApplicantFieldKeySchema,
  status: z.enum(['filled','skipped','failed','manual']),
  method: FillMethodSchema,
  detail: z.string().trim().max(1000).nullable().default(null),
}).strict();
export const FillReportSchema = z.object({
  results: z.array(FillFieldResultSchema),
  filled: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
}).strict();

export type ApplicantFieldKey = z.infer<typeof ApplicantFieldKeySchema>;
export type ApplicantValueType = z.infer<typeof ApplicantValueTypeSchema>;
export type ApplicantSensitivity = z.infer<typeof ApplicantSensitivitySchema>;
export type ApplicantFieldCatalogEntry = z.infer<typeof ApplicantFieldCatalogEntrySchema>;
export type ApplicantFieldCatalog = z.infer<typeof ApplicantFieldCatalogSchema>;
export type ApplicantResolvedValue = z.infer<typeof ApplicantResolvedValueSchema>;
export type ResolvedApplicantValues = z.infer<typeof ResolvedApplicantValuesSchema>;
export type FormFieldType = z.infer<typeof FormFieldTypeSchema>;
export type FormOption = z.infer<typeof FormOptionSchema>;
export type FieldIR = z.infer<typeof FieldIRSchema>;
export type FormIR = z.infer<typeof FormIRSchema>;
export type FieldBinding = z.infer<typeof FieldBindingSchema>;
export type FillMethod = z.infer<typeof FillMethodSchema>;
export type FillInstruction = z.infer<typeof FillInstructionSchema>;
export type FillPlan = z.infer<typeof FillPlanSchema>;
export type SemanticMappingView = z.infer<typeof SemanticMappingViewSchema>;
export type SemanticMappingProposal = z.infer<typeof SemanticMappingProposalSchema>;
export type FillReport = z.infer<typeof FillReportSchema>;

export const AuthorizeResumeArtifactInputSchema = z.object({
  attemptId: z.string().trim().min(1).max(200),
  executorId: z.string().trim().min(1).max(200),
  leaseToken: z.string().min(32).max(500),
}).strict();
export const ResumeArtifactGrantOutputSchema = z.object({
  artifactId: z.string().trim().min(1).max(200),
  revisionId: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative(),
  bytesBase64: z.string(),
}).strict();
export type AuthorizeResumeArtifactInput = z.input<typeof AuthorizeResumeArtifactInputSchema>;
export type ResumeArtifactGrantOutput = z.output<typeof ResumeArtifactGrantOutputSchema>;
