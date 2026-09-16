import { z } from 'zod';
import {
  APPLICATION_EVENT_TYPES,
  APPLICATION_STAGES,
  CAMPAIGN_STATUSES,
  DISCOVERY_EXECUTORS,
  EVENT_ACTORS,
  JOB_SOURCE_KINDS,
  JOB_STATES,
} from '@job-harness/domain';

export const EntityIdSchema = z.string().trim().min(1).max(200);
export const IdempotencyKeySchema = z.string().trim().min(1).max(300);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const NullableIsoDateTimeSchema = IsoDateTimeSchema.nullable();
export const UrlSchema = z.url();

export const JobStateSchema = z.enum(JOB_STATES);
export const ApplicationStageSchema = z.enum(APPLICATION_STAGES);
export const ApplicationEventTypeSchema = z.enum(APPLICATION_EVENT_TYPES);
export const CampaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export const DiscoveryExecutorSchema = z.enum(DISCOVERY_EXECUTORS);
export const JobSourceKindSchema = z.enum(JOB_SOURCE_KINDS);
export const EventActorSchema = z.enum(EVENT_ACTORS);

export const CompanySchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(1).max(300),
    aliases: z.array(z.string().trim().min(1).max(300)).default([]),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

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

/**
 * canonicalUrl means a job-specific canonical URL. A generic company careers/listing
 * page belongs in sources[] and must not be promoted to canonicalUrl, because several
 * distinct jobs can legitimately share the same listing page.
 */
export const JobSchema = z
  .object({
    id: EntityIdSchema,
    companyId: EntityIdSchema,
    companyName: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(200).nullable().default(null),
    state: JobStateSchema,
    canonicalUrl: UrlSchema.nullable().default(null),
    externalIdentities: z.array(JobExternalIdentitySchema).default([]),
    sources: z.array(JobSourceSchema).min(1),
    description: z.string().nullable().default(null),
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
    discoveryRunId: EntityIdSchema.nullable().default(null),
    observedAt: IsoDateTimeSchema,
    source: JobSourceSchema,
    availability: z.enum(['active', 'closed', 'unknown']),
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
  .object({
    application: ApplicationSchema,
    job: JobSchema,
  })
  .strict();

export const ApplicationDetailSchema = z
  .object({
    application: ApplicationSchema,
    job: JobSchema,
    timeline: z.array(ApplicationEventSchema),
  })
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

export type Company = z.infer<typeof CompanySchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobObservation = z.infer<typeof JobObservationSchema>;
export type Application = z.infer<typeof ApplicationSchema>;
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;
export type ApplicationListItem = z.infer<typeof ApplicationListItemSchema>;
export type ApplicationDetail = z.infer<typeof ApplicationDetailSchema>;
export type ResumeProfileRef = z.infer<typeof ResumeProfileRefSchema>;
export type JobSearchCampaign = z.infer<typeof JobSearchCampaignSchema>;
export type DiscoveryRun = z.infer<typeof DiscoveryRunSchema>;
