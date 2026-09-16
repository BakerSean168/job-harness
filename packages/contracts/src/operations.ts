import { z } from 'zod';
import {
  ApplicationDetailSchema,
  ApplicationListItemSchema,
  ApplicationStageSchema,
  DiscoveryExecutorSchema,
  DiscoveryRunSchema,
  EntityIdSchema,
  IdempotencyKeySchema,
  IsoDateTimeSchema,
  JobExternalIdentitySchema,
  JobSchema,
  JobSourceSchema,
  JobSourceKindSchema,
  JobStateSchema,
  JobSearchCampaignSchema,
  ResumeProfileRefSchema,
  UrlSchema,
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
});

export const SearchJobsOutputSchema = z
  .object({ items: z.array(JobSchema), total: z.number().int().nonnegative() })
  .strict();

export const GetJobInputSchema = z.object({ jobId: EntityIdSchema }).strict();
export const GetJobOutputSchema = JobSchema.nullable();

export const DuplicateCheckInputSchema = z
  .object({
    companyName: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(200).nullable().optional(),
    canonicalUrl: UrlSchema.nullable().optional(),
    externalIdentity: JobExternalIdentitySchema.nullable().optional(),
  })
  .strict();
export const DuplicateCheckOutputSchema = z
  .object({ duplicate: z.boolean(), job: JobSchema.nullable(), matchedBy: z.enum(['external-id', 'url', 'composite']).nullable() })
  .strict();

export const UpsertJobCandidateSchema = z
  .object({
    companyName: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(200).nullable().optional(),
    canonicalUrl: UrlSchema.nullable().optional(),
    externalIdentities: z.array(JobExternalIdentitySchema).default([]),
    sources: z.array(JobSourceSchema).min(1),
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
    idempotencyKey: IdempotencyKeySchema,
    actor: z.enum(['user', 'chatgpt-web', 'import', 'system', 'other']),
    note: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();
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

export type SearchJobsInput = z.input<typeof SearchJobsInputSchema>;
export type SearchJobsOutput = z.output<typeof SearchJobsOutputSchema>;
export type DuplicateCheckInput = z.input<typeof DuplicateCheckInputSchema>;
export type DuplicateCheckOutput = z.output<typeof DuplicateCheckOutputSchema>;
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
