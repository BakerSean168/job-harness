import { z } from 'zod';
import {
  ApplicationDetailSchema,
  ApplicationListItemSchema,
  ApplicationStageSchema,
  ApplicationSubmissionChannelSchema,
  DiscoveryExecutorSchema,
  DiscoveryRunSchema,
  EntityIdSchema,
  IdempotencyKeySchema,
  IsoDateTimeSchema,
  JobSchema,
  JobSourceKindSchema,
  JobStateSchema,
  JobSearchCampaignSchema,
  ResumeProfileRefSchema,
  SubmissionIntentExecutorSchema,
  SubmissionIntentSchema,
  SubmissionIntentStatusSchema,
} from './schemas';

export const PageSchema = z
  .object({
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().nonnegative().default(0),
  })
  .strict();

export const SearchJobsInputSchema = PageSchema.extend({
  company: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  city: z.string().trim().min(1).max(200).optional(),
  states: z.array(JobStateSchema).optional(),
  sourceKinds: z.array(JobSourceKindSchema).optional(),
  applied: z.boolean().optional(),
  campaignId: EntityIdSchema.optional(),
});

export const SearchJobsOutputSchema = z
  .object({ items: z.array(JobSchema), total: z.number().int().nonnegative() })
  .strict();

export const GetJobInputSchema = z.object({ jobId: EntityIdSchema }).strict();
export const GetJobOutputSchema = JobSchema.nullable();

export const JobListingCandidateSchema = z
  .object({
    sourceKind: JobSourceKindSchema,
    label: z.string().trim().min(1).max(200).nullable().optional(),
    url: z.url().nullable().optional(),
    externalNamespace: z.string().trim().min(1).max(100).nullable().optional(),
    externalId: z.string().trim().min(1).max(300).nullable().optional(),
    identityKind: z.enum(['external-id', 'url', 'scoped']),
    status: z.enum(['active', 'closed', 'unknown']).default('active'),
    publishedAt: IsoDateTimeSchema.nullable().optional(),
    metadataSnapshot: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.identityKind === 'external-id' && !value.externalId) {
      ctx.addIssue({ code: 'custom', message: 'external-id listing requires externalId', path: ['externalId'] });
    }
    if (value.identityKind === 'url' && !value.url) {
      ctx.addIssue({ code: 'custom', message: 'url listing requires url', path: ['url'] });
    }
  });

export const DuplicateCheckInputSchema = z
  .object({
    companyName: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(200).nullable().optional(),
    listings: z.array(JobListingCandidateSchema).default([]),
  })
  .strict();
export const DuplicateCheckOutputSchema = z
  .object({
    duplicate: z.boolean(),
    job: JobSchema.nullable(),
    matchedBy: z.enum(['listing-external-id', 'listing-url']).nullable(),
    potentialMatches: z.array(JobSchema).default([]),
    identityConflict: z.boolean().default(false),
  })
  .strict();

export const UpsertJobCandidateSchema = z
  .object({
    companyName: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(200).nullable().optional(),
    listings: z.array(JobListingCandidateSchema).min(1),
    description: z.string().nullable().optional(),
    observedAt: IsoDateTimeSchema,
    discoveryRunId: EntityIdSchema.nullable().optional(),
  })
  .strict();
export const UpsertJobsBatchInputSchema = z
  .object({ jobs: z.array(UpsertJobCandidateSchema).min(1).max(100) })
  .strict();
export const UpsertJobsBatchOutputSchema = z
  .object({
    items: z.array(
      z.object({
        index: z.number().int().nonnegative(),
        status: z.enum(['inserted', 'updated', 'duplicate', 'rejected']),
        jobId: EntityIdSchema.nullable(),
        reason: z.string().nullable(),
      }).strict(),
    ),
  })
  .strict();

export const SetJobStateInputSchema = z
  .object({ jobId: EntityIdSchema, state: JobStateSchema, idempotencyKey: IdempotencyKeySchema })
  .strict();
export const SetJobStateOutputSchema = JobSchema;

