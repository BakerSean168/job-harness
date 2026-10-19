import { z } from 'zod';
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
  VerifyExistingJobListingInputSchema,
  VerifyExistingJobListingOutputSchema,
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
  RecommendJobResumesOutputSchema,
  PrepareRecommendedSubmissionIntentOutputSchema,
  type PrepareRecommendedSubmissionIntentInput,
  type RecommendJobResumesOutput,
  type PrepareRecommendedSubmissionIntentOutput,
  EmailApplicationPackageDetailSchema,
  ConfirmEmailApplicationSendOutputSchema,
  BeginSubmissionIntentOutputSchema as EmailBeginSubmissionIntentOutputSchema,
  type PrepareEmailApplicationInput,
  type EmailApplicationPackageDetail,
  type BeginEmailApplicationSendInput,
  type ConfirmEmailApplicationSendInput,
  type ConfirmEmailApplicationSendOutput,
  type FailEmailApplicationSendInput,
  type AuthorizeEmailApplicationSendInput,
  type EmailSendAuthorization,
  EmailSendAuthorizationSchema,
  type SubmissionIntent,
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
  JobResumeRecommendToolInputSchema,
  JobResumePrepareToolInputSchema,
  EmailApplicationPrepareToolInputSchema,
  EmailApplicationGetToolInputSchema,
  EmailApplicationBeginToolInputSchema,
  EmailApplicationConfirmToolInputSchema,
  EmailApplicationFailToolInputSchema,
  EmailApplicationAuthorizeSendToolInputSchema,
  BossGreetingsPendingToolInputSchema,
  BossGreetingsPendingToolOutputSchema,
  BossGreetingResolverReadyToolInputSchema,
  BossGreetingResolverReadyToolOutputSchema,
  BossGreetingClaimToolInputSchema,
  BossGreetingClaimToolOutputSchema,
  BossGreetingResolveToolInputSchema,
  BossGreetingResolveToolOutputSchema,
  BossRuntimeStatusToolInputSchema,
  BossRuntimeStatusToolOutputSchema,
  BossRuntimeStartToolInputSchema,
  BossRuntimeStartToolOutputSchema,
  BossRuntimePauseToolInputSchema,
  BossRuntimePauseToolOutputSchema,
  RecruitmentCollectionRuntimeStatusToolInputSchema,
  RecruitmentCollectionRuntimeStatusToolOutputSchema,
  RecruitmentCollectionRuntimeStartToolInputSchema,
  RecruitmentCollectionRuntimeActionToolOutputSchema,
  RecruitmentCollectionRuntimeStopToolInputSchema,
  RecruitmentCollectionRuntimeSyncToolInputSchema,
  RecruitmentCollectionRuntimeSyncToolOutputSchema,
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

export interface JobResumeMcpPort {
  recommend(jobId: string): Promise<RecommendJobResumesOutput>;
  prepare(jobId: string, input: PrepareRecommendedSubmissionIntentInput): Promise<PrepareRecommendedSubmissionIntentOutput>;
}

export interface EmailApplicationMcpPort {
  prepare(jobId: string, input: PrepareEmailApplicationInput): Promise<EmailApplicationPackageDetail>;
  get(packageId: string): Promise<EmailApplicationPackageDetail>;
  beginSend(packageId: string, input: BeginEmailApplicationSendInput): Promise<SubmissionIntent>;
  confirm(packageId: string, input: ConfirmEmailApplicationSendInput): Promise<ConfirmEmailApplicationSendOutput>;
  fail(packageId: string, input: FailEmailApplicationSendInput): Promise<EmailApplicationPackageDetail>;
  authorizeSend(packageId: string, input: AuthorizeEmailApplicationSendInput): Promise<EmailSendAuthorization>;
}

export interface BossGreetingMcpPort {
  listPending(input: z.input<typeof BossGreetingsPendingToolInputSchema>): Promise<z.output<typeof BossGreetingsPendingToolOutputSchema>>;
  ready(input: z.input<typeof BossGreetingResolverReadyToolInputSchema>): Promise<z.output<typeof BossGreetingResolverReadyToolOutputSchema>>;
  claim(input: z.input<typeof BossGreetingClaimToolInputSchema>): Promise<z.output<typeof BossGreetingClaimToolOutputSchema>>;
  resolve(input: z.input<typeof BossGreetingResolveToolInputSchema>): Promise<z.output<typeof BossGreetingResolveToolOutputSchema>>;
}

export interface BossRuntimeMcpPort {
  status(input: z.input<typeof BossRuntimeStatusToolInputSchema>): Promise<z.output<typeof BossRuntimeStatusToolOutputSchema>>;
  start(input: z.input<typeof BossRuntimeStartToolInputSchema>): Promise<z.output<typeof BossRuntimeStartToolOutputSchema>>;
  pause(input: z.input<typeof BossRuntimePauseToolInputSchema>): Promise<z.output<typeof BossRuntimePauseToolOutputSchema>>;
}

