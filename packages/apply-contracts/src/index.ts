import { z } from 'zod';

export const ApplyEntityIdSchema = z.string().trim().min(1).max(200);
export const ApplyIsoDateTimeSchema = z.iso.datetime({ offset: true });
export const ApplyPageSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
}).strict();

export const EXECUTOR_STATUSES = [
  'ready',
  'busy',
  'degraded',
  'login_required',
  'human_action_required',
  'offline',
] as const;
export const ExecutorStatusSchema = z.enum(EXECUTOR_STATUSES);

export const EXECUTION_MODES = ['fill_only', 'review_then_submit', 'auto_submit'] as const;
export const ExecutionModeSchema = z.enum(EXECUTION_MODES);

export const EXECUTION_ATTEMPT_STATES = [
  'queued',
  'claimed',
  'running',
  'waiting_for_user',
  'completed',
  'failed',
  'cancelled',
  'abandoned',
] as const;
export const ExecutionAttemptStateSchema = z.enum(EXECUTION_ATTEMPT_STATES);

export const EXTERNAL_EFFECT_STATES = ['not_crossed', 'crossed', 'uncertain'] as const;
export const ExternalEffectStateSchema = z.enum(EXTERNAL_EFFECT_STATES);

export const EXECUTION_EVENT_TYPES = [
  'attempt_queued',
  'attempt_claimed',
  'attempt_started',
  'browser_session_ready',
  'listing_opened',
  'form_inspected',
  'fields_filled',
  'resume_attached',
  'validation_failed',
  'review_ready',
  'human_action_required',
  'attempt_resumed',
  'attempt_heartbeat',
  'submit_authorized',
  'submit_triggered',
  'external_success_observed',
  'external_failure_observed',
  'external_result_uncertain',
  'attempt_completed',
  'attempt_failed',
  'attempt_cancelled',
  'attempt_abandoned',
] as const;
export const ExecutionEventTypeSchema = z.enum(EXECUTION_EVENT_TYPES);

export const EXECUTOR_CAPABILITY_KEYS = ['resumeUpload','humanControl','persistentSession','screenshots','semanticMapping'] as const;
export const ExecutorCapabilityKeySchema = z.enum(EXECUTOR_CAPABILITY_KEYS);

export const ExecutorCapabilitiesSchema = z.object({
  resumeUpload: z.boolean().default(false),
  humanControl: z.boolean().default(false),
  persistentSession: z.boolean().default(false),
  screenshots: z.boolean().default(false),
  semanticMapping: z.boolean().default(false),
}).strict();