export const ListApplicationsInputSchema = PageSchema.extend({
  stages: z.array(ApplicationStageSchema).optional(),
  company: z.string().trim().min(1).max(300).optional(),
  campaignId: EntityIdSchema.optional(),
  resumeProfileId: EntityIdSchema.optional(),
  appliedFrom: IsoDateTimeSchema.optional(),
  appliedTo: IsoDateTimeSchema.optional(),
  terminal: z.enum(['exclude', 'include', 'only']).optional(),
});
export const ListApplicationsOutputSchema = z
  .object({ items: z.array(ApplicationListItemSchema), total: z.number().int().nonnegative() })
  .strict();

export const GetApplicationInputSchema = z.object({ applicationId: EntityIdSchema }).strict();
export const GetApplicationOutputSchema = ApplicationDetailSchema.nullable();

export const RecordApplicationInputSchema = z
  .object({
    jobId: EntityIdSchema,
    appliedAt: IsoDateTimeSchema,
    resumeProfileId: EntityIdSchema.nullable().optional(),
    resumeRevisionId: EntityIdSchema.nullable().optional(),
    resumeArtifactId: EntityIdSchema.nullable().optional(),
    listingId: EntityIdSchema.nullable().optional(),
    channel: ApplicationSubmissionChannelSchema.nullable().optional(),
    idempotencyKey: IdempotencyKeySchema,
    actor: z.enum(['user', 'chatgpt-web', 'import', 'system', 'other']),
    note: z.string().trim().max(4000).nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.resumeArtifactId && !value.resumeRevisionId) {
      ctx.addIssue({ code: 'custom', path: ['resumeArtifactId'], message: 'resumeArtifactId requires resumeRevisionId' });
    }
  });
export const RecordApplicationOutputSchema = GetApplicationOutputSchema.unwrap();

