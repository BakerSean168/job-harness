import type { CareerApplicationPorts } from '@job-harness/application';
import {
  BeginDiscoveryInputSchema,
  BeginDiscoveryOutputSchema,
  CareerContextInputSchema,
  CareerContextOutputSchema,
  CompleteDiscoveryInputSchema,
  CompleteDiscoveryOutputSchema,
  DuplicateCheckInputSchema,
  DuplicateCheckOutputSchema,
  GetApplicationInputSchema,
  GetApplicationOutputSchema,
  GetCampaignInputSchema,
  GetCampaignOutputSchema,
  GetJobInputSchema,
  GetJobOutputSchema,
  ListApplicationsInputSchema,
  ListApplicationsOutputSchema,
  ListCampaignsInputSchema,
  ListCampaignsOutputSchema,
  ListResumesInputSchema,
  ListResumesOutputSchema,
  PipelineStatsInputSchema,
  PipelineStatsOutputSchema,
  RecordApplicationInputSchema,
  RecordApplicationOutputSchema,
  SearchJobsInputSchema,
  SearchJobsOutputSchema,
  SetJobStateInputSchema,
  SetJobStateOutputSchema,
  TransitionApplicationInputSchema,
  TransitionApplicationOutputSchema,
  UpsertCampaignInputSchema,
  UpsertCampaignOutputSchema,
  UpsertJobsBatchInputSchema,
  UpsertJobsBatchOutputSchema,
} from '@job-harness/contracts';
import { CAREER_MCP_TOOL_BY_NAME, CAREER_MCP_TOOLS } from './tool-contracts';

export class UnknownCareerMcpToolError extends Error {
  constructor(readonly toolName: string) {
    super(`Unknown Job Harness MCP tool: ${toolName}`);
    this.name = 'UnknownCareerMcpToolError';
  }
}

/**
 * Transport-neutral MCP tool runtime.
 *
 * This object deliberately depends only on application ports. An MCP protocol
 * transport (stdio/Streamable HTTP) can register these tools without gaining
 * direct access to persistence or domain internals.
 */
export class CareerMcpRuntime {
  constructor(private readonly ports: CareerApplicationPorts) {}

  listTools() {
    return CAREER_MCP_TOOLS;
  }

  async invoke(toolName: string, rawInput: unknown): Promise<unknown> {
    if (!CAREER_MCP_TOOL_BY_NAME.has(toolName)) throw new UnknownCareerMcpToolError(toolName);

    switch (toolName) {
      case 'career_context_get':
        return CareerContextOutputSchema.parse(
          await this.ports.analytics.getCareerContext(CareerContextInputSchema.parse(rawInput)),
        );
      case 'career_jobs_search':
        return SearchJobsOutputSchema.parse(
          await this.ports.jobs.searchJobs(SearchJobsInputSchema.parse(rawInput)),
        );
      case 'career_job_get': {
        const input = GetJobInputSchema.parse(rawInput);
        return GetJobOutputSchema.parse(await this.ports.jobs.getJob(input.jobId));
      }
      case 'career_job_duplicate_check':
        return DuplicateCheckOutputSchema.parse(
          await this.ports.jobs.checkDuplicate(DuplicateCheckInputSchema.parse(rawInput)),
        );
      case 'career_applications_list':
        return ListApplicationsOutputSchema.parse(
          await this.ports.applications.listApplications(ListApplicationsInputSchema.parse(rawInput)),
        );
      case 'career_application_get': {
        const input = GetApplicationInputSchema.parse(rawInput);
        return GetApplicationOutputSchema.parse(
          await this.ports.applications.getApplication(input.applicationId),
        );
      }
      case 'career_campaigns_list':
        return ListCampaignsOutputSchema.parse(
          await this.ports.campaigns.listCampaigns(ListCampaignsInputSchema.parse(rawInput)),
        );
      case 'career_campaign_get': {
        const input = GetCampaignInputSchema.parse(rawInput);
        return GetCampaignOutputSchema.parse(await this.ports.campaigns.getCampaign(input.campaignId));
      }
      case 'career_resumes_list':
        return ListResumesOutputSchema.parse(
          await this.ports.resumes.listResumeProfiles(ListResumesInputSchema.parse(rawInput)),
        );
      case 'career_pipeline_stats':
        return PipelineStatsOutputSchema.parse(
          await this.ports.analytics.getPipelineStats(PipelineStatsInputSchema.parse(rawInput)),
        );
      case 'career_jobs_upsert_batch':
        return UpsertJobsBatchOutputSchema.parse(
          await this.ports.jobs.upsertJobsBatch(UpsertJobsBatchInputSchema.parse(rawInput)),
        );
      case 'career_job_state_set':
        return SetJobStateOutputSchema.parse(
          await this.ports.jobs.setJobState(SetJobStateInputSchema.parse(rawInput)),
        );
      case 'career_application_record':
        return RecordApplicationOutputSchema.parse(
          await this.ports.applications.recordApplication(RecordApplicationInputSchema.parse(rawInput)),
        );
      case 'career_application_transition':
        return TransitionApplicationOutputSchema.parse(
          await this.ports.applications.transitionApplication(
            TransitionApplicationInputSchema.parse(rawInput),
          ),
        );
      case 'career_discovery_begin':
        return BeginDiscoveryOutputSchema.parse(
          await this.ports.discovery.beginDiscoveryRun(BeginDiscoveryInputSchema.parse(rawInput)),
        );
      case 'career_discovery_complete':
        return CompleteDiscoveryOutputSchema.parse(
          await this.ports.discovery.completeDiscoveryRun(CompleteDiscoveryInputSchema.parse(rawInput)),
        );
      case 'career_campaign_upsert':
        return UpsertCampaignOutputSchema.parse(
          await this.ports.campaigns.upsertCampaign(UpsertCampaignInputSchema.parse(rawInput)),
        );
      default:
        throw new UnknownCareerMcpToolError(toolName);
    }
  }
}

export function createCareerMcpRuntime(ports: CareerApplicationPorts): CareerMcpRuntime {
  return new CareerMcpRuntime(ports);
}
