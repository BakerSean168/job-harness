import { z } from 'zod';
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
  RecommendJobResumesOutputSchema,
  PrepareRecommendedSubmissionIntentInputSchema,
  PrepareRecommendedSubmissionIntentOutputSchema,
  PrepareEmailApplicationInputSchema,
  EmailApplicationPackageDetailSchema,
  BeginEmailApplicationSendInputSchema,
  BeginSubmissionIntentOutputSchema as EmailBeginSubmissionIntentOutputSchema,
  ConfirmEmailApplicationSendInputSchema,
  ConfirmEmailApplicationSendOutputSchema,
  FailEmailApplicationSendInputSchema,
  AuthorizeEmailApplicationSendInputSchema,
  EmailSendAuthorizationSchema,
} from '@job-harness/contracts';
import {
  ListResumeProfilesInputSchema,
  ListResumeProfilesOutputSchema,
  ListResumeRevisionsOutputSchema,
  MaterializeResumeArtifactInputSchema,
  MaterializeResumeArtifactOutputSchema,
  PublishResumeRevisionInputSchema,
  PublishResumeRevisionOutputSchema,
  ResumeEntityIdSchema,
  ResumeProfileContextSchema,
  ResumeProfileOverrideSchema,
  ResumeProjectSelectionSchema,
  ResumeSectionSchema,
  ResumeWorkSelectionSchema,
} from '@job-harness/resume-contracts';
import {
  RecruitmentRuntimeControlSnapshotSchema,
  RecruitmentRuntimeDescriptorSchema,
  RecruitmentRuntimeEventSchema,
  RecruitmentRuntimeHealthSchema,
} from '@job-harness/recruitment-runtime-contracts';

export interface CareerMcpToolContract {
  readonly name: string;
  readonly description: string;
  readonly mutability: 'read' | 'state-write';
  /** True only when invoking the tool can deliberately trigger a bounded external action. */
  readonly externalSideEffect: boolean;
  /** Whether replaying the exact same tool call is expected to be safe. */
  readonly idempotent?: boolean;
  readonly inputSchema: z.ZodType;
  readonly outputSchema: z.ZodType;
}

function tool(contract: CareerMcpToolContract): CareerMcpToolContract {
  return Object.freeze(contract);
}

export const JobResumeRecommendToolInputSchema = z.object({ jobId: z.string().trim().min(1).max(200) }).strict();
export const JobResumePrepareToolInputSchema = PrepareRecommendedSubmissionIntentInputSchema.extend({ jobId: z.string().trim().min(1).max(200) });
export const EmailApplicationPrepareToolInputSchema = PrepareEmailApplicationInputSchema.extend({ jobId: z.string().trim().min(1).max(200) });
export const EmailApplicationGetToolInputSchema = z.object({ packageId: z.string().trim().min(1).max(200) }).strict();
export const EmailApplicationBeginToolInputSchema = BeginEmailApplicationSendInputSchema.extend({ packageId: z.string().trim().min(1).max(200) });
export const EmailApplicationConfirmToolInputSchema = ConfirmEmailApplicationSendInputSchema.extend({ packageId: z.string().trim().min(1).max(200) });
export const EmailApplicationFailToolInputSchema = FailEmailApplicationSendInputSchema.extend({ packageId: z.string().trim().min(1).max(200) });
export const EmailApplicationAuthorizeSendToolInputSchema = AuthorizeEmailApplicationSendInputSchema.extend({ packageId: z.string().trim().min(1).max(200) });

