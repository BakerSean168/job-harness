import type {
  AnalyticsSnapshot,
  AnalyticsSnapshotInput,
  ApplicationDetail,
  CompanyDetail,
  ApplicationWorkspaceDetail,
  BeginDiscoveryInput,
  CareerContextInput,
  CompleteDiscoveryInput,
  DiscoveryRun,
  DuplicateCheckInput,
  DuplicateCheckOutput,
  Job,
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
  CareerContextOutput,
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
  RecordApplicationInput,
  ResumeProfileRef,
  SavedView,
  SearchJobsInput,
  SearchJobsOutput,
  SetJobStateInput,
  TransitionApplicationInput,
  UpsertJobsBatchInput,
  UpsertJobsBatchOutput,
  UpsertCampaignInput,
  UpsertSavedViewInput,
} from '@job-harness/contracts';

export interface CareerJobReadPort {
  searchJobs(input: SearchJobsInput): Promise<SearchJobsOutput>;
  getJob(jobId: string): Promise<Job | null>;
  checkDuplicate(input: DuplicateCheckInput): Promise<DuplicateCheckOutput>;
}

export interface CareerJobCommandPort {
  upsertJobsBatch(input: UpsertJobsBatchInput): Promise<UpsertJobsBatchOutput>;
  setJobState(input: SetJobStateInput): Promise<Job>;
}

export interface CareerApplicationReadPort {
  listApplications(input: ListApplicationsInput): Promise<ListApplicationsOutput>;
  getApplication(applicationId: string): Promise<ApplicationDetail | null>;
}

export interface CareerApplicationCommandPort {
  recordApplication(input: RecordApplicationInput): Promise<ApplicationDetail>;
  transitionApplication(input: TransitionApplicationInput): Promise<ApplicationDetail>;
}

export interface CareerCampaignPort {
  listCampaigns(input?: ListCampaignsInput): Promise<ListCampaignsOutput>;
  getCampaign(campaignId: string): Promise<JobSearchCampaign | null>;
  upsertCampaign(input: UpsertCampaignInput): Promise<JobSearchCampaign>;
}

export interface CareerDiscoveryPort {
  beginDiscoveryRun(input: BeginDiscoveryInput): Promise<DiscoveryRun>;
  completeDiscoveryRun(input: CompleteDiscoveryInput): Promise<DiscoveryRun>;
}

export interface CareerResumeReadPort {
  listResumeProfiles(input?: ListResumesInput): Promise<ListResumesOutput>;
}

export interface CareerSavedViewPort {
  listSavedViews(input?: ListSavedViewsInput): Promise<ListSavedViewsOutput>;
  upsertSavedView(input: UpsertSavedViewInput): Promise<SavedView>;
  deleteSavedView(savedViewId: string): Promise<{ deleted: boolean }>;
}

export interface CareerAnalyticsReadPort {
  getPipelineStats(input: PipelineStatsInput): Promise<PipelineStatsOutput>;
  getCareerContext(input: CareerContextInput): Promise<CareerContextOutput>;
}


export interface CareerWorkspaceReadPort {
  listCompanies(input: ListCompaniesInput): Promise<ListCompaniesOutput>;
  getCompanyDetail(companyId: string, campaignId?: string): Promise<CompanyDetail | null>;
  getAnalyticsSnapshot(input: AnalyticsSnapshotInput): Promise<AnalyticsSnapshot>;
  searchJobListItems(input: SearchJobListItemsInput): Promise<SearchJobListItemsOutput>;
  listApplicationBoard(input: ListApplicationBoardInput): Promise<ListApplicationBoardOutput>;
  getApplicationWorkspaceDetail(applicationId: string): Promise<ApplicationWorkspaceDetail | null>;
  getJobDetail(jobId: string): Promise<JobDetail | null>;
  getDashboardSnapshot(input: DashboardSnapshotInput): Promise<DashboardSnapshot>;
  listDiscoveryRuns(input: ListDiscoveryRunsInput): Promise<ListDiscoveryRunsOutput>;
  getDiscoveryRunDetail(runId: string): Promise<DiscoveryRunDetail | null>;
  listResumeUsage(input?: ListResumeUsageInput): Promise<ListResumeUsageOutput>;
}

export interface CareerApplicationPorts {
  jobs: CareerJobReadPort & CareerJobCommandPort;
  applications: CareerApplicationReadPort & CareerApplicationCommandPort;
  campaigns: CareerCampaignPort;
  discovery: CareerDiscoveryPort;
  resumes: CareerResumeReadPort;
  savedViews: CareerSavedViewPort;
  analytics: CareerAnalyticsReadPort;
  workspace: CareerWorkspaceReadPort;
}

export interface CareerResumeRegistryPort {
  syncResumeProfiles(profiles: readonly ResumeProfileRef[]): Promise<{ synced: number }>;
}

export type CareerRuntimePorts = CareerApplicationPorts & {
  readonly resumeRegistry: CareerResumeRegistryPort;
};