export interface RecruitmentCollectionRuntimeMcpPort {
  status(input: z.input<typeof RecruitmentCollectionRuntimeStatusToolInputSchema>): Promise<z.output<typeof RecruitmentCollectionRuntimeStatusToolOutputSchema>>;
  start(input: z.input<typeof RecruitmentCollectionRuntimeStartToolInputSchema>): Promise<z.output<typeof RecruitmentCollectionRuntimeActionToolOutputSchema>>;
  stop(input: z.input<typeof RecruitmentCollectionRuntimeStopToolInputSchema>): Promise<z.output<typeof RecruitmentCollectionRuntimeActionToolOutputSchema>>;
  sync(input: z.input<typeof RecruitmentCollectionRuntimeSyncToolInputSchema>): Promise<z.output<typeof RecruitmentCollectionRuntimeSyncToolOutputSchema>>;
}

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
    private readonly jobResume?: JobResumeMcpPort,
    private readonly emailApplication?: EmailApplicationMcpPort,
    private readonly bossGreeting?: BossGreetingMcpPort,
    private readonly bossRuntime?: BossRuntimeMcpPort,
    private readonly recruitmentCollectionRuntime?: RecruitmentCollectionRuntimeMcpPort,
  ) {}

  listTools() {
    if (!this.resume || !this.resumeArtifacts) return CAREER_MCP_TOOLS;
    return JOB_HARNESS_MCP_TOOLS.filter((tool) => {
      if (!this.jobResume && (tool.name === 'career_job_resume_recommend' || tool.name === 'career_submission_intent_prepare_recommended')) return false;
      if (!this.emailApplication && tool.name.startsWith('career_email_application_')) return false;
      if (!this.bossGreeting && tool.name.startsWith('boss_greeting')) return false;
      if (!this.bossRuntime && tool.name.startsWith('boss_runtime_')) return false;
      if (!this.recruitmentCollectionRuntime && tool.name.startsWith('recruitment_collection_runtime_')) return false;
      return true;
    });
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
    const registry = new Map(this.listTools().map((entry) => [entry.name, entry]));
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
      case 'career_job_listing_verify':
        return VerifyExistingJobListingOutputSchema.parse(
          await this.ports.jobs.verifyExistingListing(VerifyExistingJobListingInputSchema.parse(rawInput)),
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
      case 'career_job_resume_recommend': {
        if (!this.jobResume) throw new Error('Job/Resume recommendation capability is not configured');
        const input = JobResumeRecommendToolInputSchema.parse(rawInput);
        return RecommendJobResumesOutputSchema.parse(await this.jobResume.recommend(input.jobId));
      }
      case 'career_submission_intent_prepare_recommended': {
        if (!this.jobResume) throw new Error('Job/Resume recommendation capability is not configured');
        const input = JobResumePrepareToolInputSchema.parse(rawInput);
        const { jobId, ...prepareInput } = input;
        return PrepareRecommendedSubmissionIntentOutputSchema.parse(await this.jobResume.prepare(jobId, prepareInput));
      }
      case 'career_email_application_prepare': {
        if (!this.emailApplication) throw new Error('Email application capability is not configured');
        const input = EmailApplicationPrepareToolInputSchema.parse(rawInput);
        const { jobId, ...prepareInput } = input;
        return EmailApplicationPackageDetailSchema.parse(await this.emailApplication.prepare(jobId, prepareInput));
      }
      case 'career_email_application_get': {
        if (!this.emailApplication) throw new Error('Email application capability is not configured');
        const input = EmailApplicationGetToolInputSchema.parse(rawInput);
        return EmailApplicationPackageDetailSchema.parse(await this.emailApplication.get(input.packageId));
      }
      case 'career_email_application_authorize_send': {
        if (!this.emailApplication) throw new Error('Email application capability is not configured');
        const input = EmailApplicationAuthorizeSendToolInputSchema.parse(rawInput);
        const { packageId, ...authorizationInput } = input;
        return EmailSendAuthorizationSchema.parse(await this.emailApplication.authorizeSend(packageId, authorizationInput));
      }
      case 'career_email_application_begin_send': {
        if (!this.emailApplication) throw new Error('Email application capability is not configured');
        const input = EmailApplicationBeginToolInputSchema.parse(rawInput);
        const { packageId, ...beginInput } = input;
        return EmailBeginSubmissionIntentOutputSchema.parse(await this.emailApplication.beginSend(packageId, beginInput));
      }
      case 'career_email_application_confirm': {
        if (!this.emailApplication) throw new Error('Email application capability is not configured');
        const input = EmailApplicationConfirmToolInputSchema.parse(rawInput);
        const { packageId, ...confirmInput } = input;
        return ConfirmEmailApplicationSendOutputSchema.parse(await this.emailApplication.confirm(packageId, confirmInput));
      }
      case 'career_email_application_fail': {
        if (!this.emailApplication) throw new Error('Email application capability is not configured');
        const input = EmailApplicationFailToolInputSchema.parse(rawInput);
        const { packageId, ...failInput } = input;
        return EmailApplicationPackageDetailSchema.parse(await this.emailApplication.fail(packageId, failInput));
      }
      case 'boss_greetings_pending': {
        if (!this.bossGreeting) throw new Error('BOSS greeting capability is not configured');
        const input = BossGreetingsPendingToolInputSchema.parse(rawInput);
        return BossGreetingsPendingToolOutputSchema.parse(await this.bossGreeting.listPending(input));
      }
      case 'boss_greeting_resolver_ready': {
        if (!this.bossGreeting) throw new Error('BOSS greeting capability is not configured');
        const input = BossGreetingResolverReadyToolInputSchema.parse(rawInput);
        return BossGreetingResolverReadyToolOutputSchema.parse(await this.bossGreeting.ready(input));
      }
      case 'boss_greeting_claim': {
        if (!this.bossGreeting) throw new Error('BOSS greeting capability is not configured');
        const input = BossGreetingClaimToolInputSchema.parse(rawInput);
        return BossGreetingClaimToolOutputSchema.parse(await this.bossGreeting.claim(input));
      }
      case 'boss_greeting_resolve': {
        if (!this.bossGreeting) throw new Error('BOSS greeting capability is not configured');
        const input = BossGreetingResolveToolInputSchema.parse(rawInput);
        return BossGreetingResolveToolOutputSchema.parse(await this.bossGreeting.resolve(input));
      }
      case 'boss_runtime_status': {
        if (!this.bossRuntime) throw new Error('BOSS Site Runtime capability is not configured');
        const input = BossRuntimeStatusToolInputSchema.parse(rawInput);
        return BossRuntimeStatusToolOutputSchema.parse(await this.bossRuntime.status(input));
      }
      case 'boss_runtime_start': {
        if (!this.bossRuntime) throw new Error('BOSS Site Runtime capability is not configured');
        const input = BossRuntimeStartToolInputSchema.parse(rawInput);
        return BossRuntimeStartToolOutputSchema.parse(await this.bossRuntime.start(input));
      }
      case 'boss_runtime_pause': {
        if (!this.bossRuntime) throw new Error('BOSS Site Runtime capability is not configured');
        const input = BossRuntimePauseToolInputSchema.parse(rawInput);
        return BossRuntimePauseToolOutputSchema.parse(await this.bossRuntime.pause(input));
      }
      case 'recruitment_collection_runtime_status': {
        if (!this.recruitmentCollectionRuntime) throw new Error('Recruitment Collection Runtime capability is not configured');
        const input = RecruitmentCollectionRuntimeStatusToolInputSchema.parse(rawInput);
        return RecruitmentCollectionRuntimeStatusToolOutputSchema.parse(await this.recruitmentCollectionRuntime.status(input));
      }
      case 'recruitment_collection_runtime_start': {
        if (!this.recruitmentCollectionRuntime) throw new Error('Recruitment Collection Runtime capability is not configured');
        const input = RecruitmentCollectionRuntimeStartToolInputSchema.parse(rawInput);
        return RecruitmentCollectionRuntimeActionToolOutputSchema.parse(await this.recruitmentCollectionRuntime.start(input));
      }
      case 'recruitment_collection_runtime_stop': {
        if (!this.recruitmentCollectionRuntime) throw new Error('Recruitment Collection Runtime capability is not configured');
        const input = RecruitmentCollectionRuntimeStopToolInputSchema.parse(rawInput);
        return RecruitmentCollectionRuntimeActionToolOutputSchema.parse(await this.recruitmentCollectionRuntime.stop(input));
      }
      case 'recruitment_collection_runtime_sync': {
        if (!this.recruitmentCollectionRuntime) throw new Error('Recruitment Collection Runtime capability is not configured');
        const input = RecruitmentCollectionRuntimeSyncToolInputSchema.parse(rawInput);
        return RecruitmentCollectionRuntimeSyncToolOutputSchema.parse(await this.recruitmentCollectionRuntime.sync(input));
      }
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

export function createJobHarnessMcpRuntime(ports: CareerApplicationPorts, resume: ResumeRuntimePorts, resumeArtifacts: ResumeArtifactRuntimePorts, jobResume?: JobResumeMcpPort, emailApplication?: EmailApplicationMcpPort, bossGreeting?: BossGreetingMcpPort, bossRuntime?: BossRuntimeMcpPort, recruitmentCollectionRuntime?: RecruitmentCollectionRuntimeMcpPort): CareerMcpRuntime {
  return new CareerMcpRuntime(ports, resume, resumeArtifacts, jobResume, emailApplication, bossGreeting, bossRuntime, recruitmentCollectionRuntime);
}
