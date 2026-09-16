import { z } from 'zod';
import {
  JOB_STATES,
} from '@job-harness/domain';
import {
  ApplicationEventSchema,
  ApplicationSchema,
  ApplicationStageSchema,
  DiscoveryExecutorSchema,
  DiscoveryRunSchema,
  EntityIdSchema,
  IsoDateTimeSchema,
  JobListingSchema,
  JobObservationSchema,
  JobSchema,
  JobSearchCampaignSchema,
  JobSourceKindSchema,
  NullableIsoDateTimeSchema,
  ResumeProfileRefSchema,
} from './schemas';
import { PageSchema, SearchJobsInputSchema } from './operations';

export const CampaignRefSchema = JobSearchCampaignSchema.pick({
  id: true,
  name: true,
  status: true,
});

export const JobApplicationSummarySchema = ApplicationSchema.pick({
  id: true,
  currentStage: true,
  appliedAt: true,
  resumeProfileId: true,
  updatedAt: true,
});

export const JobListItemSchema = z.object({
  jobId: EntityIdSchema,
  companyId: EntityIdSchema,
  companyName: z.string().trim().min(1),
  title: z.string().trim().min(1),
  city: z.string().nullable(),
  state: z.enum(JOB_STATES),
  application: JobApplicationSummarySchema.nullable(),
  primaryListing: JobListingSchema.nullable(),
  listingCount: z.number().int().nonnegative(),
  sourceKinds: z.array(JobSourceKindSchema),
  campaigns: z.array(CampaignRefSchema),
  resume: ResumeProfileRefSchema.nullable(),
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
}).strict();

export const SearchJobListItemsInputSchema = SearchJobsInputSchema;
export const SearchJobListItemsOutputSchema = z.object({
  items: z.array(JobListItemSchema),
  total: z.number().int().nonnegative(),
}).strict();

export const JobObservationViewSchema = z.object({
  observation: JobObservationSchema,
  listing: JobListingSchema,
}).strict();

export const JobApplicationViewSchema = z.object({
  application: ApplicationSchema,
  timeline: z.array(ApplicationEventSchema),
  resume: ResumeProfileRefSchema.nullable(),
  latestEvent: ApplicationEventSchema.nullable(),
  submissionCount: z.number().int().nonnegative(),
}).strict();

export const JobDetailSchema = z.object({
  job: JobSchema,
  primaryListing: JobListingSchema.nullable(),
  campaigns: z.array(CampaignRefSchema),
  application: JobApplicationViewSchema.nullable(),
  observations: z.array(JobObservationViewSchema),
}).strict();

export const GetJobDetailInputSchema = z.object({ jobId: EntityIdSchema }).strict();
export const GetJobDetailOutputSchema = JobDetailSchema.nullable();

export const ApplicationBoardItemSchema = z.object({
  application: ApplicationSchema,
  companyId: EntityIdSchema,
  companyName: z.string().trim().min(1),
  title: z.string().trim().min(1),
  city: z.string().nullable(),
  jobState: z.enum(JOB_STATES),
  primaryListing: JobListingSchema.nullable(),
  campaigns: z.array(CampaignRefSchema),
  resume: ResumeProfileRefSchema.nullable(),
  latestEvent: ApplicationEventSchema.nullable(),
  stageEnteredAt: IsoDateTimeSchema,
  submissionCount: z.number().int().nonnegative(),
}).strict();

export const ListApplicationBoardInputSchema = PageSchema.extend({
  stages: z.array(ApplicationStageSchema).optional(),
  company: z.string().trim().min(1).max(300).optional(),
  campaignId: EntityIdSchema.optional(),
  resumeProfileId: EntityIdSchema.optional(),
  appliedFrom: IsoDateTimeSchema.optional(),
  appliedTo: IsoDateTimeSchema.optional(),
  terminal: z.enum(['exclude', 'include', 'only']).default('exclude'),
});
export const ListApplicationBoardOutputSchema = z.object({
  items: z.array(ApplicationBoardItemSchema),
  total: z.number().int().nonnegative(),
}).strict();

export const ApplicationWorkspaceDetailSchema = z.object({
  application: ApplicationSchema,
  job: JobSchema,
  primaryListing: JobListingSchema.nullable(),
  campaigns: z.array(CampaignRefSchema),
  resume: ResumeProfileRefSchema.nullable(),
  timeline: z.array(ApplicationEventSchema),
  latestEvent: ApplicationEventSchema.nullable(),
  stageEnteredAt: IsoDateTimeSchema,
  submissionCount: z.number().int().nonnegative(),
}).strict();
export const GetApplicationWorkspaceDetailInputSchema = z.object({ applicationId: EntityIdSchema }).strict();
export const GetApplicationWorkspaceDetailOutputSchema = ApplicationWorkspaceDetailSchema.nullable();


export const ResumeUsageSummarySchema = z.object({
  resume: ResumeProfileRefSchema,
  applications: z.number().int().nonnegative(),
  applicationsByStage: z.record(ApplicationStageSchema, z.number().int().nonnegative()),
  lastUsedAt: NullableIsoDateTimeSchema,
}).strict();

export const ListResumeUsageInputSchema = PageSchema.extend({
  campaignId: EntityIdSchema.optional(),
});
export const ListResumeUsageOutputSchema = z.object({
  items: z.array(ResumeUsageSummarySchema),
  total: z.number().int().nonnegative(),
}).strict();

export const DiscoveryRunSummarySchema = z.object({
  run: DiscoveryRunSchema,
  campaign: CampaignRefSchema.nullable(),
}).strict();

export const ListDiscoveryRunsInputSchema = PageSchema.extend({
  campaignId: EntityIdSchema.optional(),
  executor: DiscoveryExecutorSchema.optional(),
});
export const ListDiscoveryRunsOutputSchema = z.object({
  items: z.array(DiscoveryRunSummarySchema),
  total: z.number().int().nonnegative(),
}).strict();

