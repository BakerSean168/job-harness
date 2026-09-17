import type { CareerApplicationPorts } from '@job-harness/application';
import type { ResumeArtifactRuntimePorts, ResumeRuntimePorts } from '@job-harness/resume-application';
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
  PrepareSubmissionIntentInputSchema,
  PrepareSubmissionIntentOutputSchema,
  BeginSubmissionIntentInputSchema,
  BeginSubmissionIntentOutputSchema,
  ConfirmSubmissionIntentInputSchema,
  SubmissionIntentCommitOutputSchema,
  FailSubmissionIntentInputSchema,
  FailSubmissionIntentOutputSchema,
  ReconcileSubmissionIntentInputSchema,
  ReconcileSubmissionIntentOutputSchema,
  ReconcileSubmissionIntentsInputSchema,
  ReconcileSubmissionIntentsOutputSchema,
  ListSubmissionIntentsInputSchema,
  ListSubmissionIntentsOutputSchema,
  GetSubmissionIntentInputSchema,
  GetSubmissionIntentOutputSchema,
} from '@job-harness/contracts';
import {
  CAREER_MCP_TOOL_BY_NAME,
  CAREER_MCP_TOOLS,
  JOB_HARNESS_MCP_TOOL_BY_NAME,
  JOB_HARNESS_MCP_TOOLS,
  ResumeAuthoringContextInputSchema,
  ResumeAuthoringContextOutputSchema,
  ResumeProfileIdInputSchema,
  ResumeProfileOverridesPatchInputSchema,
  ResumeProfileSelectionPatchInputSchema,
} from './tool-contracts';
import {
  ListResumeProfilesInputSchema,
  ListResumeProfilesOutputSchema,
  MaterializeResumeArtifactInputSchema,
  MaterializeResumeArtifactOutputSchema,
  PublishResumeRevisionInputSchema,
  PublishResumeRevisionOutputSchema,
  ResumeProfileContextSchema,
} from '@job-harness/resume-contracts';

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
  constructor(
    private readonly ports: CareerApplicationPorts,
    private readonly resume?: ResumeRuntimePorts,
    private readonly resumeArtifacts?: ResumeArtifactRuntimePorts,
  ) {}

  listTools() {
    return this.resume && this.resumeArtifacts ? JOB_HARNESS_MCP_TOOLS : CAREER_MCP_TOOLS;
  }

  private requireResume(): ResumeRuntimePorts {
    if (!this.resume) throw new Error('Resume MCP capability is not configured');
    return this.resume;
  }

  private requireResumeArtifacts(): ResumeArtifactRuntimePorts {
    if (!this.resumeArtifacts) throw new Error('Resume Artifact MCP capability is not configured');
    return this.resumeArtifacts;
  }

  async invoke(toolName: string, rawInput: unknown): Promise<unknown> {
    const registry = this.resume && this.resumeArtifacts ? JOB_HARNESS_MCP_TOOL_BY_NAME : CAREER_MCP_TOOL_BY_NAME;
    if (!registry.has(toolName)) throw new UnknownCareerMcpToolError(toolName);

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
      case 'career_submission_intents_list':
        return ListSubmissionIntentsOutputSchema.parse(
          await this.ports.submissionIntents.list(ListSubmissionIntentsInputSchema.parse(rawInput)),
        );
      case 'career_submission_intent_get': {
        const input = GetSubmissionIntentInputSchema.parse(rawInput);
        return GetSubmissionIntentOutputSchema.parse(await this.ports.submissionIntents.get(input.intentId));
      }
      case 'career_submission_intent_prepare':
        return PrepareSubmissionIntentOutputSchema.parse(
          await this.ports.submissionIntents.prepare(PrepareSubmissionIntentInputSchema.parse(rawInput)),
        );
      case 'career_submission_intent_begin':
        return BeginSubmissionIntentOutputSchema.parse(
          await this.ports.submissionIntents.begin(BeginSubmissionIntentInputSchema.parse(rawInput)),
        );
      case 'career_submission_intent_confirm':
        return SubmissionIntentCommitOutputSchema.parse(
          await this.ports.submissionIntents.confirm(ConfirmSubmissionIntentInputSchema.parse(rawInput)),
        );
      case 'career_submission_intent_fail':
        return FailSubmissionIntentOutputSchema.parse(
          await this.ports.submissionIntents.fail(FailSubmissionIntentInputSchema.parse(rawInput)),
        );
      case 'career_submission_intent_reconcile':
        return ReconcileSubmissionIntentOutputSchema.parse(
          await this.ports.submissionIntents.reconcile(ReconcileSubmissionIntentInputSchema.parse(rawInput)),
        );
      case 'career_submission_intents_reconcile_pending':
        return ReconcileSubmissionIntentsOutputSchema.parse(
          await this.ports.submissionIntents.reconcilePending(ReconcileSubmissionIntentsInputSchema.parse(rawInput)),
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
      case 'resume_profiles_list':
        return ListResumeProfilesOutputSchema.parse(
          await this.requireResume().listProfiles(ListResumeProfilesInputSchema.parse(rawInput)),
        );
      case 'resume_profile_get': {
        const input = ResumeProfileIdInputSchema.parse(rawInput);
        const context = await this.requireResume().getProfileContext(input.profileId);
        return context ? ResumeProfileContextSchema.parse(context) : null;
      }
      case 'resume_authoring_context_get': {
        const input = ResumeAuthoringContextInputSchema.parse(rawInput);
        const resume = this.requireResume();
        const profileContext = await resume.getProfileContext(input.profileId);
        if (!profileContext) throw new Error(`ResumeProfile '${input.profileId}' was not found`);
        const [job, revisions] = await Promise.all([
          input.jobId ? this.ports.jobs.getJob(input.jobId) : Promise.resolve(null),
          resume.listRevisions(input.profileId),
        ]);
        return ResumeAuthoringContextOutputSchema.parse({ profileContext, job, revisions });
      }
      case 'resume_profile_patch_selection': {
        const input = ResumeProfileSelectionPatchInputSchema.parse(rawInput);
        const resume = this.requireResume();
        const context = await resume.getProfileContext(input.profileId);
        if (!context) throw new Error(`ResumeProfile '${input.profileId}' was not found`);
        if (context.library.version !== input.expectedLibraryVersion) {
          throw new Error(`ResumeLibrary version conflict: expected ${input.expectedLibraryVersion}, actual ${context.library.version}`);
        }
        const next = {
          ...context.profile,
          ...(input.sectionOrder !== undefined ? { sectionOrder: input.sectionOrder } : {}),
          ...(input.educationIds !== undefined ? { educationIds: input.educationIds } : {}),
          ...(input.skillIds !== undefined ? { skillIds: input.skillIds } : {}),
          ...(input.workSelections !== undefined ? { workSelections: input.workSelections } : {}),
          ...(input.projectSelections !== undefined ? { projectSelections: input.projectSelections } : {}),
          ...(input.certificateIds !== undefined ? { certificateIds: input.certificateIds } : {}),
          ...(input.summaryIds !== undefined ? { summaryIds: input.summaryIds } : {}),
        };
        return ResumeProfileContextSchema.parse(await resume.saveProfile({ expectedVersion: input.expectedProfileVersion, profile: next }));
      }
      case 'resume_profile_patch_overrides': {
        const input = ResumeProfileOverridesPatchInputSchema.parse(rawInput);
        const resume = this.requireResume();
        const context = await resume.getProfileContext(input.profileId);
        if (!context) throw new Error(`ResumeProfile '${input.profileId}' was not found`);
        if (context.library.version !== input.expectedLibraryVersion) {
          throw new Error(`ResumeLibrary version conflict: expected ${input.expectedLibraryVersion}, actual ${context.library.version}`);
        }
        return ResumeProfileContextSchema.parse(await resume.saveProfile({
          expectedVersion: input.expectedProfileVersion,
          profile: { ...context.profile, overrides: input.overrides },
        }));
      }
      case 'resume_revision_publish':
        return PublishResumeRevisionOutputSchema.parse(
          await this.requireResume().publishRevision(PublishResumeRevisionInputSchema.parse(rawInput)),
        );
      case 'resume_revision_artifact_materialize':
        return MaterializeResumeArtifactOutputSchema.parse(
          await this.requireResumeArtifacts().materialize(MaterializeResumeArtifactInputSchema.parse(rawInput)),
        );
      default:
        throw new UnknownCareerMcpToolError(toolName);
    }
  }
}

export function createCareerMcpRuntime(ports: CareerApplicationPorts): CareerMcpRuntime {
  return new CareerMcpRuntime(ports);
}

export function createJobHarnessMcpRuntime(ports: CareerApplicationPorts, resume: ResumeRuntimePorts, resumeArtifacts: ResumeArtifactRuntimePorts): CareerMcpRuntime {
  return new CareerMcpRuntime(ports, resume, resumeArtifacts);
}
