import type {
  Application,
  ApplicationDetail,
  ApplicationWorkspaceDetail,
  ApplicationEvent,
  Company,
  DiscoveryRun,
  DuplicateCheckInput,
  DuplicateCheckOutput,
  DashboardSnapshot,
  DashboardSnapshotInput,
  DiscoveryRunDetail,
  JobDetail,
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
  ListResumesInput,
  ListResumesOutput,
  PipelineStatsInput,
  PipelineStatsOutput,
  ResumeProfileRef,
  SearchJobsInput,
  SearchJobsOutput,
  UpsertJobCandidate,
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
  findApplicationByJobId(jobId: string): Promise<Application | null>;
  listCampaigns(input: ListCampaignsInput): Promise<ListCampaignsOutput>;
  getCampaign(campaignId: string): Promise<JobSearchCampaign | null>;
  listResumeProfiles(input: ListResumesInput): Promise<ListResumesOutput>;
  getResumeProfile(resumeProfileId: string): Promise<ResumeProfileRef | null>;
  getDiscoveryRun(runId: string): Promise<DiscoveryRun | null>;
  getPipelineStats(input: PipelineStatsInput): Promise<PipelineStatsOutput>;
  searchJobListItems(input: SearchJobListItemsInput): Promise<SearchJobListItemsOutput>;
  listApplicationBoard(input: ListApplicationBoardInput): Promise<ListApplicationBoardOutput>;
  getApplicationWorkspaceDetail(applicationId: string): Promise<ApplicationWorkspaceDetail | null>;
  getJobDetailView(jobId: string): Promise<JobDetail | null>;
  getDashboardSnapshot(input: DashboardSnapshotInput, generatedAt: string): Promise<DashboardSnapshot>;
  getDiscoveryRunDetailView(runId: string): Promise<DiscoveryRunDetail | null>;
  listResumeUsage(input: ListResumeUsageInput): Promise<ListResumeUsageOutput>;
  getIdempotencyReceipt(scope: string, key: string): Promise<IdempotencyReceipt | null>;
}

export interface CareerStoreTransactionPort extends CareerStoreReadPort {
  resolveCompany(name: string, now: string): Promise<Company>;
  insertJob(job: Job): Promise<void>;
  mergeJobCandidate(jobId: string, candidate: UpsertJobCandidate, now: string): Promise<{ job: Job; metadataChanged: boolean; touchedListings: JobListing[] }>;
  insertObservation(observation: JobObservation): Promise<void>;
  updateJobState(jobId: string, state: JobState, now: string): Promise<Job>;
  insertApplication(application: Application): Promise<void>;
  reconcileApplicationRecord(applicationId: string, appliedAt: string, resumeProfileId: string | null, now: string): Promise<Application>;
  updateApplicationStage(applicationId: string, stage: ApplicationStage, now: string): Promise<Application>;
  insertApplicationEvent(event: ApplicationEvent): Promise<void>;
  upsertCampaign(campaign: JobSearchCampaign): Promise<JobSearchCampaign>;
  insertDiscoveryRun(run: DiscoveryRun): Promise<void>;
  updateDiscoveryRun(run: DiscoveryRun): Promise<DiscoveryRun>;
  upsertResumeProfiles(profiles: readonly ResumeProfileRef[]): Promise<void>;
  putIdempotencyReceipt(receipt: IdempotencyReceipt): Promise<void>;
}

export interface CareerStorePort extends CareerStoreReadPort {
  transaction<T>(work: (tx: CareerStoreTransactionPort) => Promise<T>): Promise<T>;
}