const BossGreetingJobSchema = z.object({
  title: z.string().trim().min(1).max(240),
  salary: z.string().trim().max(120),
  description: z.string().trim().min(1).max(50_000),
  company: z.string().trim().max(300).nullable(),
  city: z.string().trim().max(200).nullable(),
  jobUrl: z.url().nullable(),
  externalId: z.string().trim().max(300).nullable(),
  screeningSessionId: z.string().trim().max(200).nullable(),
}).strict();
const BossGreetingMatchSchema = z.object({
  score: z.number().finite().min(0).max(100),
  profileId: z.string().trim().min(1).max(200),
  profileLabel: z.string().trim().min(1).max(300),
  resumeIndex: z.number().int().nonnegative(),
  decision: z.enum(['strong-match', 'review', 'low-match']),
  signals: z.array(z.string().trim().min(1).max(120)),
}).strict();
export const BossGreetingRequestSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  requestedProfileId: z.string().trim().min(1).max(200),
  job: BossGreetingJobSchema,
  match: BossGreetingMatchSchema,
  candidate: z.record(z.string(), z.unknown()),
  guidance: z.array(z.string().trim().min(1).max(1000)),
}).strict();
export const BossGreetingsPendingToolInputSchema = z.object({
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
export const BossGreetingsPendingToolOutputSchema = z.object({
  mode: z.literal('chatgpt-assisted'),
  total: z.number().int().nonnegative(),
  items: z.array(BossGreetingRequestSchema),
}).strict();
const BossGreetingResolveSendSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('send'),
  message: z.string().trim().min(12).max(320),
}).strict();
const BossGreetingResolveSkipSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('skip'),
  reason: z.string().trim().min(3).max(240),
}).strict();
export const BossGreetingResolveToolInputSchema = z.discriminatedUnion('action', [BossGreetingResolveSendSchema, BossGreetingResolveSkipSchema]);
export const BossGreetingResolveToolOutputSchema = z.object({
  ok: z.literal(true),
  id: z.string().uuid(),
  action: z.enum(['send', 'skip']),
  source: z.enum(['chatgpt-web-mcp', 'job-harness-policy']),
  reason: z.string().trim().min(1).max(240).nullable().optional(),
}).strict();

export const BossRuntimeStatusToolInputSchema = z.object({
  eventsLimit: z.number().int().min(1).max(100).default(20),
}).strict();
export const BossRuntimeStatusToolOutputSchema = z.object({
  descriptor: RecruitmentRuntimeDescriptorSchema,
  health: RecruitmentRuntimeHealthSchema,
  control: RecruitmentRuntimeControlSnapshotSchema,
  events: z.array(RecruitmentRuntimeEventSchema),
}).strict();
export const BossRuntimeStartToolInputSchema = z.object({
  mode: z.enum(['automatic', 'manual']).default('automatic'),
  idempotencyKey: z.string().trim().min(1).max(300),
}).strict();
export const BossRuntimeStartToolOutputSchema = RecruitmentRuntimeControlSnapshotSchema;
export const BossRuntimePauseToolInputSchema = z.object({
  taskId: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3).max(500).default('operator-pause'),
}).strict();
export const BossRuntimePauseToolOutputSchema = RecruitmentRuntimeControlSnapshotSchema;

export const RecruitmentCollectionRuntimeSiteSchema = z.enum(['zhilian', 'liepin', 'job51']);
export const RecruitmentCollectionRuntimeStatusToolInputSchema = z.object({
  site: RecruitmentCollectionRuntimeSiteSchema,
}).strict();
export const RecruitmentCollectionRuntimeStatusToolOutputSchema = z.object({
  descriptor: RecruitmentRuntimeDescriptorSchema,
  health: RecruitmentRuntimeHealthSchema,
  integration: z.literal('job-harness'),
  collectOnly: z.literal(true),
  mode: z.literal('collect-only'),
}).strict();
export const RecruitmentCollectionRuntimeStartToolInputSchema = z.object({
  site: RecruitmentCollectionRuntimeSiteSchema,
  campaignId: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(200).optional(),
}).strict();
export const RecruitmentCollectionRuntimeActionToolOutputSchema = z.object({
  site: RecruitmentCollectionRuntimeSiteSchema,
  success: z.boolean(),
  message: z.string().trim().min(1).max(1000),
  status: z.string().trim().max(200).nullable(),
  reused: z.boolean().default(false),
  campaignId: z.string().trim().min(1).max(200).nullable().default(null),
  city: z.string().trim().min(1).max(200).nullable().default(null),
  keywords: z.array(z.string().trim().min(1).max(200)).default([]),
}).strict();
export const RecruitmentCollectionRuntimeStopToolInputSchema = z.object({
  site: RecruitmentCollectionRuntimeSiteSchema,
}).strict();
export const RecruitmentCollectionRuntimeSyncToolInputSchema = z.object({
  site: RecruitmentCollectionRuntimeSiteSchema,
  discoveryRunId: z.string().trim().min(1).max(200).optional(),
  pageSize: z.number().int().min(1).max(1000).default(100),
  maxPages: z.number().int().min(1).max(100).default(20),
}).strict();
export const RecruitmentCollectionRuntimeSyncToolOutputSchema = z.object({
  site: RecruitmentCollectionRuntimeSiteSchema,
  upstreamTotal: z.number().int().nonnegative(),
  scanned: z.number().int().nonnegative(),
  normalized: z.number().int().nonnegative(),
  normalizationRejected: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  persistenceRejected: z.number().int().nonnegative(),
}).strict();