export const TransitionApplicationInputSchema = z
  .object({
    applicationId: EntityIdSchema,
    toStage: ApplicationStageSchema,
    occurredAt: IsoDateTimeSchema,
    idempotencyKey: IdempotencyKeySchema,
    actor: z.enum(['user', 'chatgpt-web', 'import', 'system', 'other']),
    note: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();
export const TransitionApplicationOutputSchema = GetApplicationOutputSchema.unwrap();



export const PrepareSubmissionIntentInputSchema = z.object({
  jobId: EntityIdSchema,
  listingId: EntityIdSchema.nullable().optional(),
  channel: ApplicationSubmissionChannelSchema.nullable().optional(),
  resumeProfileId: EntityIdSchema.nullable().optional(),
  resumeRevisionId: EntityIdSchema.nullable().optional(),
  resumeArtifactId: EntityIdSchema.nullable().optional(),
  executor: SubmissionIntentExecutorSchema,
  executorSessionId: z.string().trim().min(1).max(500).nullable().optional(),
  externalTargetUrl: z.url().nullable().optional(),
  idempotencyKey: IdempotencyKeySchema,
  note: z.string().trim().max(4000).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.resumeArtifactId && !value.resumeRevisionId) {
    ctx.addIssue({ code: 'custom', path: ['resumeArtifactId'], message: 'resumeArtifactId requires resumeRevisionId' });
  }
});
export const PrepareSubmissionIntentOutputSchema = SubmissionIntentSchema;
export const GetSubmissionIntentInputSchema = z.object({ intentId: EntityIdSchema }).strict();
export const GetSubmissionIntentOutputSchema = SubmissionIntentSchema.nullable();

export const BeginSubmissionIntentInputSchema = z.object({
  intentId: EntityIdSchema,
  occurredAt: IsoDateTimeSchema,
}).strict();
export const BeginSubmissionIntentOutputSchema = SubmissionIntentSchema;

export const ConfirmSubmissionIntentInputSchema = z.object({
  intentId: EntityIdSchema,
  confirmedAt: IsoDateTimeSchema,
  appliedAt: IsoDateTimeSchema,
  externalReference: z.string().trim().max(2000).nullable().optional(),
  externalEvidence: z.record(z.string(), z.unknown()).default({}),
}).strict();
export const SubmissionIntentCommitOutputSchema = z.object({
  intent: SubmissionIntentSchema,
  application: ApplicationDetailSchema.nullable(),
  persistenceCommitted: z.boolean(),
}).strict();

export const FailSubmissionIntentInputSchema = z.object({
  intentId: EntityIdSchema,
  occurredAt: IsoDateTimeSchema,
  status: z.enum(['external_failed', 'needs_manual_review']),
  error: z.string().trim().min(1).max(4000),
  externalEvidence: z.record(z.string(), z.unknown()).default({}),
}).strict();
export const FailSubmissionIntentOutputSchema = SubmissionIntentSchema;

export const ReconcileSubmissionIntentInputSchema = z.object({ intentId: EntityIdSchema }).strict();
export const ReconcileSubmissionIntentOutputSchema = SubmissionIntentCommitOutputSchema;

export const ListSubmissionIntentsInputSchema = PageSchema.extend({
  statuses: z.array(SubmissionIntentStatusSchema).optional(),
  jobId: EntityIdSchema.optional(),
  updatedBefore: IsoDateTimeSchema.optional(),
  order: z.enum(['newest', 'oldest']).default('newest'),
});
export const ListSubmissionIntentsOutputSchema = z.object({
  items: z.array(SubmissionIntentSchema),
  total: z.number().int().nonnegative(),
}).strict();

export const ReconcileSubmissionIntentsInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
  staleBefore: IsoDateTimeSchema.optional(),
  maxAutomaticRetries: z.number().int().min(0).max(100).default(8),
}).strict();
export const ReconcileSubmissionIntentResultSchema = z.object({
  intentId: EntityIdSchema,
  beforeStatus: SubmissionIntentStatusSchema,
  afterStatus: SubmissionIntentStatusSchema,
  persistenceCommitted: z.boolean(),
  action: z.enum(['committed', 'pending', 'manual_review', 'skipped']),
  message: z.string().nullable(),
}).strict();
export const ReconcileSubmissionIntentsOutputSchema = z.object({
  scanned: z.number().int().nonnegative(),
  committed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  manualReview: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  items: z.array(ReconcileSubmissionIntentResultSchema),
}).strict();

export const ListCampaignsInputSchema = PageSchema.extend({});
export const ListCampaignsOutputSchema = z
  .object({ items: z.array(JobSearchCampaignSchema), total: z.number().int().nonnegative() })
  .strict();
export const GetCampaignInputSchema = z.object({ campaignId: EntityIdSchema }).strict();
export const GetCampaignOutputSchema = JobSearchCampaignSchema.nullable();
export const UpsertCampaignInputSchema = JobSearchCampaignSchema.omit({ createdAt: true, updatedAt: true });
export const UpsertCampaignOutputSchema = JobSearchCampaignSchema;

export const ListResumesInputSchema = PageSchema.extend({});
export const ListResumesOutputSchema = z
  .object({ items: z.array(ResumeProfileRefSchema), total: z.number().int().nonnegative() })
  .strict();

