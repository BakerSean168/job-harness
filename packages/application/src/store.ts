import type {
  Application,
  AnalyticsSnapshot,
  AnalyticsSnapshotInput,
  ApplicationDetail,
  CompanyDetail,
  ApplicationWorkspaceDetail,
  ApplicationEvent,
  ApplicationSubmission,
  Company,
  DiscoveryRun,
  DuplicateCheckInput,
  DuplicateCheckOutput,
  DashboardSnapshot,
  DashboardSnapshotInput,
  DiscoveryRunDetail,
  JobDetail,
  ListDiscoveryRunsInput,
  ListDiscoveryRunsOutput,
  ListResumeUsageInput,
  ListResumeUsageOutput,
  SearchJobListItemsInput,
  SearchJobListItemsOutput,
  Job,
  JobListing,
  JobObservation,
  JobSearchCampaign,
  ListApplicationBoardInput,
  ListApplicationBoardOutput,
  ListApplicationsInput,
  ListApplicationsOutput,
  ListCampaignsInput,
  ListCampaignsOutput,
  ListCompaniesInput,
  ListCompaniesOutput,
  ListResumesInput,
  ListResumesOutput,
  ListSavedViewsInput,
  ListSavedViewsOutput,
  PipelineStatsInput,
  PipelineStatsOutput,
  ResumeProfileRef,
  SavedView,
  SavedViewWorkspace,
  SearchJobsInput,
  SearchJobsOutput,
  UpsertJobCandidate,
  ListSubmissionIntentsInput,
  ListSubmissionIntentsOutput,
  SubmissionIntent,
} from '@job-harness/contracts';
import type { ApplicationStage, JobState } from '@job-harness/domain';

export interface IdempotencyReceipt {
  readonly scope: string;
  readonly key: string;
  readonly requestHash: string;
  readonly result: unknown;
  readonly createdAt: string;
}

export interface CareerStoreReadPort {
  searchJobs(input: SearchJobsInput): Promise<SearchJobsOutput>;
  getJob(jobId: string): Promise<Job | null>;
  findDuplicate(input: DuplicateCheckInput): Promise<DuplicateCheckOutput>;
  listApplications(input: ListApplicationsInput): Promise<ListApplicationsOutput>;
  getApplication(applicationId: string): Promise<ApplicationDetail | null>;
  getSubmissionIntent(intentId: string): Promise<SubmissionIntent | null>;
  listSubmissionIntents(input: ListSubmissionIntentsInput): Promise<ListSubmissionIntentsOutput>;
  findApplicationByJobId(jobId: string): Promise<Application | null>;
  listApplicationSubmissions(applicationId: string): Promise<readonly ApplicationSubmission[]>;
  listCampaigns(input: ListCampaignsInput): Promise<ListCampaignsOutput>;
  getCampaign(campaignId: string): Promise<JobSearchCampaign | null>;
  listResumeProfiles(input: ListResumesInput): Promise<ListResumesOutput>;
  getResumeProfile(resumeProfileId: string): Promise<ResumeProfileRef | null>;
  getDiscoveryRun(runId: string): Promise<DiscoveryRun | null>;
  getPipelineStats(input: PipelineStatsInput): Promise<PipelineStatsOutput>;
  listCompanyViews(input: ListCompaniesInput): Promise<ListCompaniesOutput>;
  getCompanyDetailView(companyId: string, campaignId?: string): Promise<CompanyDetail | null>;
  getAnalyticsSnapshot(input: AnalyticsSnapshotInput, generatedAt: string): Promise<AnalyticsSnapshot>;
  searchJobListItems(input: SearchJobListItemsInput): Promise<SearchJobListItemsOutput>;
  listApplicationBoard(input: ListApplicationBoardInput): Promise<ListApplicationBoardOutput>;
  getApplicationWorkspaceDetail(applicationId: string): Promise<ApplicationWorkspaceDetail | null>;
  getJobDetailView(jobId: string): Promise<JobDetail | null>;
  getDashboardSnapshot(input: DashboardSnapshotInput, generatedAt: string): Promise<DashboardSnapshot>;
  listDiscoveryRunViews(input: ListDiscoveryRunsInput): Promise<ListDiscoveryRunsOutput>;
  getDiscoveryRunDetailView(runId: string): Promise<DiscoveryRunDetail | null>;
  listResumeUsage(input: ListResumeUsageInput): Promise<ListResumeUsageOutput>;
  listSavedViews(input: ListSavedViewsInput): Promise<ListSavedViewsOutput>;
  getSavedView(savedViewId: string): Promise<SavedView | null>;
  findSavedViewByName(workspace: SavedViewWorkspace, name: string): Promise<SavedView | null>;
  getIdempotencyReceipt(scope: string, key: string): Promise<IdempotencyReceipt | null>;
}

export interface CareerStoreTransactionPort extends CareerStoreReadPort {
  resolveCompany(name: string, now: string): Promise<Company>;
  addCompanyAlias(companyId: string, alias: string, now: string): Promise<Company>;
  insertJob(job: Job): Promise<void>;
  mergeJobCandidate(jobId: string, candidate: UpsertJobCandidate, now: string): Promise<{ job: Job; metadataChanged: boolean; touchedListings: JobListing[] }>;
  insertObservation(observation: JobObservation): Promise<void>;
  updateJobState(jobId: string, state: JobState, now: string): Promise<Job>;
  insertApplication(application: Application): Promise<void>;
  reconcileApplicationRecord(applicationId: string, appliedAt: string, resumeProfileId: string | null, now: string): Promise<Application>;
  updateApplicationStage(applicationId: string, stage: ApplicationStage, now: string): Promise<Application>;
  insertApplicationEvent(event: ApplicationEvent): Promise<void>;
  insertApplicationSubmission(submission: ApplicationSubmission): Promise<void>;
  insertSubmissionIntent(intent: SubmissionIntent): Promise<void>;
  updateSubmissionIntent(intent: SubmissionIntent): Promise<SubmissionIntent>;
  upsertCampaign(campaign: JobSearchCampaign): Promise<JobSearchCampaign>;
  insertDiscoveryRun(run: DiscoveryRun): Promise<void>;
  updateDiscoveryRun(run: DiscoveryRun): Promise<DiscoveryRun>;
  upsertResumeProfiles(profiles: readonly ResumeProfileRef[]): Promise<void>;
  upsertSavedView(savedView: SavedView): Promise<SavedView>;
  deleteSavedView(savedViewId: string): Promise<boolean>;
  putIdempotencyReceipt(receipt: IdempotencyReceipt): Promise<void>;
}

export interface CareerStorePort extends CareerStoreReadPort {
  transaction<T>(work: (tx: CareerStoreTransactionPort) => Promise<T>): Promise<T>;
}
