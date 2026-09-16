import { z } from 'zod';
import {
  JOB_STATES,
} from '@job-harness/domain';
import {
  ApplicationEventSchema,
  ApplicationSchema,
  ApplicationStageSchema,
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

export const DashboardSnapshotSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  campaign: CampaignRefSchema.nullable(),
  kpis: DashboardKpisSchema,
  funnel: DashboardFunnelSchema,
  recentDiscoveryRuns: z.array(DiscoveryRunSummarySchema),
  resumeUsage: z.array(ResumeUsageSummarySchema),
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
export type DiscoveryRunDetail = z.infer<typeof DiscoveryRunDetailSchema>;
export type DashboardSnapshotInput = z.input<typeof DashboardSnapshotInputSchema>;
export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>;