export const CAREER_MCP_TOOLS = [
  tool({ name: 'career_context_get', description: 'Read the compact job-search context an AI should load before discovery or application work.', mutability: 'read', externalSideEffect: false, inputSchema: CareerContextInputSchema, outputSchema: CareerContextOutputSchema }),
  tool({ name: 'career_jobs_search', description: 'Search durable known jobs with filters; this does not search the public web.', mutability: 'read', externalSideEffect: false, inputSchema: SearchJobsInputSchema, outputSchema: SearchJobsOutputSchema }),
  tool({ name: 'career_job_get', description: 'Read one durable job record by Job Harness id.', mutability: 'read', externalSideEffect: false, inputSchema: GetJobInputSchema, outputSchema: GetJobOutputSchema }),
  tool({ name: 'career_job_duplicate_check', description: 'Check whether a candidate job is already known using canonical Job Harness identity rules.', mutability: 'read', externalSideEffect: false, inputSchema: DuplicateCheckInputSchema, outputSchema: DuplicateCheckOutputSchema }),
  tool({ name: 'career_applications_list', description: 'List recorded applications and current pipeline stages.', mutability: 'read', externalSideEffect: false, inputSchema: ListApplicationsInputSchema, outputSchema: ListApplicationsOutputSchema }),
  tool({ name: 'career_application_get', description: 'Read one application and its auditable event timeline.', mutability: 'read', externalSideEffect: false, inputSchema: GetApplicationInputSchema, outputSchema: GetApplicationOutputSchema }),
  tool({ name: 'career_campaigns_list', description: 'List job-search campaigns.', mutability: 'read', externalSideEffect: false, inputSchema: ListCampaignsInputSchema, outputSchema: ListCampaignsOutputSchema }),
  tool({ name: 'career_campaign_get', description: 'Read one job-search campaign.', mutability: 'read', externalSideEffect: false, inputSchema: GetCampaignInputSchema, outputSchema: GetCampaignOutputSchema }),
  tool({ name: 'career_resumes_list', description: 'List registered resume profile references and artifacts.', mutability: 'read', externalSideEffect: false, inputSchema: ListResumesInputSchema, outputSchema: ListResumesOutputSchema }),
  tool({ name: 'career_pipeline_stats', description: 'Read aggregate job and application pipeline counts.', mutability: 'read', externalSideEffect: false, inputSchema: PipelineStatsInputSchema, outputSchema: PipelineStatsOutputSchema }),
  tool({ name: 'career_jobs_upsert_batch', description: 'Store discovered job candidates idempotently; does not submit applications.', mutability: 'state-write', externalSideEffect: false, inputSchema: UpsertJobsBatchInputSchema, outputSchema: UpsertJobsBatchOutputSchema }),
  tool({ name: 'career_job_state_set', description: 'Change Job Harness triage state for one job.', mutability: 'state-write', externalSideEffect: false, inputSchema: SetJobStateInputSchema, outputSchema: SetJobStateOutputSchema }),
  tool({ name: 'career_application_record', description: 'Record an application submission. Creates the Job pipeline on first submission and appends another auditable submission event on later channels; does not submit externally.', mutability: 'state-write', externalSideEffect: false, inputSchema: RecordApplicationInputSchema, outputSchema: RecordApplicationOutputSchema }),
  tool({ name: 'career_application_transition', description: 'Append an application pipeline transition and update its current-stage projection.', mutability: 'state-write', externalSideEffect: false, inputSchema: TransitionApplicationInputSchema, outputSchema: TransitionApplicationOutputSchema }),
  tool({ name: 'career_submission_intents_list', description: 'List durable external-submission intents that may require recovery or reconciliation.', mutability: 'read', externalSideEffect: false, inputSchema: ListSubmissionIntentsInputSchema, outputSchema: ListSubmissionIntentsOutputSchema }),
  tool({ name: 'career_submission_intent_get', description: 'Read one durable external-submission intent by id.', mutability: 'read', externalSideEffect: false, inputSchema: GetSubmissionIntentInputSchema, outputSchema: GetSubmissionIntentOutputSchema }),
  tool({ name: 'career_submission_intent_prepare', description: 'Persist a submission intent before any external recruiting-site side effect begins.', mutability: 'state-write', externalSideEffect: false, inputSchema: PrepareSubmissionIntentInputSchema, outputSchema: PrepareSubmissionIntentOutputSchema }),
  tool({ name: 'career_submission_intent_begin', description: 'Mark a prepared intent as external submission in progress before the browser performs the side effect.', mutability: 'state-write', externalSideEffect: false, inputSchema: BeginSubmissionIntentInputSchema, outputSchema: BeginSubmissionIntentOutputSchema }),
  tool({ name: 'career_submission_intent_confirm', description: 'Persist external-success evidence, then reconcile the intent into an idempotent ApplicationSubmission record.', mutability: 'state-write', externalSideEffect: false, inputSchema: ConfirmSubmissionIntentInputSchema, outputSchema: SubmissionIntentCommitOutputSchema }),
  tool({ name: 'career_submission_intent_fail', description: 'Persist external failure or manual-review evidence for a submission intent.', mutability: 'state-write', externalSideEffect: false, inputSchema: FailSubmissionIntentInputSchema, outputSchema: FailSubmissionIntentOutputSchema }),
  tool({ name: 'career_submission_intent_reconcile', description: 'Retry local persistence for an externally confirmed submission intent; performs no recruiting-site action.', mutability: 'state-write', externalSideEffect: false, inputSchema: ReconcileSubmissionIntentInputSchema, outputSchema: ReconcileSubmissionIntentOutputSchema }),
  tool({ name: 'career_submission_intents_reconcile_pending', idempotent: false, description: 'Run a bounded recovery sweep over confirmed/pending intents and flag stale in-progress work for manual review; performs no recruiting-site action.', mutability: 'state-write', externalSideEffect: false, inputSchema: ReconcileSubmissionIntentsInputSchema, outputSchema: ReconcileSubmissionIntentsOutputSchema }),
  tool({ name: 'career_discovery_begin', description: 'Open an auditable discovery run owned by an external search executor.', mutability: 'state-write', externalSideEffect: false, inputSchema: BeginDiscoveryInputSchema, outputSchema: BeginDiscoveryOutputSchema }),
  tool({ name: 'career_discovery_complete', description: 'Complete an auditable discovery run with terminal status, result counts, and bounded failure evidence for failed/aborted executions.', mutability: 'state-write', externalSideEffect: false, inputSchema: CompleteDiscoveryInputSchema, outputSchema: CompleteDiscoveryOutputSchema }),
  tool({ name: 'career_campaign_upsert', description: 'Create or update a Job Harness search campaign.', mutability: 'state-write', externalSideEffect: false, inputSchema: UpsertCampaignInputSchema, outputSchema: UpsertCampaignOutputSchema }),
] as const satisfies readonly CareerMcpToolContract[];