export const ExecutorDescriptorSchema = z.object({
  executorId: ApplyEntityIdSchema,
  name: z.string().trim().min(1).max(200),
  version: z.string().trim().min(1).max(100),
  hostLabel: z.string().trim().min(1).max(200).nullable().default(null),
  status: ExecutorStatusSchema,
  browserBackends: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  adapterIds: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  executionModes: z.array(ExecutionModeSchema).min(1),
  capabilities: ExecutorCapabilitiesSchema,
  maxConcurrency: z.number().int().min(1).max(32).default(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const ExecutorRegistrationSchema = ExecutorDescriptorSchema.extend({
  lastHeartbeatAt: ApplyIsoDateTimeSchema,
  createdAt: ApplyIsoDateTimeSchema,
  updatedAt: ApplyIsoDateTimeSchema,
}).strict();

export const ApplyBundleResumeArtifactSchema = z.object({
  id: ApplyEntityIdSchema,
  revisionId: ApplyEntityIdSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(240).default('resume.pdf'),
}).strict();

export const ApplyBundleSchema = z.object({
  intentId: ApplyEntityIdSchema,
  attemptId: ApplyEntityIdSchema,
  jobId: ApplyEntityIdSchema,
  listingId: ApplyEntityIdSchema.nullable(),
  listingUrl: z.url().nullable(),
  company: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(200).nullable(),
  resumeProfileId: ApplyEntityIdSchema.nullable(),
  resumeRevisionId: ApplyEntityIdSchema.nullable(),
  resumeArtifact: ApplyBundleResumeArtifactSchema.nullable(),
  applicantCatalogVersion: z.string().trim().min(1).max(500).nullable().default(null),
  applicantProfileRevisionId: ApplyEntityIdSchema.nullable().default(null),
  applicantProfileHash: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  answerSetRevisionId: ApplyEntityIdSchema.nullable().default(null),
  answerSetVersion: z.string().trim().min(1).max(500).nullable().default(null),
  answerSetHash: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  policySnapshot: z.record(z.string(), z.unknown()).default({}),
  createdAt: ApplyIsoDateTimeSchema,
}).strict().superRefine((value, ctx) => {
  if (value.resumeArtifact && !value.resumeRevisionId) {
    ctx.addIssue({ code: 'custom', path: ['resumeRevisionId'], message: 'resumeArtifact requires a frozen resumeRevisionId' });
  }
  if (value.resumeArtifact && value.resumeRevisionId && value.resumeArtifact.revisionId !== value.resumeRevisionId) {
    ctx.addIssue({ code: 'custom', path: ['resumeArtifact', 'revisionId'], message: 'resumeArtifact revisionId must match resumeRevisionId' });
  }
  const hasApplicantRevision = value.applicantProfileRevisionId !== null;
  const hasApplicantHash = value.applicantProfileHash !== null;
  if (hasApplicantRevision !== hasApplicantHash) {
    ctx.addIssue({ code: 'custom', path: ['applicantProfileRevisionId'], message: 'applicant profile revision id and hash must be frozen together' });
  }
  const answerEvidence = [value.answerSetRevisionId, value.answerSetVersion, value.answerSetHash];
  const answerPresent = answerEvidence.filter((item) => item !== null).length;
  if (answerPresent !== 0 && answerPresent !== answerEvidence.length) {
    ctx.addIssue({ code: 'custom', path: ['answerSetRevisionId'], message: 'answer-set revision id, version and hash must be frozen together' });
  }
  if ((hasApplicantRevision || value.answerSetRevisionId !== null) && value.applicantCatalogVersion === null) {
    ctx.addIssue({ code: 'custom', path: ['applicantCatalogVersion'], message: 'frozen applicant evidence requires an applicant catalog version' });
  }
});

export const BrowserSessionHandoffSchema = z.object({
  backendId: z.string().trim().min(1).max(100),
  sessionRef: z.string().trim().min(1).max(500),
  humanControlUrl: z.url().nullable().default(null),
  retainedAt: ApplyIsoDateTimeSchema,
  expiresAt: ApplyIsoDateTimeSchema,
}).strict().superRefine((value, ctx) => {
  if (value.expiresAt <= value.retainedAt) {
    ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'browser session handoff must expire after retainedAt' });
  }
});

export const ExecutionAttemptSchema = z.object({
  id: ApplyEntityIdSchema,
  intentId: ApplyEntityIdSchema,
  executorId: ApplyEntityIdSchema.nullable(),
  requiredAdapterId: z.string().trim().min(1).max(200).nullable(),
  adapterId: z.string().trim().min(1).max(200).nullable(),
  adapterVersion: z.string().trim().min(1).max(100).nullable(),
  preferredBrowserBackend: z.string().trim().min(1).max(100).nullable(),
  browserBackend: z.string().trim().min(1).max(100).nullable(),
  browserSessionHandoff: BrowserSessionHandoffSchema.nullable().default(null),
  executionMode: ExecutionModeSchema,
  state: ExecutionAttemptStateSchema,
  leaseOwner: ApplyEntityIdSchema.nullable(),
  leaseExpiresAt: ApplyIsoDateTimeSchema.nullable(),
  lastHeartbeatAt: ApplyIsoDateTimeSchema.nullable(),
  checkpoint: z.string().trim().max(200).nullable(),
  externalEffectState: ExternalEffectStateSchema,
  requiredCapabilities: z.array(ExecutorCapabilityKeySchema).max(10).default([]),
  policySnapshot: z.record(z.string(), z.unknown()).default({}),
  bundle: ApplyBundleSchema,
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  dispatchRequestHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  submitAuthorizationId: ApplyEntityIdSchema.nullable(),
  errorCode: z.string().trim().min(1).max(100).nullable(),
  errorSummary: z.string().trim().min(1).max(1000).nullable(),
  startedAt: ApplyIsoDateTimeSchema.nullable(),
  completedAt: ApplyIsoDateTimeSchema.nullable(),
  idempotencyKey: z.string().trim().min(1).max(300),
  createdAt: ApplyIsoDateTimeSchema,
  updatedAt: ApplyIsoDateTimeSchema,
}).strict();

export const ExecutionEventSchema = z.object({
  id: ApplyEntityIdSchema,
  attemptId: ApplyEntityIdSchema,
  sequence: z.number().int().positive(),
  type: ExecutionEventTypeSchema,
  occurredAt: ApplyIsoDateTimeSchema,
  checkpoint: z.string().trim().max(200).nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const ExecutionAttemptDetailSchema = z.object({
  attempt: ExecutionAttemptSchema,
  events: z.array(ExecutionEventSchema),
}).strict();

export const RegisterExecutorInputSchema = ExecutorDescriptorSchema;
export const ExecutorHeartbeatInputSchema = z.object({
  executorId: ApplyEntityIdSchema,
  status: ExecutorStatusSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const ListExecutorsInputSchema = ApplyPageSchema.extend({
  statuses: z.array(ExecutorStatusSchema).optional(),
}).strict();
export const ListExecutorsOutputSchema = z.object({
  items: z.array(ExecutorRegistrationSchema),
  total: z.number().int().nonnegative(),
}).strict();

export const DispatchExecutionAttemptInputSchema = z.object({
  intentId: ApplyEntityIdSchema,
  executionMode: ExecutionModeSchema.default('fill_only'),
  requiredAdapterId: z.string().trim().min(1).max(200).nullable().optional(),
  preferredBrowserBackend: z.string().trim().min(1).max(100).nullable().optional(),
  requiredCapabilities: z.array(ExecutorCapabilityKeySchema).max(10).default([]),
  policySnapshot: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().min(1).max(300),
}).strict();

export const ListExecutionAttemptsInputSchema = ApplyPageSchema.extend({
  states: z.array(ExecutionAttemptStateSchema).optional(),
  intentId: ApplyEntityIdSchema.optional(),
  executorId: ApplyEntityIdSchema.optional(),
  externalEffectStates: z.array(ExternalEffectStateSchema).optional(),
}).strict();
export const ListExecutionAttemptsOutputSchema = z.object({
  items: z.array(ExecutionAttemptSchema),
  total: z.number().int().nonnegative(),
}).strict();

export const ClaimExecutionAttemptInputSchema = z.object({
  executorId: ApplyEntityIdSchema,
  leaseSeconds: z.number().int().min(30).max(300).default(90),
}).strict();
export const ClaimExecutionAttemptOutputSchema = z.object({
  attempt: ExecutionAttemptSchema,
  leaseToken: z.string().min(32).max(500),
}).strict().nullable();

export const AttemptLeaseInputSchema = z.object({
  attemptId: ApplyEntityIdSchema,
  executorId: ApplyEntityIdSchema,
  leaseToken: z.string().min(32).max(500),
}).strict();

export const HeartbeatExecutionAttemptInputSchema = AttemptLeaseInputSchema.extend({
  checkpoint: z.string().trim().max(200).nullable().optional(),
  leaseSeconds: z.number().int().min(30).max(300).default(90),
}).strict();

export const StartExecutionAttemptInputSchema = AttemptLeaseInputSchema.extend({
  adapterId: z.string().trim().min(1).max(200),
  adapterVersion: z.string().trim().min(1).max(100),
  browserBackend: z.string().trim().min(1).max(100),
  checkpoint: z.string().trim().max(200).nullable().optional(),
}).strict();

export const MarkExecutionAttemptWaitingInputSchema = AttemptLeaseInputSchema.extend({
  checkpoint: z.string().trim().max(200).nullable().optional(),
  reasonCode: z.string().trim().min(1).max(100),
  summary: z.string().trim().min(1).max(1000),
  payload: z.record(z.string(), z.unknown()).default({}),
  browserSessionHandoff: BrowserSessionHandoffSchema.nullable().optional(),
}).strict();

export const ResumeExecutionAttemptInputSchema = z.object({
  attemptId: ApplyEntityIdSchema,
}).strict();

export const CompleteExecutionAttemptInputSchema = AttemptLeaseInputSchema.extend({
  checkpoint: z.string().trim().max(200).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const FailExecutionAttemptInputSchema = AttemptLeaseInputSchema.extend({
  checkpoint: z.string().trim().max(200).nullable().optional(),
  errorCode: z.string().trim().min(1).max(100),
  errorSummary: z.string().trim().min(1).max(1000),
  externalEffectState: ExternalEffectStateSchema.default('not_crossed'),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const CancelExecutionAttemptInputSchema = z.object({
  attemptId: ApplyEntityIdSchema,
  reason: z.string().trim().min(1).max(1000).nullable().optional(),
}).strict();

export type ExecutorStatus = z.infer<typeof ExecutorStatusSchema>;
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type ExecutionAttemptState = z.infer<typeof ExecutionAttemptStateSchema>;
export type ExternalEffectState = z.infer<typeof ExternalEffectStateSchema>;
export type ExecutionEventType = z.infer<typeof ExecutionEventTypeSchema>;
export type ExecutorCapabilities = z.infer<typeof ExecutorCapabilitiesSchema>;
export type ExecutorDescriptor = z.infer<typeof ExecutorDescriptorSchema>;
export type ExecutorRegistration = z.infer<typeof ExecutorRegistrationSchema>;
export type ApplyBundle = z.infer<typeof ApplyBundleSchema>;
export type BrowserSessionHandoff = z.infer<typeof BrowserSessionHandoffSchema>;
export type ExecutionAttempt = z.infer<typeof ExecutionAttemptSchema>;
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;
export type ExecutionAttemptDetail = z.infer<typeof ExecutionAttemptDetailSchema>;
export type RegisterExecutorInput = z.input<typeof RegisterExecutorInputSchema>;
export type ExecutorHeartbeatInput = z.input<typeof ExecutorHeartbeatInputSchema>;
export type ListExecutorsInput = z.input<typeof ListExecutorsInputSchema>;
export type ListExecutorsOutput = z.output<typeof ListExecutorsOutputSchema>;
export type DispatchExecutionAttemptInput = z.input<typeof DispatchExecutionAttemptInputSchema>;
export type ListExecutionAttemptsInput = z.input<typeof ListExecutionAttemptsInputSchema>;
export type ListExecutionAttemptsOutput = z.output<typeof ListExecutionAttemptsOutputSchema>;
export type ClaimExecutionAttemptInput = z.input<typeof ClaimExecutionAttemptInputSchema>;
export type ClaimExecutionAttemptOutput = z.output<typeof ClaimExecutionAttemptOutputSchema>;
export type HeartbeatExecutionAttemptInput = z.input<typeof HeartbeatExecutionAttemptInputSchema>;
export type StartExecutionAttemptInput = z.input<typeof StartExecutionAttemptInputSchema>;
export type MarkExecutionAttemptWaitingInput = z.input<typeof MarkExecutionAttemptWaitingInputSchema>;
export type ResumeExecutionAttemptInput = z.input<typeof ResumeExecutionAttemptInputSchema>;
export type CompleteExecutionAttemptInput = z.input<typeof CompleteExecutionAttemptInputSchema>;
export type FailExecutionAttemptInput = z.input<typeof FailExecutionAttemptInputSchema>;
export type CancelExecutionAttemptInput = z.input<typeof CancelExecutionAttemptInputSchema>;
export * from './form';
export * from './submit-safety';
export * from './browser-extension-bridge';
