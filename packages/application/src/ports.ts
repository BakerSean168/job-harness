import type {
  ApplicationDetail,
  BeginDiscoveryInput,
  CareerContextInput,
  CompleteDiscoveryInput,
  DiscoveryRun,
  DuplicateCheckInput,
  DuplicateCheckOutput,
  Job,
  JobSearchCampaign,
  ListApplicationsInput,
  ListApplicationsOutput,
  ListCampaignsInput,
  ListCampaignsOutput,
  ListResumesInput,
  ListResumesOutput,
  PipelineStatsInput,
  PipelineStatsOutput,
  CareerContextOutput,
  RecordApplicationInput,
  ResumeProfileRef,
  SearchJobsInput,
  SearchJobsOutput,
  SetJobStateInput,
  TransitionApplicationInput,
  UpsertJobsBatchInput,
  UpsertJobsBatchOutput,
  UpsertCampaignInput,
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

export interface CareerAnalyticsReadPort {
  getPipelineStats(input: PipelineStatsInput): Promise<PipelineStatsOutput>;
  getCareerContext(input: CareerContextInput): Promise<CareerContextOutput>;
}

export interface CareerApplicationPorts {
  jobs: CareerJobReadPort & CareerJobCommandPort;
  applications: CareerApplicationReadPort & CareerApplicationCommandPort;
  campaigns: CareerCampaignPort;
  discovery: CareerDiscoveryPort;
  resumes: CareerResumeReadPort;
  analytics: CareerAnalyticsReadPort;
}

export interface CareerResumeRegistryPort {
  syncResumeProfiles(profiles: readonly ResumeProfileRef[]): Promise<{ synced: number }>;
}

export type CareerRuntimePorts = CareerApplicationPorts & {
  readonly resumeRegistry: CareerResumeRegistryPort;
};