export const CAREER_MCP_TOOL_BY_NAME = new Map(CAREER_MCP_TOOLS.map((entry) => [entry.name, entry]));

export const JOB_RESUME_MCP_TOOLS = [
  tool({ name: 'career_job_resume_recommend', description: 'Rank active Resume Profiles for a known job using deterministic explainable matching; performs no application side effect.', mutability: 'read', externalSideEffect: false, inputSchema: JobResumeRecommendToolInputSchema, outputSchema: RecommendJobResumesOutputSchema }),
  tool({ name: 'career_submission_intent_prepare_recommended', description: 'Choose or honor a Resume Profile for a job, freeze its latest Revision/PDF Artifact, and create a durable SubmissionIntent. Does not interact with the recruiting site.', mutability: 'state-write', externalSideEffect: false, inputSchema: JobResumePrepareToolInputSchema, outputSchema: PrepareRecommendedSubmissionIntentOutputSchema }),
] as const satisfies readonly CareerMcpToolContract[];

export const BOSS_GREETING_MCP_TOOLS = [
  tool({ name: 'boss_greetings_pending', description: 'Read BOSS greeting requests currently waiting for ChatGPT to inspect the JD and true Resume context. This tool sends nothing.', mutability: 'read', externalSideEffect: false, inputSchema: BossGreetingsPendingToolInputSchema, outputSchema: BossGreetingsPendingToolOutputSchema }),
  tool({ name: 'boss_greeting_resolve', idempotent: false, description: 'Resolve one waiting BOSS greeting request. action=send releases the already-waiting Compatibility Runtime to send exactly the supplied greeting externally; action=skip releases it without sending.', mutability: 'state-write', externalSideEffect: true, inputSchema: BossGreetingResolveToolInputSchema, outputSchema: BossGreetingResolveToolOutputSchema }),
] as const satisfies readonly CareerMcpToolContract[];