export const DiscoveryRunDetailSchema = z.object({
  run: DiscoveryRunSchema,
  campaign: CampaignRefSchema.nullable(),
  affectedJobs: z.array(JobListItemSchema),
  observationCount: z.number().int().nonnegative(),
}).strict();

export const GetDiscoveryRunDetailInputSchema = z.object({ runId: EntityIdSchema }).strict();
export const GetDiscoveryRunDetailOutputSchema = DiscoveryRunDetailSchema.nullable();

export const DashboardSnapshotInputSchema = z.object({
  campaignId: EntityIdSchema.optional(),
  recentDiscoveryLimit: z.number().int().min(1).max(20).default(5),
  attentionLimit: z.number().int().min(1).max(30).default(10),
}).strict();

export const DashboardKpisSchema = z.object({
  knownJobs: z.number().int().nonnegative(),
  inbox: z.number().int().nonnegative(),
  shortlisted: z.number().int().nonnegative(),
  applications: z.number().int().nonnegative(),
  activePipeline: z.number().int().nonnegative(),
  interviewStage: z.number().int().nonnegative(),
}).strict();

export const DashboardFunnelSchema = z.object({
  discovered: z.number().int().nonnegative(),
  shortlisted: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  screening: z.number().int().nonnegative(),
  assessment: z.number().int().nonnegative(),
  interview: z.number().int().nonnegative(),
  offer: z.number().int().nonnegative(),
}).strict();

export const DashboardAttentionKindSchema = z.enum([
  'stale_application',
  'shortlisted_unapplied',
  'closed_listing_active_application',
  'stale_campaign_discovery',
  'missing_resume_artifact',
  'stale_resume_artifact',
]);

export const DashboardAttentionItemSchema = z.object({
  id: z.string().trim().min(1),
  kind: DashboardAttentionKindSchema,
  severity: z.enum(['info', 'warning', 'critical']),
  label: z.string().trim().min(1),
  jobId: EntityIdSchema.nullable(),
  applicationId: EntityIdSchema.nullable(),
  campaignId: EntityIdSchema.nullable(),
  resumeProfileId: EntityIdSchema.nullable(),
  stage: ApplicationStageSchema.nullable(),
  sinceAt: NullableIsoDateTimeSchema,
}).strict();

export const DashboardWeeklyActivityPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jobsObserved: z.number().int().nonnegative(),
  opportunitiesInserted: z.number().int().nonnegative(),
  shortlisted: z.number().int().nonnegative().nullable(),
  applicationsRecorded: z.number().int().nonnegative(),
  stageChanges: z.number().int().nonnegative(),
  interviewsScheduled: z.number().int().nonnegative(),
}).strict();

export const DashboardSourcePerformanceSchema = z.object({
  sourceKind: JobSourceKindSchema,
  opportunities: z.number().int().nonnegative(),
  applications: z.number().int().nonnegative(),
  applicationsByStage: z.record(ApplicationStageSchema, z.number().int().nonnegative()),
}).strict();

export const DashboardSnapshotSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  campaign: CampaignRefSchema.nullable(),
  kpis: DashboardKpisSchema,
  funnel: DashboardFunnelSchema,
  recentDiscoveryRuns: z.array(DiscoveryRunSummarySchema),
  resumeUsage: z.array(ResumeUsageSummarySchema),
  attention: z.array(DashboardAttentionItemSchema),
  weeklyActivity: z.array(DashboardWeeklyActivityPointSchema),
  sourcePerformance: z.array(DashboardSourcePerformanceSchema),
}).strict();

export type CampaignRef = z.infer<typeof CampaignRefSchema>;
export type JobListItem = z.infer<typeof JobListItemSchema>;
export type SearchJobListItemsInput = z.input<typeof SearchJobListItemsInputSchema>;
export type SearchJobListItemsOutput = z.output<typeof SearchJobListItemsOutputSchema>;
export type JobObservationView = z.infer<typeof JobObservationViewSchema>;
export type JobApplicationView = z.infer<typeof JobApplicationViewSchema>;
export type JobDetail = z.infer<typeof JobDetailSchema>;
export type ApplicationBoardItem = z.infer<typeof ApplicationBoardItemSchema>;
export type ListApplicationBoardInput = z.input<typeof ListApplicationBoardInputSchema>;
export type ListApplicationBoardOutput = z.output<typeof ListApplicationBoardOutputSchema>;
export type ApplicationWorkspaceDetail = z.infer<typeof ApplicationWorkspaceDetailSchema>;
export type ResumeUsageSummary = z.infer<typeof ResumeUsageSummarySchema>;
export type ListResumeUsageInput = z.input<typeof ListResumeUsageInputSchema>;
export type ListResumeUsageOutput = z.output<typeof ListResumeUsageOutputSchema>;
export type DiscoveryRunSummary = z.infer<typeof DiscoveryRunSummarySchema>;
export type ListDiscoveryRunsInput = z.input<typeof ListDiscoveryRunsInputSchema>;
export type ListDiscoveryRunsOutput = z.output<typeof ListDiscoveryRunsOutputSchema>;
export type DiscoveryRunDetail = z.infer<typeof DiscoveryRunDetailSchema>;
export type DashboardAttentionItem = z.infer<typeof DashboardAttentionItemSchema>;
export type DashboardWeeklyActivityPoint = z.infer<typeof DashboardWeeklyActivityPointSchema>;
export type DashboardSourcePerformance = z.infer<typeof DashboardSourcePerformanceSchema>;
export type DashboardSnapshotInput = z.input<typeof DashboardSnapshotInputSchema>;
export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>;
