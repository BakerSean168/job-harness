import { z } from 'zod';
import {
  APPLICATION_EVENT_TYPES,
  APPLICATION_SUBMISSION_CHANNELS,
  APPLICATION_STAGES,
  CAMPAIGN_STATUSES,
  DISCOVERY_EXECUTORS,
  EVENT_ACTORS,
  JOB_LISTING_IDENTITY_KINDS,
  JOB_LISTING_STATUSES,
  JOB_SOURCE_KINDS,
  JOB_STATES,
  SUBMISSION_INTENT_EXECUTORS,
  SUBMISSION_INTENT_STATUSES,
} from '@job-harness/domain';

export const EntityIdSchema = z.string().trim().min(1).max(200);
export const IdempotencyKeySchema = z.string().trim().min(1).max(300);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const NullableIsoDateTimeSchema = IsoDateTimeSchema.nullable();
export const UrlSchema = z.url();

export const JobStateSchema = z.enum(JOB_STATES);
export const JobListingStatusSchema = z.enum(JOB_LISTING_STATUSES);
export const JobListingIdentityKindSchema = z.enum(JOB_LISTING_IDENTITY_KINDS);
export const ApplicationStageSchema = z.enum(APPLICATION_STAGES);
export const ApplicationEventTypeSchema = z.enum(APPLICATION_EVENT_TYPES);
export const ApplicationSubmissionChannelSchema = z.enum(APPLICATION_SUBMISSION_CHANNELS);
export const CampaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export const DiscoveryExecutorSchema = z.enum(DISCOVERY_EXECUTORS);
export const JobSourceKindSchema = z.enum(JOB_SOURCE_KINDS);
export const EventActorSchema = z.enum(EVENT_ACTORS);
export const SubmissionIntentStatusSchema = z.enum(SUBMISSION_INTENT_STATUSES);
export const SubmissionIntentExecutorSchema = z.enum(SUBMISSION_INTENT_EXECUTORS);

export const CompanySchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(1).max(300),
    aliases: z.array(z.string().trim().min(1).max(300)).default([]),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

/** Deprecated compatibility primitives for legacy import adapters. */
export const JobExternalIdentitySchema = z
  .object({
    source: z.string().trim().min(1).max(100),
    externalId: z.string().trim().min(1).max(300),
  })
  .strict();