export const BOSS_RUNTIME_MCP_TOOLS = [
  tool({ name: 'boss_runtime_status', description: 'Read the coarse-grained BOSS Site Runtime descriptor, browser/runtime health, active control task and recent normalized Runtime events. This performs no browser action.', mutability: 'read', externalSideEffect: false, inputSchema: BossRuntimeStatusToolInputSchema, outputSchema: BossRuntimeStatusToolOutputSchema }),
  tool({ name: 'boss_runtime_start', idempotent: true, description: 'Start or reuse one coarse BOSS Site Runtime campaign task. The bridge derives greeting/inbox/resume-followup permissions and the external-effect budget from the active Campaign; automatic mode additionally requires Campaign autoStartEnabled. This can cause recruiter-facing effects.', mutability: 'state-write', externalSideEffect: true, inputSchema: BossRuntimeStartToolInputSchema, outputSchema: BossRuntimeStartToolOutputSchema }),
  tool({ name: 'boss_runtime_pause', idempotent: true, description: 'Pause the active coarse BOSS Site Runtime task. This stops future Runtime work but does not undo completed external effects.', mutability: 'state-write', externalSideEffect: false, inputSchema: BossRuntimePauseToolInputSchema, outputSchema: BossRuntimePauseToolOutputSchema }),
] as const satisfies readonly CareerMcpToolContract[];

