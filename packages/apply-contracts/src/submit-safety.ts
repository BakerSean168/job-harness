import { z } from 'zod';
const ApplyIsoDateTimeSchema = z.iso.datetime({ offset: true });
const ExecutorIdSchema = z.string().trim().min(1).max(200);
const ExecutionAttemptIdSchema = z.string().trim().min(1).max(200);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const ReviewSnapshotSummarySchema = z.object({
  fieldCount: z.number().int().nonnegative(),
  bindingCount: z.number().int().nonnegative(),
  filled: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
  requiredPending: z.number().int().nonnegative(),
  prohibitedCount: z.number().int().nonnegative(),
  blockingIssueCodes: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  readyForSubmit: z.boolean(),
}).strict();

export const ReviewSnapshotSchema = z.object({
  id: z.string().trim().min(1).max(200),
  attemptId: ExecutionAttemptIdSchema,
  bundleHash: Sha256Schema,
  browserSessionRef: z.string().trim().min(1).max(500).nullable(),
  formStateHash: Sha256Schema,
  formVersion: z.string().trim().min(1).max(240),
  catalogVersion: z.string().trim().min(1).max(240),
  siteAdapterId: z.string().trim().min(1).max(200),
  siteAdapterVersion: z.string().trim().min(1).max(100),
  summary: ReviewSnapshotSummarySchema,
  reviewHash: Sha256Schema,
  createdAt: ApplyIsoDateTimeSchema,
}).strict();

export const CreateReviewSnapshotInputSchema = z.object({
  attemptId: ExecutionAttemptIdSchema,
  executorId: ExecutorIdSchema,
  leaseToken: z.string().min(32).max(500),
  formStateHash: Sha256Schema,
  formVersion: z.string().trim().min(1).max(240),
  catalogVersion: z.string().trim().min(1).max(240),
  siteAdapterId: z.string().trim().min(1).max(200),
  siteAdapterVersion: z.string().trim().min(1).max(100),
  browserSessionRef: z.string().trim().min(1).max(500).nullable().optional(),
  summary: ReviewSnapshotSummarySchema,
}).strict();

export const ListReviewSnapshotsInputSchema = z.object({
  attemptId: ExecutionAttemptIdSchema,
  limit: z.number().int().min(1).max(100).default(20),
}).strict();
export const ListReviewSnapshotsOutputSchema = z.object({ items: z.array(ReviewSnapshotSchema) }).strict();

export const SUBMIT_AUTHORIZATION_STATUSES = ['active','consumed','revoked'] as const;
export const SubmitAuthorizationStatusSchema = z.enum(SUBMIT_AUTHORIZATION_STATUSES);
export const SubmitAuthorizationSchema = z.object({
  id: z.string().trim().min(1).max(200),
  attemptId: ExecutionAttemptIdSchema,
  reviewSnapshotId: z.string().trim().min(1).max(200),
  reviewHash: Sha256Schema,
  actor: z.enum(['user','system']),
  status: SubmitAuthorizationStatusSchema,
  issuedAt: ApplyIsoDateTimeSchema,
  expiresAt: ApplyIsoDateTimeSchema,
  consumedAt: ApplyIsoDateTimeSchema.nullable(),
  revokedAt: ApplyIsoDateTimeSchema.nullable(),
  idempotencyKey: z.string().trim().min(1).max(300),
  requestHash: Sha256Schema,
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'authorization must expire after issuance' });
  if (value.status === 'consumed' && !value.consumedAt) ctx.addIssue({ code: 'custom', path: ['consumedAt'], message: 'consumed authorization requires consumedAt' });
  if (value.status === 'revoked' && !value.revokedAt) ctx.addIssue({ code: 'custom', path: ['revokedAt'], message: 'revoked authorization requires revokedAt' });
});

export const AuthorizeSubmitInputSchema = z.object({
  attemptId: ExecutionAttemptIdSchema,
  reviewSnapshotId: z.string().trim().min(1).max(200),
  expiresInSeconds: z.number().int().min(30).max(900).default(300),
  idempotencyKey: z.string().trim().min(1).max(300),
}).strict();
export const RevokeSubmitAuthorizationInputSchema = z.object({
  attemptId: ExecutionAttemptIdSchema,
  authorizationId: z.string().trim().min(1).max(200),
}).strict();
export const ListSubmitAuthorizationsInputSchema = z.object({
  attemptId: ExecutionAttemptIdSchema,
  limit: z.number().int().min(1).max(100).default(20),
}).strict();
export const ListSubmitAuthorizationsOutputSchema = z.object({ items: z.array(SubmitAuthorizationSchema) }).strict();

export const BeginSubmitInputSchema = z.object({
  attemptId: ExecutionAttemptIdSchema,
  executorId: ExecutorIdSchema,
  leaseToken: z.string().min(32).max(500),
  authorizationId: z.string().trim().min(1).max(200),
  formStateHash: Sha256Schema,
  occurredAt: ApplyIsoDateTimeSchema,
}).strict();
export const BeginSubmitOutputSchema = z.object({
  attemptId: ExecutionAttemptIdSchema,
  state: z.string().trim().min(1).max(100),
  externalEffectState: z.enum(['not_crossed','crossed','uncertain']),
  authorization: SubmitAuthorizationSchema,
}).strict();

export const ReportSubmitSuccessInputSchema = z.object({
  attemptId: ExecutionAttemptIdSchema,
  executorId: ExecutorIdSchema,
  leaseToken: z.string().min(32).max(500),
  confirmedAt: ApplyIsoDateTimeSchema,
  appliedAt: ApplyIsoDateTimeSchema,
  externalReference: z.string().trim().min(1).max(1000).nullable().optional(),
  externalEvidence: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const ReportSubmitFailureInputSchema = z.object({
  attemptId: ExecutionAttemptIdSchema,
  executorId: ExecutorIdSchema,
  leaseToken: z.string().min(32).max(500),
  occurredAt: ApplyIsoDateTimeSchema,
  outcome: z.enum(['external_failed','uncertain']),
  error: z.string().trim().min(1).max(4000),
  externalEvidence: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type ReviewSnapshot = z.infer<typeof ReviewSnapshotSchema>;
export type ReviewSnapshotSummary = z.infer<typeof ReviewSnapshotSummarySchema>;
export type CreateReviewSnapshotInput = z.input<typeof CreateReviewSnapshotInputSchema>;
export type SubmitAuthorization = z.infer<typeof SubmitAuthorizationSchema>;
export type AuthorizeSubmitInput = z.input<typeof AuthorizeSubmitInputSchema>;
export type BeginSubmitInput = z.input<typeof BeginSubmitInputSchema>;
export type ReportSubmitSuccessInput = z.input<typeof ReportSubmitSuccessInputSchema>;
export type ReportSubmitFailureInput = z.input<typeof ReportSubmitFailureInputSchema>;