export const BeginDiscoveryInputSchema = z
  .object({
    campaignId: EntityIdSchema.nullable().optional(),
    executor: DiscoveryExecutorSchema,
    contextSnapshot: z.record(z.string(), z.unknown()).default({}),
    startedAt: IsoDateTimeSchema,
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();
export const BeginDiscoveryOutputSchema = DiscoveryRunSchema;
export const CompleteDiscoveryInputSchema = z
  .object({
    runId: EntityIdSchema,
    completedAt: IsoDateTimeSchema,
    candidateCount: z.number().int().nonnegative(),
    insertedCount: z.number().int().nonnegative(),
    duplicateCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
  })
  .strict();
export const CompleteDiscoveryOutputSchema = DiscoveryRunSchema;

export const PipelineStatsInputSchema = z.object({ campaignId: EntityIdSchema.optional() }).strict();
export const PipelineStatsOutputSchema = z
  .object({
    knownJobs: z.number().int().nonnegative(),
    applications: z.number().int().nonnegative(),
    jobsByState: z.record(JobStateSchema, z.number().int().nonnegative()),
    applicationsByStage: z.record(ApplicationStageSchema, z.number().int().nonnegative()),
  })
  .strict();

export const CareerContextInputSchema = z.object({ campaignId: EntityIdSchema.optional() }).strict();
export const CareerContextOutputSchema = z
  .object({
    campaign: JobSearchCampaignSchema.nullable(),
    resumes: z.array(ResumeProfileRefSchema),
    pipeline: PipelineStatsOutputSchema,
  })
  .strict();


export type PrepareSubmissionIntentInput = z.input<typeof PrepareSubmissionIntentInputSchema>;
export type BeginSubmissionIntentInput = z.input<typeof BeginSubmissionIntentInputSchema>;
export type ConfirmSubmissionIntentInput = z.input<typeof ConfirmSubmissionIntentInputSchema>;
export type FailSubmissionIntentInput = z.input<typeof FailSubmissionIntentInputSchema>;
export type ReconcileSubmissionIntentInput = z.input<typeof ReconcileSubmissionIntentInputSchema>;
export type ReconcileSubmissionIntentsInput = z.input<typeof ReconcileSubmissionIntentsInputSchema>;
export type ReconcileSubmissionIntentsOutput = z.output<typeof ReconcileSubmissionIntentsOutputSchema>;
export type ListSubmissionIntentsInput = z.input<typeof ListSubmissionIntentsInputSchema>;
export type ListSubmissionIntentsOutput = z.output<typeof ListSubmissionIntentsOutputSchema>;
export type SubmissionIntentCommitOutput = z.output<typeof SubmissionIntentCommitOutputSchema>;

export type SearchJobsInput = z.input<typeof SearchJobsInputSchema>;
export type SearchJobsOutput = z.output<typeof SearchJobsOutputSchema>;
export type DuplicateCheckInput = z.input<typeof DuplicateCheckInputSchema>;
export type DuplicateCheckOutput = z.output<typeof DuplicateCheckOutputSchema>;
export type JobListingCandidate = z.input<typeof JobListingCandidateSchema>;
export type UpsertJobCandidate = z.input<typeof UpsertJobCandidateSchema>;
export type UpsertJobsBatchInput = z.input<typeof UpsertJobsBatchInputSchema>;
export type UpsertJobsBatchOutput = z.output<typeof UpsertJobsBatchOutputSchema>;
export type SetJobStateInput = z.input<typeof SetJobStateInputSchema>;
export type ListApplicationsInput = z.input<typeof ListApplicationsInputSchema>;
export type RecordApplicationInput = z.input<typeof RecordApplicationInputSchema>;
export type TransitionApplicationInput = z.input<typeof TransitionApplicationInputSchema>;
export type BeginDiscoveryInput = z.input<typeof BeginDiscoveryInputSchema>;
export type CompleteDiscoveryInput = z.input<typeof CompleteDiscoveryInputSchema>;
export type PipelineStatsInput = z.input<typeof PipelineStatsInputSchema>;
export type CareerContextInput = z.input<typeof CareerContextInputSchema>;

export type ListApplicationsOutput = z.output<typeof ListApplicationsOutputSchema>;
export type GetApplicationOutput = z.output<typeof GetApplicationOutputSchema>;
export type ListCampaignsInput = z.input<typeof ListCampaignsInputSchema>;
export type ListCampaignsOutput = z.output<typeof ListCampaignsOutputSchema>;
export type GetCampaignOutput = z.output<typeof GetCampaignOutputSchema>;
export type UpsertCampaignInput = z.input<typeof UpsertCampaignInputSchema>;
export type ListResumesInput = z.input<typeof ListResumesInputSchema>;
export type ListResumesOutput = z.output<typeof ListResumesOutputSchema>;
export type PipelineStatsOutput = z.output<typeof PipelineStatsOutputSchema>;
export type CareerContextOutput = z.output<typeof CareerContextOutputSchema>;