export const RECRUITMENT_COLLECTION_RUNTIME_MCP_TOOLS = [
  tool({ name: 'recruitment_collection_runtime_status', description: 'Read one upstream-derived collect-only recruitment Site Runtime health/identity. This sends nothing and does not start browser work.', mutability: 'read', externalSideEffect: false, inputSchema: RecruitmentCollectionRuntimeStatusToolInputSchema, outputSchema: RecruitmentCollectionRuntimeStatusToolOutputSchema }),
  tool({ name: 'recruitment_collection_runtime_start', idempotent: true, description: 'Start or reuse collect-only discovery on 智联/猎聘/51job. Job Harness derives search keywords from the active Campaign, validates the requested city against that Campaign, and refuses any runtime not marked collect-only. This never authorizes recruiter-facing delivery.', mutability: 'state-write', externalSideEffect: false, inputSchema: RecruitmentCollectionRuntimeStartToolInputSchema, outputSchema: RecruitmentCollectionRuntimeActionToolOutputSchema }),
  tool({ name: 'recruitment_collection_runtime_stop', idempotent: true, description: 'Stop one collect-only recruitment Site Runtime task. This does not undo already observed jobs and performs no recruiter-facing action.', mutability: 'state-write', externalSideEffect: false, inputSchema: RecruitmentCollectionRuntimeStopToolInputSchema, outputSchema: RecruitmentCollectionRuntimeActionToolOutputSchema }),
  tool({ name: 'recruitment_collection_runtime_sync', idempotent: true, description: 'Import cached jobs observed by one collect-only upstream Site Runtime into canonical Job Harness Jobs/Listings, optionally associating them with an existing DiscoveryRun. Upstream delivered flags are metadata only and never create Application truth.', mutability: 'state-write', externalSideEffect: false, inputSchema: RecruitmentCollectionRuntimeSyncToolInputSchema, outputSchema: RecruitmentCollectionRuntimeSyncToolOutputSchema }),
] as const satisfies readonly CareerMcpToolContract[];

export const EMAIL_APPLICATION_MCP_TOOLS = [
  tool({ name: 'career_email_application_prepare', description: 'Freeze recipient, email copy, deterministic draft hash, and exact Resume PDF for an email application. Does not send email.', mutability: 'state-write', externalSideEffect: false, inputSchema: EmailApplicationPrepareToolInputSchema, outputSchema: EmailApplicationPackageDetailSchema }),
  tool({ name: 'career_email_application_get', description: 'Read one immutable email application package and its durable SubmissionIntent.', mutability: 'read', externalSideEffect: false, inputSchema: EmailApplicationGetToolInputSchema, outputSchema: EmailApplicationPackageDetailSchema }),
  tool({ name: 'career_email_application_authorize_send', idempotent: false, description: 'Authorize the independent Email Delivery Worker to send one exact immutable email draft for a short time. If a delivery worker is running, this can cause an external email send.', mutability: 'state-write', externalSideEffect: true, inputSchema: EmailApplicationAuthorizeSendToolInputSchema, outputSchema: EmailSendAuthorizationSchema }),
  tool({ name: 'career_email_application_begin_send', description: 'Verify the immutable email draft hash and mark its SubmissionIntent external_in_progress immediately before a separate email-provider send. This tool itself does not send email.', mutability: 'state-write', externalSideEffect: false, inputSchema: EmailApplicationBeginToolInputSchema, outputSchema: EmailBeginSubmissionIntentOutputSchema }),
  tool({ name: 'career_email_application_confirm', description: 'Persist provider Message-ID/thread evidence after a separate email-provider send and reconcile one ApplicationSubmission. Does not send email.', mutability: 'state-write', externalSideEffect: false, inputSchema: EmailApplicationConfirmToolInputSchema, outputSchema: ConfirmEmailApplicationSendOutputSchema }),
  tool({ name: 'career_email_application_fail', description: 'Record known failure or uncertain/manual-review evidence for an email send attempt. Does not send email.', mutability: 'state-write', externalSideEffect: false, inputSchema: EmailApplicationFailToolInputSchema, outputSchema: EmailApplicationPackageDetailSchema }),
] as const satisfies readonly CareerMcpToolContract[];

export const ResumeProfileIdInputSchema = z.object({ profileId: ResumeEntityIdSchema }).strict();
export const ResumeProfileContextOutputSchema = ResumeProfileContextSchema.nullable();

export const ResumeAuthoringContextInputSchema = z.object({
  profileId: ResumeEntityIdSchema,
  jobId: z.string().trim().min(1).max(200).optional(),
}).strict();
export const ResumeAuthoringContextOutputSchema = z.object({
  profileContext: ResumeProfileContextSchema,
  job: GetJobOutputSchema,
  revisions: ListResumeRevisionsOutputSchema,
}).strict();

