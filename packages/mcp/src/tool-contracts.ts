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

export interface CareerMcpToolContract {
  readonly name: string;
  readonly description: string;
  readonly mutability: 'read' | 'state-write';
  /** V1 tools only mutate Job Harness state; none performs a real external job application. */
  readonly externalSideEffect: false;
  /** Whether replaying the exact same tool call is expected to be safe. */
  readonly idempotent?: boolean;
  readonly inputSchema: z.ZodType;
  readonly outputSchema: z.ZodType;
}

function tool(contract: CareerMcpToolContract): CareerMcpToolContract {
  return Object.freeze(contract);
}

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
  tool({ name: 'career_discovery_begin', description: 'Open an auditable discovery run owned by an external search executor.', mutability: 'state-write', externalSideEffect: false, inputSchema: BeginDiscoveryInputSchema, outputSchema: BeginDiscoveryOutputSchema }),
  tool({ name: 'career_discovery_complete', description: 'Complete an auditable discovery run with result counts.', mutability: 'state-write', externalSideEffect: false, inputSchema: CompleteDiscoveryInputSchema, outputSchema: CompleteDiscoveryOutputSchema }),
  tool({ name: 'career_campaign_upsert', description: 'Create or update a Job Harness search campaign.', mutability: 'state-write', externalSideEffect: false, inputSchema: UpsertCampaignInputSchema, outputSchema: UpsertCampaignOutputSchema }),
] as const satisfies readonly CareerMcpToolContract[];

export const CAREER_MCP_TOOL_BY_NAME = new Map(CAREER_MCP_TOOLS.map((entry) => [entry.name, entry]));


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

export const JOB_HARNESS_MCP_TOOLS = [...CAREER_MCP_TOOLS, ...RESUME_MCP_TOOLS] as const;
export const JOB_HARNESS_MCP_TOOL_BY_NAME = new Map(JOB_HARNESS_MCP_TOOLS.map((entry) => [entry.name, entry]));
