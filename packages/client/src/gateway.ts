import type {
  ApplicationDetail,
  ApplicationWorkspaceDetail,
  BeginDiscoveryInput,
  CareerCampaignProgress,
  CompleteDiscoveryInput,
  DiscoveryRun,
  JobSearchCampaign,
  ListApplicationBoardInput,
  ListApplicationBoardOutput,
  RecordApplicationInput,
  SearchJobListItemsInput,
  SearchJobListItemsOutput,
  TransitionApplicationInput,
  UpsertJobsBatchInput,
  UpsertJobsBatchOutput,
} from '@job-harness/contracts';
import type { JobHarnessRestClient } from './rest-client';

/**
 * Narrow host-facing Career capability.
 *
 * A host such as MemoFlow depends on this interface rather than Job Harness
 * persistence, Express routes, MCP internals, or a generic service locator.
 */
export interface CareerGateway {
  getCampaign(campaignId: string): Promise<JobSearchCampaign | null>;
  getCampaignProgress(campaignId: string): Promise<CareerCampaignProgress>;
  searchJobs(input: SearchJobListItemsInput): Promise<SearchJobListItemsOutput>;
  upsertJobs(input: UpsertJobsBatchInput): Promise<UpsertJobsBatchOutput>;
  getApplication(applicationId: string): Promise<ApplicationWorkspaceDetail | null>;
  listApplications(input: ListApplicationBoardInput): Promise<ListApplicationBoardOutput>;
  recordApplication(input: RecordApplicationInput): Promise<ApplicationDetail>;
  transitionApplication(input: TransitionApplicationInput): Promise<ApplicationDetail>;
  requestDiscovery(input: BeginDiscoveryInput): Promise<DiscoveryRun>;
  completeDiscovery(input: CompleteDiscoveryInput): Promise<DiscoveryRun>;
}

/** REST-backed adapter for the canonical host-facing gateway contract. */
export function createCareerGateway(client: JobHarnessRestClient): CareerGateway {
  return {
    getCampaign: (campaignId) => client.campaigns.get(campaignId),
    getCampaignProgress: (campaignId) => client.analytics.getPipelineStats({ campaignId }),
    searchJobs: (input) => client.workspace.searchJobListItems(input),
    upsertJobs: (input) => client.jobs.upsertJobsBatch(input),
    getApplication: (applicationId) => client.workspace.getApplicationWorkspaceDetail(applicationId),
    listApplications: (input) => client.workspace.listApplicationBoard(input),
    recordApplication: (input) => client.applications.record(input),
    transitionApplication: (input) => client.applications.transition(input),
    requestDiscovery: (input) => client.discovery.begin(input),
    completeDiscovery: (input) => client.discovery.complete(input),
  };
}