export const JobSourceSchema = z
  .object({
    kind: JobSourceKindSchema,
    url: UrlSchema.optional(),
    label: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const JobListingSchema = z
  .object({
    id: EntityIdSchema,
    jobId: EntityIdSchema,
    sourceKind: JobSourceKindSchema,
    label: z.string().trim().min(1).max(200).nullable().default(null),
    url: UrlSchema.nullable().default(null),
    externalNamespace: z.string().trim().min(1).max(100).nullable().default(null),
    externalId: z.string().trim().min(1).max(300).nullable().default(null),
    identityKind: JobListingIdentityKindSchema,
    status: JobListingStatusSchema,
    firstSeenAt: IsoDateTimeSchema,
    lastSeenAt: IsoDateTimeSchema,
    publishedAt: NullableIsoDateTimeSchema.default(null),
    closedAt: NullableIsoDateTimeSchema.default(null),
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

export const JobSchema = z
  .object({
    id: EntityIdSchema,
    companyId: EntityIdSchema,
    companyName: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(200).nullable().default(null),
    state: JobStateSchema,
    description: z.string().nullable().default(null),
    listings: z.array(JobListingSchema).default([]),
    firstSeenAt: IsoDateTimeSchema,
    lastSeenAt: IsoDateTimeSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const JobObservationSchema = z
  .object({
    id: EntityIdSchema,
    jobId: EntityIdSchema,
    listingId: EntityIdSchema,
    discoveryRunId: EntityIdSchema.nullable().default(null),
    observedAt: IsoDateTimeSchema,
    availability: JobListingStatusSchema,
  })
  .strict();

export const ApplicationEventSchema = z
  .object({
    id: EntityIdSchema,
    applicationId: EntityIdSchema,
    type: ApplicationEventTypeSchema,
    stage: ApplicationStageSchema.nullable().default(null),
    occurredAt: IsoDateTimeSchema,
    actor: EventActorSchema,
    idempotencyKey: IdempotencyKeySchema,
    note: z.string().trim().max(4000).nullable().default(null),
  })
  .strict();


export const ApplicationSubmissionSchema = z
  .object({
    id: EntityIdSchema,
    applicationId: EntityIdSchema,
    listingId: EntityIdSchema.nullable().default(null),
    submittedAt: IsoDateTimeSchema,
    channel: ApplicationSubmissionChannelSchema.nullable().default(null),
    resumeProfileId: EntityIdSchema.nullable().default(null),
    resumeRevisionId: EntityIdSchema.nullable().default(null),
    resumeArtifactId: EntityIdSchema.nullable().default(null),
    actor: EventActorSchema,
    idempotencyKey: IdempotencyKeySchema,
    note: z.string().trim().max(4000).nullable().default(null),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.resumeArtifactId && !value.resumeRevisionId) {
      ctx.addIssue({ code: 'custom', path: ['resumeArtifactId'], message: 'resumeArtifactId requires resumeRevisionId' });
    }
  });

export const ApplicationSchema = z
  .object({
    id: EntityIdSchema,
    jobId: EntityIdSchema,
    currentStage: ApplicationStageSchema,
    appliedAt: IsoDateTimeSchema,
    resumeProfileId: EntityIdSchema.nullable().default(null),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const ApplicationListItemSchema = z
  .object({ application: ApplicationSchema, job: JobSchema })
  .strict();

export const ApplicationDetailSchema = z
  .object({ application: ApplicationSchema, job: JobSchema, timeline: z.array(ApplicationEventSchema), submissions: z.array(ApplicationSubmissionSchema).default([]) })
  .strict();

export const ResumeProfileRefSchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(1).max(300),
    source: z.enum(['resume-harness', 'external', 'manual']),
    externalProfileId: z.string().trim().min(1).max(300).nullable().default(null),
    targetRole: z.string().trim().min(1).max(300).nullable().default(null),
    version: z.string().trim().min(1).max(100).nullable().default(null),
    hash: z.string().trim().min(1).max(200).nullable().default(null),
    artifactUri: z.string().trim().min(1).max(2000).nullable().default(null),
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const JobSearchCampaignSchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(1).max(300),
    targetRoles: z.array(z.string().trim().min(1).max(300)).min(1),
    cities: z.array(z.string().trim().min(1).max(200)).default([]),
    graduationYears: z.array(z.number().int().min(2000).max(2200)).default([]),
    experience: z.array(z.string().trim().min(1).max(100)).default([]),
    keywords: z.array(z.string().trim().min(1).max(200)).default([]),
    exclusions: z.array(z.string().trim().min(1).max(200)).default([]),
    sources: z.array(JobSourceKindSchema).default([]),
    resumeProfileIds: z.array(EntityIdSchema).default([]),
    status: CampaignStatusSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const DiscoveryRunSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema.nullable().default(null),
    executor: DiscoveryExecutorSchema,
    contextSnapshot: z.record(z.string(), z.unknown()).default({}),
    startedAt: IsoDateTimeSchema,
    completedAt: NullableIsoDateTimeSchema.default(null),
    candidateCount: z.number().int().nonnegative().default(0),
    insertedCount: z.number().int().nonnegative().default(0),
    duplicateCount: z.number().int().nonnegative().default(0),
    rejectedCount: z.number().int().nonnegative().default(0),
  })
  .strict();


export const SubmissionIntentSchema = z.object({
  id: EntityIdSchema,
  jobId: EntityIdSchema,
  listingId: EntityIdSchema.nullable().default(null),
  channel: ApplicationSubmissionChannelSchema.nullable().default(null),
  resumeProfileId: EntityIdSchema.nullable().default(null),
  resumeRevisionId: EntityIdSchema.nullable().default(null),
  resumeArtifactId: EntityIdSchema.nullable().default(null),
  executor: SubmissionIntentExecutorSchema,
  executorSessionId: z.string().trim().min(1).max(500).nullable().default(null),
  externalTargetUrl: z.url().nullable().default(null),
  status: SubmissionIntentStatusSchema,
  externalStartedAt: NullableIsoDateTimeSchema.default(null),
  externalConfirmedAt: NullableIsoDateTimeSchema.default(null),
  appliedAt: NullableIsoDateTimeSchema.default(null),
  externalReference: z.string().trim().max(2000).nullable().default(null),
  externalEvidence: z.record(z.string(), z.unknown()).default({}),
  applicationId: EntityIdSchema.nullable().default(null),
  submissionId: EntityIdSchema.nullable().default(null),
  prepareIdempotencyKey: IdempotencyKeySchema,
  lastError: z.string().trim().max(4000).nullable().default(null),
  retryCount: z.number().int().nonnegative().default(0),
  note: z.string().trim().max(4000).nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict().superRefine((value, ctx) => {
  if (value.resumeArtifactId && !value.resumeRevisionId) {
    ctx.addIssue({ code: 'custom', path: ['resumeArtifactId'], message: 'resumeArtifactId requires resumeRevisionId' });
  }
  if (value.status === 'committed' && (!value.applicationId || !value.submissionId)) {
    ctx.addIssue({ code: 'custom', path: ['status'], message: 'committed intent requires applicationId and submissionId' });
  }
  if (['external_confirmed', 'persistence_pending', 'committed'].includes(value.status) && (!value.externalConfirmedAt || !value.appliedAt)) {
    ctx.addIssue({ code: 'custom', path: ['externalConfirmedAt'], message: 'confirmed/pending/committed intent requires externalConfirmedAt and appliedAt' });
  }
});

export type Company = z.infer<typeof CompanySchema>;
export type JobListing = z.infer<typeof JobListingSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobObservation = z.infer<typeof JobObservationSchema>;
export type Application = z.infer<typeof ApplicationSchema>;
export type ApplicationSubmission = z.infer<typeof ApplicationSubmissionSchema>;
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;
export type ApplicationListItem = z.infer<typeof ApplicationListItemSchema>;
export type ApplicationDetail = z.infer<typeof ApplicationDetailSchema>;
export type ResumeProfileRef = z.infer<typeof ResumeProfileRefSchema>;
export type JobSearchCampaign = z.infer<typeof JobSearchCampaignSchema>;
export type DiscoveryRun = z.infer<typeof DiscoveryRunSchema>;
export type SubmissionIntent = z.infer<typeof SubmissionIntentSchema>;