export const ResumeProfileSelectionPatchInputSchema = z.object({
  profileId: ResumeEntityIdSchema,
  expectedProfileVersion: z.number().int().positive(),
  expectedLibraryVersion: z.number().int().positive(),
  sectionOrder: z.array(ResumeSectionSchema).min(1).optional(),
  educationIds: z.array(ResumeEntityIdSchema).optional(),
  skillIds: z.array(ResumeEntityIdSchema).optional(),
  workSelections: z.array(ResumeWorkSelectionSchema).optional(),
  projectSelections: z.array(ResumeProjectSelectionSchema).optional(),
  certificateIds: z.array(ResumeEntityIdSchema).optional(),
  summaryIds: z.array(ResumeEntityIdSchema).optional(),
}).strict();

export const ResumeProfileOverridesPatchInputSchema = z.object({
  profileId: ResumeEntityIdSchema,
  expectedProfileVersion: z.number().int().positive(),
  expectedLibraryVersion: z.number().int().positive(),
  overrides: z.array(ResumeProfileOverrideSchema),
}).strict();

export const RESUME_MCP_TOOLS = [
  tool({ name: 'resume_profiles_list', description: 'List first-class Resume Profiles available for authoring and application evidence.', mutability: 'read', externalSideEffect: false, inputSchema: ListResumeProfilesInputSchema, outputSchema: ListResumeProfilesOutputSchema }),
  tool({ name: 'resume_profile_get', description: 'Read one Resume Profile together with its canonical Library and resolved document.', mutability: 'read', externalSideEffect: false, inputSchema: ResumeProfileIdInputSchema, outputSchema: ResumeProfileContextOutputSchema }),
  tool({ name: 'resume_authoring_context_get', description: 'Read the reusable Resume Library content, current Profile selections, revisions, and optional Job context before AI-assisted resume editing.', mutability: 'read', externalSideEffect: false, inputSchema: ResumeAuthoringContextInputSchema, outputSchema: ResumeAuthoringContextOutputSchema }),
  tool({ name: 'resume_profile_patch_selection', idempotent: false, description: 'Patch only Resume Profile composition selections using stable Library IDs and optimistic Profile/Library versions; does not mutate shared Library facts.', mutability: 'state-write', externalSideEffect: false, inputSchema: ResumeProfileSelectionPatchInputSchema, outputSchema: ResumeProfileContextSchema }),
  tool({ name: 'resume_profile_patch_overrides', idempotent: false, description: 'Replace Profile-local text overrides using optimistic Profile/Library versions; does not mutate shared Library facts.', mutability: 'state-write', externalSideEffect: false, inputSchema: ResumeProfileOverridesPatchInputSchema, outputSchema: ResumeProfileContextSchema }),
  tool({ name: 'resume_revision_publish', description: 'Publish the current saved Resume Profile/Library state as an immutable Revision, reusing identical content when possible.', mutability: 'state-write', externalSideEffect: false, inputSchema: PublishResumeRevisionInputSchema, outputSchema: PublishResumeRevisionOutputSchema }),
  tool({ name: 'resume_revision_artifact_materialize', description: 'Materialize an immutable HTML/PDF/JSON Artifact for a published Resume Revision.', mutability: 'state-write', externalSideEffect: false, inputSchema: MaterializeResumeArtifactInputSchema, outputSchema: MaterializeResumeArtifactOutputSchema }),
] as const satisfies readonly CareerMcpToolContract[];

export const JOB_HARNESS_MCP_TOOLS = [...CAREER_MCP_TOOLS, ...RESUME_MCP_TOOLS, ...JOB_RESUME_MCP_TOOLS, ...EMAIL_APPLICATION_MCP_TOOLS, ...BOSS_GREETING_MCP_TOOLS, ...BOSS_RUNTIME_MCP_TOOLS, ...RECRUITMENT_COLLECTION_RUNTIME_MCP_TOOLS] as const;
export const JOB_HARNESS_MCP_TOOL_BY_NAME = new Map(JOB_HARNESS_MCP_TOOLS.map((entry) => [entry.name, entry]));
