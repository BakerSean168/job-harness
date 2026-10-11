import { z } from 'zod';

export const RecruitmentSiteSchema = z.enum([
  'boss',
  'zhilian',
  'liepin',
  'job51',
  'nowcoder',
  'moka',
  'beisen',
  'feishu-jobs',
  'hotjob',
  'zhiye',
  'generic-ats',
]);
export type RecruitmentSite = z.infer<typeof RecruitmentSiteSchema>;

export const RecruitmentRuntimeCapabilitySchema = z.enum([
  'discovery',
  'inspect-job',
  'outreach-greeting',
  'recruiter-inbox',
  'resume-followup',
  'form-fill',
  'resume-upload',
  'final-submit',
]);
export type RecruitmentRuntimeCapability = z.infer<typeof RecruitmentRuntimeCapabilitySchema>;

export const RecruitmentRuntimeDescriptorSchema = z.object({
  runtimeId: z.string().trim().min(1).max(120),
  runtimeVersion: z.string().trim().min(1).max(160),
  site: RecruitmentSiteSchema,
  implementation: z.enum(['upstream-direct', 'upstream-derived', 'job-harness-native', 'generic-fallback']),
  upstream: z.object({
    project: z.string().trim().min(1).max(160),
    repository: z.url(),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    license: z.string().trim().min(1).max(80),
  }).strict().nullable(),
  capabilities: z.array(RecruitmentRuntimeCapabilitySchema).min(1),
  browserProfile: z.enum(['dedicated', 'user-browser']),
  controlGranularity: z.literal('business-task'),
}).strict();
export type RecruitmentRuntimeDescriptor = z.infer<typeof RecruitmentRuntimeDescriptorSchema>;

export const RecruitmentRuntimeTaskKindSchema = z.enum([
  'campaign-discovery',
  'job-inspection',
  'outreach-greeting',
  'recruiter-inbox-sync',
  'resume-followup',
  'application-fill',
  'application-submit',
]);
export type RecruitmentRuntimeTaskKind = z.infer<typeof RecruitmentRuntimeTaskKindSchema>;

export const RecruitmentRuntimeTaskPolicySchema = z.object({
  collect: z.boolean().default(true),
  greeting: z.boolean().default(false),
  recruiterInbox: z.boolean().default(false),
  resumeFollowup: z.boolean().default(false),
  formFill: z.boolean().default(false),
  resumeUpload: z.boolean().default(false),
  finalSubmit: z.boolean().default(false),
  maxExternalEffects: z.number().int().min(0).max(500).default(0),
}).strict();
export type RecruitmentRuntimeTaskPolicy = z.infer<typeof RecruitmentRuntimeTaskPolicySchema>;

export const RecruitmentRuntimeTaskSchema = z.object({
  id: z.string().trim().min(1).max(200),
  runtimeId: z.string().trim().min(1).max(120),
  site: RecruitmentSiteSchema,
  kind: RecruitmentRuntimeTaskKindSchema,
  campaignId: z.string().trim().min(1).max(200).nullable().default(null),
  jobId: z.string().trim().min(1).max(200).nullable().default(null),
  listingId: z.string().trim().min(1).max(200).nullable().default(null),
  resumeProfileId: z.string().trim().min(1).max(200).nullable().default(null),
  resumeArtifactId: z.string().trim().min(1).max(200).nullable().default(null),
  targetUrl: z.url().nullable().default(null),
  policy: RecruitmentRuntimeTaskPolicySchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable().default(null),
  idempotencyKey: z.string().trim().min(1).max(300),
}).strict().superRefine((task, ctx) => {
  if (task.kind === 'application-submit' && !task.policy.finalSubmit) {
    ctx.addIssue({ code: 'custom', path: ['policy', 'finalSubmit'], message: 'application-submit requires finalSubmit=true' });
  }
  if (task.kind === 'application-fill' && !task.policy.formFill) {
    ctx.addIssue({ code: 'custom', path: ['policy', 'formFill'], message: 'application-fill requires formFill=true' });
  }
  if (task.kind === 'outreach-greeting' && !task.policy.greeting) {
    ctx.addIssue({ code: 'custom', path: ['policy', 'greeting'], message: 'outreach-greeting requires greeting=true' });
  }
  if (task.kind === 'resume-followup' && !task.policy.resumeFollowup) {
    ctx.addIssue({ code: 'custom', path: ['policy', 'resumeFollowup'], message: 'resume-followup requires resumeFollowup=true' });
  }
});
export type RecruitmentRuntimeTask = z.infer<typeof RecruitmentRuntimeTaskSchema>;

export const RecruitmentRuntimeEventTypeSchema = z.enum([
  'task-accepted',
  'task-started',
  'job-observed',
  'job-skipped',
  'greeting-requested',
  'greeting-sent',
  'recruiter-message-observed',
  'resume-sent',
  'form-filled',
  'resume-uploaded',
  'review-ready',
  'submit-started',
  'submission-confirmed',
  'human-required',
  'task-paused',
  'task-expired',
  'task-completed',
  'task-failed',
]);
export type RecruitmentRuntimeEventType = z.infer<typeof RecruitmentRuntimeEventTypeSchema>;

export const RecruitmentRuntimeEventSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  taskId: z.string().trim().min(1).max(200).nullable().default(null),
  runtimeId: z.string().trim().min(1).max(120),
  site: RecruitmentSiteSchema,
  type: RecruitmentRuntimeEventTypeSchema,
  occurredAt: z.iso.datetime(),
  jobId: z.string().trim().min(1).max(200).nullable().default(null),
  listingId: z.string().trim().min(1).max(200).nullable().default(null),
  externalEffect: z.boolean().default(false),
  evidence: z.record(z.string(), z.unknown()).default({}),
}).strict();
export type RecruitmentRuntimeEvent = z.infer<typeof RecruitmentRuntimeEventSchema>;

export const RecruitmentRuntimeHealthSchema = z.object({
  runtimeId: z.string().trim().min(1).max(120),
  site: RecruitmentSiteSchema,
  state: z.enum(['ready', 'login-required', 'challenge', 'paused', 'offline', 'degraded', 'unknown']),
  browserConnected: z.boolean(),
  activeTaskId: z.string().trim().min(1).max(200).nullable().default(null),
  lastEventAt: z.iso.datetime().nullable().default(null),
  detail: z.string().trim().max(1000).nullable().default(null),
  checkedAt: z.iso.datetime(),
}).strict();
export type RecruitmentRuntimeHealth = z.infer<typeof RecruitmentRuntimeHealthSchema>;

export const RecruitmentRuntimeControlSnapshotSchema = z.object({
  task: RecruitmentRuntimeTaskSchema.nullable(),
  desiredState: z.enum(['running', 'paused']),
  lifecycleState: z.enum(['running', 'paused', 'expired']).optional(),
  updatedAt: z.iso.datetime(),
  reason: z.string().trim().max(500).nullable(),
}).strict();
export type RecruitmentRuntimeControlSnapshot = z.infer<typeof RecruitmentRuntimeControlSnapshotSchema>;

export interface RecruitmentSiteRuntimePort {
  descriptor(): Promise<RecruitmentRuntimeDescriptor>;
  health(): Promise<RecruitmentRuntimeHealth>;
  submit(task: RecruitmentRuntimeTask): Promise<RecruitmentRuntimeTask>;
  events(input?: { after?: string | null; limit?: number }): Promise<readonly RecruitmentRuntimeEvent[]>;
  pause(taskId: string, reason: string): Promise<void>;
}
