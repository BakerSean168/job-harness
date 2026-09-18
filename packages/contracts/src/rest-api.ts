import {
  AuthorizeSubmitInputSchema,
  BeginSubmitInputSchema,
  BeginSubmitOutputSchema,
  CreateReviewSnapshotInputSchema,
  ListReviewSnapshotsOutputSchema,
  ListSubmitAuthorizationsOutputSchema,
  ReportSubmitFailureInputSchema,
  ReportSubmitSuccessInputSchema,
  RevokeSubmitAuthorizationInputSchema,
  ReviewSnapshotSchema,
  SubmitAuthorizationSchema,
} from '@job-harness/apply-contracts';
import { z, type ZodType } from 'zod';
import {
  ApplicantProfileContextSchema,
  ApplicationAnswerSetContextSchema,
  SaveApplicantProfileInputSchema,
  SaveApplicationAnswerSetInputSchema,
} from '@job-harness/applicant-contracts';
import {
  BeginDiscoveryInputSchema,
  BeginDiscoveryOutputSchema,
  CompleteDiscoveryInputSchema,
  CompleteDiscoveryOutputSchema,
  PipelineStatsInputSchema,
  PipelineStatsOutputSchema,
  RecordApplicationInputSchema,
  RecordApplicationOutputSchema,
  SetJobStateInputSchema,
  SetJobStateOutputSchema,
  TransitionApplicationInputSchema,
  TransitionApplicationOutputSchema,
  UpsertCampaignInputSchema,
  UpsertCampaignOutputSchema,
  UpsertJobsBatchInputSchema,
  UpsertJobsBatchOutputSchema,
  ListCampaignsInputSchema,
  ListCampaignsOutputSchema,
  PrepareSubmissionIntentInputSchema,
  PrepareSubmissionIntentOutputSchema,
  RecommendJobResumesOutputSchema,
  PrepareRecommendedSubmissionIntentInputSchema,
  PrepareRecommendedSubmissionIntentOutputSchema,
  PrepareEmailApplicationInputSchema,
  EmailApplicationPackageDetailSchema,
  BeginEmailApplicationSendInputSchema,
  ConfirmEmailApplicationSendInputSchema,
  FailEmailApplicationSendInputSchema,
  ConfirmEmailApplicationSendOutputSchema,
  AuthorizeEmailApplicationSendInputSchema,
  ListEmailSendAuthorizationsInputSchema,
  ListEmailSendAuthorizationsOutputSchema,
  ClaimEmailApplicationSendInputSchema,
  ClaimEmailApplicationSendOutputSchema,
  ListSiteResumeBindingsInputSchema,
  ListSiteResumeBindingsOutputSchema,
  CreateSiteResumeBindingInputSchema,
  RevokeSiteResumeBindingInputSchema,
  BeginSubmissionIntentInputSchema,
  BeginSubmissionIntentOutputSchema,
  ConfirmSubmissionIntentInputSchema,
  SubmissionIntentCommitOutputSchema,
  FailSubmissionIntentInputSchema,
  FailSubmissionIntentOutputSchema,
  ReconcileSubmissionIntentOutputSchema,
  ReconcileSubmissionIntentsInputSchema,
  ReconcileSubmissionIntentsOutputSchema,
  ListSubmissionIntentsInputSchema,
  ListSubmissionIntentsOutputSchema,
} from './operations';
import {
  AnalyticsSnapshotInputSchema,
  AnalyticsSnapshotSchema,
  ApplicationWorkspaceDetailSchema,
  CompanyDetailSchema,
  DashboardSnapshotInputSchema,
  DashboardSnapshotSchema,
  DiscoveryRunDetailSchema,
  ListApplicationBoardInputSchema,
  ListApplicationBoardOutputSchema,
  ListCompaniesInputSchema,
  ListCompaniesOutputSchema,
  ListDiscoveryRunsInputSchema,
  ListDiscoveryRunsOutputSchema,
  ListResumeUsageInputSchema,
  ListResumeUsageOutputSchema,
  SearchJobListItemsInputSchema,
  SearchJobListItemsOutputSchema,
  JobDetailSchema,
} from './views';
import {
  DeleteSavedViewOutputSchema,
  ListSavedViewsInputSchema,
  ListSavedViewsOutputSchema,
  SavedViewSchema,
  UpsertSavedViewInputSchema,
} from './saved-views';
import { CareerExportSnapshotSchema } from './export';
import {
  ApplicantDataGrantInputSchema,
  ApplicantFieldCatalogSchema,
  AuthorizeResumeArtifactInputSchema,
  CancelExecutionAttemptInputSchema,
  ClaimExecutionAttemptInputSchema,
  ClaimExecutionAttemptOutputSchema,
  CompleteExecutionAttemptInputSchema,
  DispatchExecutionAttemptInputSchema,
  ExecutionAttemptDetailSchema,
  ExecutionAttemptSchema,
  ExecutorHeartbeatInputSchema,
  ExecutorRegistrationSchema,
  FailExecutionAttemptInputSchema,
  HeartbeatExecutionAttemptInputSchema,
  ListExecutionAttemptsInputSchema,
  ListExecutionAttemptsOutputSchema,
  ListExecutorsInputSchema,
  ListExecutorsOutputSchema,
  MarkExecutionAttemptWaitingInputSchema,
  RegisterExecutorInputSchema,
  ResolveApplicantDataInputSchema,
  ResolvedApplicantValuesSchema,
  ResumeArtifactGrantOutputSchema,
  ResumeExecutionAttemptInputSchema,
  StartExecutionAttemptInputSchema,
} from '@job-harness/apply-contracts';
import { EmailSendAuthorizationSchema, EntityIdSchema, SiteResumeBindingSchema, SubmissionIntentSchema } from './schemas';
import {
  ListResumeProfilesInputSchema as ListResumeBuilderProfilesInputSchema,
  ListResumeProfilesOutputSchema as ListResumeBuilderProfilesOutputSchema,
  ResumePreviewInputSchema,
  ResumePreviewOutputSchema,
  SaveResumeLibraryInputSchema,
  SaveResumeProfileInputSchema,
  ResumeLibrarySchema,
  ResumeProfileContextSchema,
  ListResumeRevisionsOutputSchema,
  PublishResumeRevisionInputSchema,
  PublishResumeRevisionOutputSchema,
  ResumeRevisionDetailSchema,
  ResumeRevisionDiffQuerySchema,
  ResumeRevisionDiffOutputSchema,
  MaterializeResumeArtifactInputSchema,
  MaterializeResumeArtifactOutputSchema,
} from '@job-harness/resume-contracts';

export type JobHarnessRestMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface JobHarnessRestV1RouteContract {
  readonly operationId: string;
  readonly method: JobHarnessRestMethod;
  readonly path: string;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly querySchema?: ZodType;
  readonly paramsSchema?: ZodType;
  readonly bodySchema?: ZodType;
  readonly responseSchema?: ZodType;
  readonly successStatus: number;
  readonly responseContentType?: string;
  readonly binaryResponse?: boolean;
}

const IdParam = (name: string) => z.object({ [name]: EntityIdSchema }).strict();
const OptionalCampaignQuerySchema = z.object({ campaignId: EntityIdSchema.optional() }).strict();

export const SetJobStateBodySchema = SetJobStateInputSchema.omit({ jobId: true });
export const TransitionApplicationBodySchema = TransitionApplicationInputSchema.omit({ applicationId: true });
export const UpsertCampaignBodySchema = UpsertCampaignInputSchema.omit({ id: true });
export const CompleteDiscoveryBodySchema = CompleteDiscoveryInputSchema.omit({ runId: true });
export const PublishResumeRevisionBodySchema = PublishResumeRevisionInputSchema.omit({ profileId: true });
export const MaterializeResumeArtifactBodySchema = MaterializeResumeArtifactInputSchema.omit({ revisionId: true });
export const BeginSubmissionIntentBodySchema = BeginSubmissionIntentInputSchema.omit({ intentId: true });
export const ConfirmSubmissionIntentBodySchema = ConfirmSubmissionIntentInputSchema.omit({ intentId: true });
export const PrepareEmailApplicationBodySchema = PrepareEmailApplicationInputSchema;
export const BeginEmailApplicationSendBodySchema = BeginEmailApplicationSendInputSchema;
export const ConfirmEmailApplicationSendBodySchema = ConfirmEmailApplicationSendInputSchema;
export const FailEmailApplicationSendBodySchema = FailEmailApplicationSendInputSchema;
export const AuthorizeEmailApplicationSendBodySchema = AuthorizeEmailApplicationSendInputSchema;
export const ClaimEmailApplicationSendBodySchema = ClaimEmailApplicationSendInputSchema;
export const CreateSiteResumeBindingBodySchema = CreateSiteResumeBindingInputSchema;
export const RevokeSiteResumeBindingBodySchema = RevokeSiteResumeBindingInputSchema;
export const FailSubmissionIntentBodySchema = FailSubmissionIntentInputSchema.omit({ intentId: true });
export const ExecutorHeartbeatBodySchema = ExecutorHeartbeatInputSchema.omit({ executorId: true });
export const StartExecutionAttemptBodySchema = StartExecutionAttemptInputSchema.omit({ attemptId: true });
export const HeartbeatExecutionAttemptBodySchema = HeartbeatExecutionAttemptInputSchema.omit({ attemptId: true });
export const MarkExecutionAttemptWaitingBodySchema = MarkExecutionAttemptWaitingInputSchema.omit({ attemptId: true });
export const ResumeExecutionAttemptBodySchema = ResumeExecutionAttemptInputSchema.omit({ attemptId: true });
export const CompleteExecutionAttemptBodySchema = CompleteExecutionAttemptInputSchema.omit({ attemptId: true });
export const FailExecutionAttemptBodySchema = FailExecutionAttemptInputSchema.omit({ attemptId: true });
export const CancelExecutionAttemptBodySchema = CancelExecutionAttemptInputSchema.omit({ attemptId: true });
export const AuthorizeResumeArtifactBodySchema = AuthorizeResumeArtifactInputSchema.omit({ attemptId: true });
export const ApplicantDataGrantBodySchema = ApplicantDataGrantInputSchema.omit({ attemptId: true });
export const ResolveApplicantDataBodySchema = ResolveApplicantDataInputSchema.omit({ attemptId: true });
export const CreateReviewSnapshotBodySchema = CreateReviewSnapshotInputSchema.omit({ attemptId: true });
export const AuthorizeSubmitBodySchema = AuthorizeSubmitInputSchema.omit({ attemptId: true });
export const RevokeSubmitAuthorizationBodySchema = RevokeSubmitAuthorizationInputSchema.omit({ attemptId: true, authorizationId: true });
export const BeginSubmitBodySchema = BeginSubmitInputSchema.omit({ attemptId: true });
export const ReportSubmitSuccessBodySchema = ReportSubmitSuccessInputSchema.omit({ attemptId: true });
export const ReportSubmitFailureBodySchema = ReportSubmitFailureInputSchema.omit({ attemptId: true });

export const RestErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.unknown().optional(),
  }).strict(),
}).strict();

const route = (contract: JobHarnessRestV1RouteContract): JobHarnessRestV1RouteContract => contract;

export const JOB_HARNESS_REST_V1_ROUTES = {
  applicantProfile: route({ operationId: 'getApplicantProfile', method: 'get', path: '/applicant-profile', tags: ['Applicant Data'], summary: 'Read the default mutable applicant profile and its latest immutable revision', responseSchema: ApplicantProfileContextSchema, successStatus: 200 }),
  saveApplicantProfile: route({ operationId: 'saveApplicantProfile', method: 'put', path: '/applicant-profile', tags: ['Applicant Data'], summary: 'Optimistically update applicant base facts and publish an immutable revision', bodySchema: SaveApplicantProfileInputSchema, responseSchema: ApplicantProfileContextSchema, successStatus: 200 }),
  applicationAnswerSet: route({ operationId: 'getApplicationAnswerSet', method: 'get', path: '/application-answer-set', tags: ['Applicant Data'], summary: 'Read explicit reusable application answers and their latest immutable revision', responseSchema: ApplicationAnswerSetContextSchema, successStatus: 200 }),
  saveApplicationAnswerSet: route({ operationId: 'saveApplicationAnswerSet', method: 'put', path: '/application-answer-set', tags: ['Applicant Data'], summary: 'Optimistically update explicit application answers and publish an immutable revision', bodySchema: SaveApplicationAnswerSetInputSchema, responseSchema: ApplicationAnswerSetContextSchema, successStatus: 200 }),
  analytics: route({ operationId: 'getAnalyticsSnapshot', method: 'get', path: '/analytics', tags: ['Analytics'], summary: 'Read the analytics snapshot', querySchema: AnalyticsSnapshotInputSchema, responseSchema: AnalyticsSnapshotSchema, successStatus: 200 }),
  pipeline: route({ operationId: 'getPipelineStats', method: 'get', path: '/pipeline', tags: ['Analytics'], summary: 'Read canonical pipeline statistics', querySchema: PipelineStatsInputSchema, responseSchema: PipelineStatsOutputSchema, successStatus: 200 }),
  dashboard: route({ operationId: 'getDashboardSnapshot', method: 'get', path: '/dashboard', tags: ['Dashboard'], summary: 'Read the operational dashboard snapshot', querySchema: DashboardSnapshotInputSchema, responseSchema: DashboardSnapshotSchema, successStatus: 200 }),
  companies: route({ operationId: 'listCompanies', method: 'get', path: '/companies', tags: ['Companies'], summary: 'List company workspace projections', querySchema: ListCompaniesInputSchema, responseSchema: ListCompaniesOutputSchema, successStatus: 200 }),
  companyDetail: route({ operationId: 'getCompanyDetail', method: 'get', path: '/companies/:companyId', tags: ['Companies'], summary: 'Read one company workspace projection', paramsSchema: IdParam('companyId'), querySchema: OptionalCampaignQuerySchema, responseSchema: CompanyDetailSchema, successStatus: 200 }),
  jobs: route({ operationId: 'searchJobs', method: 'get', path: '/jobs', tags: ['Jobs'], summary: 'Search durable job projections', querySchema: SearchJobListItemsInputSchema, responseSchema: SearchJobListItemsOutputSchema, successStatus: 200 }),
  jobDetail: route({ operationId: 'getJobDetail', method: 'get', path: '/jobs/:jobId', tags: ['Jobs'], summary: 'Read one job detail projection', paramsSchema: IdParam('jobId'), responseSchema: JobDetailSchema, successStatus: 200 }),
  jobResumeRecommendations: route({ operationId: 'recommendJobResumes', method: 'get', path: '/jobs/:jobId/resume-recommendations', tags: ['Jobs'], summary: 'Rank available Resume Profiles for one job using deterministic explainable scoring', paramsSchema: IdParam('jobId'), responseSchema: RecommendJobResumesOutputSchema, successStatus: 200 }),
  prepareRecommendedSubmissionIntent: route({ operationId: 'prepareRecommendedSubmissionIntent', method: 'post', path: '/jobs/:jobId/prepare-application', tags: ['Jobs'], summary: 'Select or honor a Resume Profile, freeze its latest Revision/PDF Artifact, and prepare a durable SubmissionIntent', paramsSchema: IdParam('jobId'), bodySchema: PrepareRecommendedSubmissionIntentInputSchema, responseSchema: PrepareRecommendedSubmissionIntentOutputSchema, successStatus: 201 }),
  prepareEmailApplication: route({ operationId: 'prepareEmailApplication', method: 'post', path: '/jobs/:jobId/email-application', tags: ['Email Applications'], summary: 'Freeze recipient, email copy, and exact Resume Artifact for one email application', paramsSchema: IdParam('jobId'), bodySchema: PrepareEmailApplicationBodySchema, responseSchema: EmailApplicationPackageDetailSchema, successStatus: 201 }),
  getEmailApplication: route({ operationId: 'getEmailApplication', method: 'get', path: '/email-applications/:packageId', tags: ['Email Applications'], summary: 'Read one immutable email application package and its SubmissionIntent', paramsSchema: IdParam('packageId'), responseSchema: EmailApplicationPackageDetailSchema, successStatus: 200 }),
  beginEmailApplicationSend: route({ operationId: 'beginEmailApplicationSend', method: 'post', path: '/email-applications/:packageId/begin-send', tags: ['Email Applications'], summary: 'Verify the frozen draft hash and durably cross into external_in_progress before an email provider send', paramsSchema: IdParam('packageId'), bodySchema: BeginEmailApplicationSendBodySchema, responseSchema: SubmissionIntentSchema, successStatus: 200 }),
  confirmEmailApplicationSend: route({ operationId: 'confirmEmailApplicationSend', method: 'post', path: '/email-applications/:packageId/confirm', tags: ['Email Applications'], summary: 'Persist provider Message-ID evidence and reconcile the email send into ApplicationSubmission state', paramsSchema: IdParam('packageId'), bodySchema: ConfirmEmailApplicationSendBodySchema, responseSchema: ConfirmEmailApplicationSendOutputSchema, successStatus: 200 }),
  failEmailApplicationSend: route({ operationId: 'failEmailApplicationSend', method: 'post', path: '/email-applications/:packageId/fail', tags: ['Email Applications'], summary: 'Record a known failed or uncertain email-send result without fabricating success', paramsSchema: IdParam('packageId'), bodySchema: FailEmailApplicationSendBodySchema, responseSchema: EmailApplicationPackageDetailSchema, successStatus: 200 }),
  authorizeEmailApplicationSend: route({ operationId: 'authorizeEmailApplicationSend', method: 'post', path: '/email-applications/:packageId/send-authorizations', tags: ['Email Applications'], summary: 'Issue a short-lived user authorization bound to one immutable email draft', paramsSchema: IdParam('packageId'), bodySchema: AuthorizeEmailApplicationSendBodySchema, responseSchema: EmailSendAuthorizationSchema, successStatus: 201 }),
  listEmailSendAuthorizations: route({ operationId: 'listEmailSendAuthorizations', method: 'get', path: '/email-send-authorizations', tags: ['Email Applications'], summary: 'List active non-expired email send authorizations for the delivery worker', querySchema: ListEmailSendAuthorizationsInputSchema, responseSchema: ListEmailSendAuthorizationsOutputSchema, successStatus: 200 }),
  claimEmailApplicationSend: route({ operationId: 'claimEmailApplicationSend', method: 'post', path: '/email-applications/:packageId/claim-send', tags: ['Email Applications'], summary: 'Consume one email send authorization and durably cross the external-send boundary', paramsSchema: IdParam('packageId'), bodySchema: ClaimEmailApplicationSendBodySchema, responseSchema: ClaimEmailApplicationSendOutputSchema, successStatus: 200 }),
  siteResumeBindings: route({ operationId: 'listSiteResumeBindings', method: 'get', path: '/site-resume-bindings', tags: ['Site Resume Bindings'], summary: 'List user-confirmed mappings between site-managed resume labels and immutable Job Harness Resume Artifacts', querySchema: ListSiteResumeBindingsInputSchema, responseSchema: ListSiteResumeBindingsOutputSchema, successStatus: 200 }),
  createSiteResumeBinding: route({ operationId: 'createSiteResumeBinding', method: 'post', path: '/site-resume-bindings', tags: ['Site Resume Bindings'], summary: 'Confirm one observed site-managed resume label against the current immutable Resume Profile revision/PDF', bodySchema: CreateSiteResumeBindingBodySchema, responseSchema: SiteResumeBindingSchema, successStatus: 201 }),
  revokeSiteResumeBinding: route({ operationId: 'revokeSiteResumeBinding', method: 'post', path: '/site-resume-bindings/:bindingId/revoke', tags: ['Site Resume Bindings'], summary: 'Revoke a site-managed resume binding without deleting its audit evidence', paramsSchema: IdParam('bindingId'), bodySchema: RevokeSiteResumeBindingBodySchema, responseSchema: SiteResumeBindingSchema, successStatus: 200 }),
  upsertJobsBatch: route({ operationId: 'upsertJobsBatch', method: 'post', path: '/jobs/batch', tags: ['Jobs'], summary: 'Idempotently upsert discovered jobs', bodySchema: UpsertJobsBatchInputSchema, responseSchema: UpsertJobsBatchOutputSchema, successStatus: 200 }),
  setJobState: route({ operationId: 'setJobState', method: 'patch', path: '/jobs/:jobId/state', tags: ['Jobs'], summary: 'Change a job triage state', paramsSchema: IdParam('jobId'), bodySchema: SetJobStateBodySchema, responseSchema: SetJobStateOutputSchema, successStatus: 200 }),
  applications: route({ operationId: 'listApplications', method: 'get', path: '/applications', tags: ['Applications'], summary: 'List application board projections', querySchema: ListApplicationBoardInputSchema, responseSchema: ListApplicationBoardOutputSchema, successStatus: 200 }),
  applicationDetail: route({ operationId: 'getApplicationDetail', method: 'get', path: '/applications/:applicationId', tags: ['Applications'], summary: 'Read one application workspace projection', paramsSchema: IdParam('applicationId'), responseSchema: ApplicationWorkspaceDetailSchema, successStatus: 200 }),
  recordApplication: route({ operationId: 'recordApplication', method: 'post', path: '/applications', tags: ['Applications'], summary: 'Record an application against a known job', bodySchema: RecordApplicationInputSchema, responseSchema: RecordApplicationOutputSchema, successStatus: 201 }),
  transitionApplication: route({ operationId: 'transitionApplication', method: 'post', path: '/applications/:applicationId/transition', tags: ['Applications'], summary: 'Transition an application lifecycle stage', paramsSchema: IdParam('applicationId'), bodySchema: TransitionApplicationBodySchema, responseSchema: TransitionApplicationOutputSchema, successStatus: 200 }),
  submissionIntents: route({ operationId: 'listSubmissionIntents', method: 'get', path: '/submission-intents', tags: ['Submission Intents'], summary: 'List durable external-submission intents for recovery/reconciliation', querySchema: ListSubmissionIntentsInputSchema, responseSchema: ListSubmissionIntentsOutputSchema, successStatus: 200 }),
  submissionIntentDetail: route({ operationId: 'getSubmissionIntent', method: 'get', path: '/submission-intents/:intentId', tags: ['Submission Intents'], summary: 'Read one durable external-submission intent', paramsSchema: IdParam('intentId'), responseSchema: PrepareSubmissionIntentOutputSchema, successStatus: 200 }),
  prepareSubmissionIntent: route({ operationId: 'prepareSubmissionIntent', method: 'post', path: '/submission-intents', tags: ['Submission Intents'], summary: 'Persist intent before an external recruiting-site submission begins', bodySchema: PrepareSubmissionIntentInputSchema, responseSchema: PrepareSubmissionIntentOutputSchema, successStatus: 201 }),
  beginSubmissionIntent: route({ operationId: 'beginSubmissionIntent', method: 'post', path: '/submission-intents/:intentId/begin', tags: ['Submission Intents'], summary: 'Mark that the external submission side effect is in progress', paramsSchema: IdParam('intentId'), bodySchema: BeginSubmissionIntentBodySchema, responseSchema: BeginSubmissionIntentOutputSchema, successStatus: 200 }),
  confirmSubmissionIntent: route({ operationId: 'confirmSubmissionIntent', method: 'post', path: '/submission-intents/:intentId/confirm', tags: ['Submission Intents'], summary: 'Persist external success evidence and immediately reconcile it into ApplicationSubmission state', paramsSchema: IdParam('intentId'), bodySchema: ConfirmSubmissionIntentBodySchema, responseSchema: SubmissionIntentCommitOutputSchema, successStatus: 200 }),
  failSubmissionIntent: route({ operationId: 'failSubmissionIntent', method: 'post', path: '/submission-intents/:intentId/fail', tags: ['Submission Intents'], summary: 'Record external failure or manual-review state', paramsSchema: IdParam('intentId'), bodySchema: FailSubmissionIntentBodySchema, responseSchema: FailSubmissionIntentOutputSchema, successStatus: 200 }),
  reconcileSubmissionIntent: route({ operationId: 'reconcileSubmissionIntent', method: 'post', path: '/submission-intents/:intentId/reconcile', tags: ['Submission Intents'], summary: 'Retry persistence for an externally confirmed submission intent', paramsSchema: IdParam('intentId'), responseSchema: ReconcileSubmissionIntentOutputSchema, successStatus: 200 }),
  reconcileSubmissionIntents: route({ operationId: 'reconcileSubmissionIntents', method: 'post', path: '/submission-intents/reconcile-pending', tags: ['Submission Intents'], summary: 'Reconcile durable pending submissions and flag stale in-progress intents without performing external recruiting-site actions', bodySchema: ReconcileSubmissionIntentsInputSchema, responseSchema: ReconcileSubmissionIntentsOutputSchema, successStatus: 200 }),
  executors: route({ operationId: 'listExecutors', method: 'get', path: '/executors', tags: ['Apply Executors'], summary: 'List registered Apply Executor workers', querySchema: ListExecutorsInputSchema, responseSchema: ListExecutorsOutputSchema, successStatus: 200 }),
  executorDetail: route({ operationId: 'getExecutor', method: 'get', path: '/executors/:executorId', tags: ['Apply Executors'], summary: 'Read one Apply Executor registration', paramsSchema: IdParam('executorId'), responseSchema: ExecutorRegistrationSchema, successStatus: 200 }),
  registerExecutor: route({ operationId: 'registerExecutor', method: 'post', path: '/executors/register', tags: ['Apply Executors'], summary: 'Register or refresh an Apply Executor descriptor', bodySchema: RegisterExecutorInputSchema, responseSchema: ExecutorRegistrationSchema, successStatus: 200 }),
  heartbeatExecutor: route({ operationId: 'heartbeatExecutor', method: 'post', path: '/executors/:executorId/heartbeat', tags: ['Apply Executors'], summary: 'Heartbeat an Apply Executor registration', paramsSchema: IdParam('executorId'), bodySchema: ExecutorHeartbeatBodySchema, responseSchema: ExecutorRegistrationSchema, successStatus: 200 }),
  executionAttempts: route({ operationId: 'listExecutionAttempts', method: 'get', path: '/execution-attempts', tags: ['Apply Executors'], summary: 'List durable browser execution attempts', querySchema: ListExecutionAttemptsInputSchema, responseSchema: ListExecutionAttemptsOutputSchema, successStatus: 200 }),
  executionAttemptDetail: route({ operationId: 'getExecutionAttempt', method: 'get', path: '/execution-attempts/:attemptId', tags: ['Apply Executors'], summary: 'Read one execution attempt and its sanitized event timeline', paramsSchema: IdParam('attemptId'), responseSchema: ExecutionAttemptDetailSchema, successStatus: 200 }),
  dispatchExecutionAttempt: route({ operationId: 'dispatchExecutionAttempt', method: 'post', path: '/execution-attempts', tags: ['Apply Executors'], summary: 'Queue a technical attempt for an already-prepared SubmissionIntent', bodySchema: DispatchExecutionAttemptInputSchema, responseSchema: ExecutionAttemptSchema, successStatus: 201 }),
  claimExecutionAttempt: route({ operationId: 'claimExecutionAttempt', method: 'post', path: '/execution-attempts/claim', tags: ['Apply Executors'], summary: 'Claim one compatible queued attempt with an expiring lease', bodySchema: ClaimExecutionAttemptInputSchema, responseSchema: ClaimExecutionAttemptOutputSchema, successStatus: 200 }),
  heartbeatExecutionAttempt: route({ operationId: 'heartbeatExecutionAttempt', method: 'post', path: '/execution-attempts/:attemptId/heartbeat', tags: ['Apply Executors'], summary: 'Renew the lease and optionally checkpoint a claimed/running attempt', paramsSchema: IdParam('attemptId'), bodySchema: HeartbeatExecutionAttemptBodySchema, responseSchema: ExecutionAttemptSchema, successStatus: 200 }),
  startExecutionAttempt: route({ operationId: 'startExecutionAttempt', method: 'post', path: '/execution-attempts/:attemptId/start', tags: ['Apply Executors'], summary: 'Bind concrete adapter/backend versions and start a claimed attempt', paramsSchema: IdParam('attemptId'), bodySchema: StartExecutionAttemptBodySchema, responseSchema: ExecutionAttemptSchema, successStatus: 200 }),
  waitExecutionAttempt: route({ operationId: 'waitExecutionAttempt', method: 'post', path: '/execution-attempts/:attemptId/waiting', tags: ['Apply Executors'], summary: 'Release a lease and wait for explicit human action', paramsSchema: IdParam('attemptId'), bodySchema: MarkExecutionAttemptWaitingBodySchema, responseSchema: ExecutionAttemptSchema, successStatus: 200 }),
  resumeExecutionAttempt: route({ operationId: 'resumeExecutionAttempt', method: 'post', path: '/execution-attempts/:attemptId/resume', tags: ['Apply Executors'], summary: 'Requeue a pre-submit attempt after human action', paramsSchema: IdParam('attemptId'), bodySchema: ResumeExecutionAttemptBodySchema, responseSchema: ExecutionAttemptSchema, successStatus: 200 }),
  completeExecutionAttempt: route({ operationId: 'completeExecutionAttempt', method: 'post', path: '/execution-attempts/:attemptId/complete', tags: ['Apply Executors'], summary: 'Complete a leased technical attempt', paramsSchema: IdParam('attemptId'), bodySchema: CompleteExecutionAttemptBodySchema, responseSchema: ExecutionAttemptSchema, successStatus: 200 }),
  failExecutionAttempt: route({ operationId: 'failExecutionAttempt', method: 'post', path: '/execution-attempts/:attemptId/fail', tags: ['Apply Executors'], summary: 'Fail a leased attempt with explicit external-effect certainty', paramsSchema: IdParam('attemptId'), bodySchema: FailExecutionAttemptBodySchema, responseSchema: ExecutionAttemptSchema, successStatus: 200 }),
  cancelExecutionAttempt: route({ operationId: 'cancelExecutionAttempt', method: 'post', path: '/execution-attempts/:attemptId/cancel', tags: ['Apply Executors'], summary: 'Cancel only before the irreversible external-effect boundary', paramsSchema: IdParam('attemptId'), bodySchema: CancelExecutionAttemptBodySchema, responseSchema: ExecutionAttemptSchema, successStatus: 200 }),
  executionAttemptResumeArtifact: route({ operationId: 'getExecutionAttemptResumeArtifact', method: 'post', path: '/execution-attempts/:attemptId/resume-artifact', tags: ['Apply Executors'], summary: 'Fetch the frozen PDF Resume Artifact bound to a valid worker lease', paramsSchema: IdParam('attemptId'), bodySchema: AuthorizeResumeArtifactBodySchema, responseSchema: ResumeArtifactGrantOutputSchema, successStatus: 200 }),
  executionAttemptApplicantCatalog: route({ operationId: 'getExecutionAttemptApplicantCatalog', method: 'post', path: '/execution-attempts/:attemptId/applicant-data/catalog', tags: ['Apply Executors'], summary: 'Read the value-free applicant-field catalog derived from the frozen Resume Revision under a valid worker lease', paramsSchema: IdParam('attemptId'), bodySchema: ApplicantDataGrantBodySchema, responseSchema: ApplicantFieldCatalogSchema, successStatus: 200 }),
  resolveExecutionAttemptApplicantData: route({ operationId: 'resolveExecutionAttemptApplicantData', method: 'post', path: '/execution-attempts/:attemptId/applicant-data/resolve', tags: ['Apply Executors'], summary: 'Resolve only explicitly requested literal applicant values from the frozen Resume Revision under a valid worker lease', paramsSchema: IdParam('attemptId'), bodySchema: ResolveApplicantDataBodySchema, responseSchema: ResolvedApplicantValuesSchema, successStatus: 200 }),
  executionAttemptReviewSnapshots: route({ operationId: 'listExecutionAttemptReviewSnapshots', method: 'get', path: '/execution-attempts/:attemptId/review-snapshots', tags: ['Apply Executors'], summary: 'List redacted review snapshots for an execution attempt', paramsSchema: IdParam('attemptId'), responseSchema: ListReviewSnapshotsOutputSchema, successStatus: 200 }),
  createExecutionAttemptReviewSnapshot: route({ operationId: 'createExecutionAttemptReviewSnapshot', method: 'post', path: '/execution-attempts/:attemptId/review-snapshots', tags: ['Apply Executors'], summary: 'Persist a redacted review snapshot under the current worker lease', paramsSchema: IdParam('attemptId'), bodySchema: CreateReviewSnapshotBodySchema, responseSchema: ReviewSnapshotSchema, successStatus: 201 }),
  executionAttemptSubmitAuthorizations: route({ operationId: 'listExecutionAttemptSubmitAuthorizations', method: 'get', path: '/execution-attempts/:attemptId/submit-authorizations', tags: ['Apply Executors'], summary: 'List submit authorizations for an execution attempt', paramsSchema: IdParam('attemptId'), responseSchema: ListSubmitAuthorizationsOutputSchema, successStatus: 200 }),
  authorizeExecutionAttemptSubmit: route({ operationId: 'authorizeExecutionAttemptSubmit', method: 'post', path: '/execution-attempts/:attemptId/submit-authorizations', tags: ['Apply Executors'], summary: 'Authorize a short-lived submit for a reviewed immutable form-state hash', paramsSchema: IdParam('attemptId'), bodySchema: AuthorizeSubmitBodySchema, responseSchema: SubmitAuthorizationSchema, successStatus: 201 }),
  revokeExecutionAttemptSubmitAuthorization: route({ operationId: 'revokeExecutionAttemptSubmitAuthorization', method: 'post', path: '/execution-attempts/:attemptId/submit-authorizations/:authorizationId/revoke', tags: ['Apply Executors'], summary: 'Revoke an active submit authorization', paramsSchema: z.object({ attemptId: EntityIdSchema, authorizationId: EntityIdSchema }).strict(), bodySchema: RevokeSubmitAuthorizationBodySchema, responseSchema: SubmitAuthorizationSchema, successStatus: 200 }),
  beginExecutionAttemptSubmit: route({ operationId: 'beginExecutionAttemptSubmit', method: 'post', path: '/execution-attempts/:attemptId/begin-submit', tags: ['Apply Executors'], summary: 'Consume authorization and durably cross the external-effect boundary before the site click', paramsSchema: IdParam('attemptId'), bodySchema: BeginSubmitBodySchema, responseSchema: BeginSubmitOutputSchema, successStatus: 200 }),
  reportExecutionAttemptSubmitSuccess: route({ operationId: 'reportExecutionAttemptSubmitSuccess', method: 'post', path: '/execution-attempts/:attemptId/submit-success', tags: ['Apply Executors'], summary: 'Record exact external submit success and reconcile SubmissionIntent', paramsSchema: IdParam('attemptId'), bodySchema: ReportSubmitSuccessBodySchema, responseSchema: ExecutionAttemptSchema, successStatus: 200 }),
  reportExecutionAttemptSubmitFailure: route({ operationId: 'reportExecutionAttemptSubmitFailure', method: 'post', path: '/execution-attempts/:attemptId/submit-failure', tags: ['Apply Executors'], summary: 'Record definite external failure or uncertain post-submit outcome', paramsSchema: IdParam('attemptId'), bodySchema: ReportSubmitFailureBodySchema, responseSchema: ExecutionAttemptSchema, successStatus: 200 }),
  campaigns: route({ operationId: 'listCampaigns', method: 'get', path: '/campaigns', tags: ['Campaigns'], summary: 'List job-search campaigns', querySchema: ListCampaignsInputSchema, responseSchema: ListCampaignsOutputSchema, successStatus: 200 }),
  campaignDetail: route({ operationId: 'getCampaign', method: 'get', path: '/campaigns/:campaignId', tags: ['Campaigns'], summary: 'Read one job-search campaign', paramsSchema: IdParam('campaignId'), responseSchema: UpsertCampaignOutputSchema, successStatus: 200 }),
  upsertCampaign: route({ operationId: 'upsertCampaign', method: 'put', path: '/campaigns/:campaignId', tags: ['Campaigns'], summary: 'Create or update a job-search campaign', paramsSchema: IdParam('campaignId'), bodySchema: UpsertCampaignBodySchema, responseSchema: UpsertCampaignOutputSchema, successStatus: 200 }),
  resumeProfiles: route({ operationId: 'listResumeProfiles', method: 'get', path: '/resume/profiles', tags: ['Resume Builder'], summary: 'List first-class Resume Profiles', querySchema: ListResumeBuilderProfilesInputSchema, responseSchema: ListResumeBuilderProfilesOutputSchema, successStatus: 200 }),
  resumeProfileDetail: route({ operationId: 'getResumeProfileContext', method: 'get', path: '/resume/profiles/:profileId', tags: ['Resume Builder'], summary: 'Read a Resume Profile with canonical Library and resolved document', paramsSchema: IdParam('profileId'), responseSchema: ResumeProfileContextSchema, successStatus: 200 }),
  saveResumeProfile: route({ operationId: 'saveResumeProfile', method: 'put', path: '/resume/profiles/:profileId', tags: ['Resume Builder'], summary: 'Optimistically save a mutable Resume Profile', paramsSchema: IdParam('profileId'), bodySchema: SaveResumeProfileInputSchema, responseSchema: ResumeProfileContextSchema, successStatus: 200 }),
  saveResumeLibrary: route({ operationId: 'saveResumeLibrary', method: 'put', path: '/resume/libraries/:libraryId', tags: ['Resume Builder'], summary: 'Optimistically save shared Resume Library content', paramsSchema: IdParam('libraryId'), bodySchema: SaveResumeLibraryInputSchema, responseSchema: ResumeLibrarySchema, successStatus: 200 }),
  resumePreview: route({ operationId: 'previewResumeDraft', method: 'post', path: '/resume/preview', tags: ['Resume Builder'], summary: 'Resolve and render an unsaved Resume draft', bodySchema: ResumePreviewInputSchema, responseSchema: ResumePreviewOutputSchema, successStatus: 200 }),
  resumePreviewPdf: route({ operationId: 'previewResumeDraftPdf', method: 'post', path: '/resume/preview/pdf', tags: ['Resume Builder'], summary: 'Render an unsaved Resume draft through the exact Chromium PDF path without persisting a Revision or Artifact', bodySchema: ResumePreviewInputSchema, successStatus: 200, responseContentType: 'application/pdf', binaryResponse: true }),
  resumeRevisions: route({ operationId: 'listResumeRevisions', method: 'get', path: '/resume/profiles/:profileId/revisions', tags: ['Resume Builder'], summary: 'List immutable Resume Revision history', paramsSchema: IdParam('profileId'), responseSchema: ListResumeRevisionsOutputSchema, successStatus: 200 }),
  publishResumeRevision: route({ operationId: 'publishResumeRevision', method: 'post', path: '/resume/profiles/:profileId/revisions', tags: ['Resume Builder'], summary: 'Publish the current saved Resume state as an immutable Revision', paramsSchema: IdParam('profileId'), bodySchema: PublishResumeRevisionBodySchema, responseSchema: PublishResumeRevisionOutputSchema, successStatus: 200 }),
  resumeRevisionDetail: route({ operationId: 'getResumeRevision', method: 'get', path: '/resume/revisions/:revisionId', tags: ['Resume Builder'], summary: 'Read one immutable Resume Revision and its artifacts', paramsSchema: IdParam('revisionId'), responseSchema: ResumeRevisionDetailSchema, successStatus: 200 }),
  resumeRevisionDiff: route({ operationId: 'diffResumeRevision', method: 'get', path: '/resume/revisions/:revisionId/diff', tags: ['Resume Builder'], summary: 'Diff a Resume Revision against the previous Revision or current saved state', paramsSchema: IdParam('revisionId'), querySchema: ResumeRevisionDiffQuerySchema, responseSchema: ResumeRevisionDiffOutputSchema, successStatus: 200 }),
  materializeResumeArtifact: route({ operationId: 'materializeResumeArtifact', method: 'post', path: '/resume/revisions/:revisionId/artifacts', tags: ['Resume Builder'], summary: 'Materialize an immutable Resume artifact for one Revision', paramsSchema: IdParam('revisionId'), bodySchema: MaterializeResumeArtifactBodySchema, responseSchema: MaterializeResumeArtifactOutputSchema, successStatus: 200 }),
  downloadResumeArtifact: route({ operationId: 'downloadResumeArtifact', method: 'get', path: '/resume/artifacts/:artifactId/content', tags: ['Resume Builder'], summary: 'Download one verified Resume artifact', paramsSchema: IdParam('artifactId'), successStatus: 200, responseContentType: 'application/octet-stream', binaryResponse: true }),
  resumes: route({ operationId: 'listResumeUsage', method: 'get', path: '/resumes', tags: ['Resumes'], summary: 'List Submission-derived Resume Profile and Revision usage projections', querySchema: ListResumeUsageInputSchema, responseSchema: ListResumeUsageOutputSchema, successStatus: 200 }),
  savedViews: route({ operationId: 'listSavedViews', method: 'get', path: '/saved-views', tags: ['Saved Views'], summary: 'List durable Saved Views', querySchema: ListSavedViewsInputSchema, responseSchema: ListSavedViewsOutputSchema, successStatus: 200 }),
  upsertSavedView: route({ operationId: 'upsertSavedView', method: 'post', path: '/saved-views', tags: ['Saved Views'], summary: 'Create or update a durable Saved View', bodySchema: UpsertSavedViewInputSchema, responseSchema: SavedViewSchema, successStatus: 200 }),
  deleteSavedView: route({ operationId: 'deleteSavedView', method: 'delete', path: '/saved-views/:savedViewId', tags: ['Saved Views'], summary: 'Delete a durable Saved View', paramsSchema: IdParam('savedViewId'), responseSchema: DeleteSavedViewOutputSchema, successStatus: 200 }),
  beginDiscovery: route({ operationId: 'beginDiscovery', method: 'post', path: '/discovery', tags: ['Discovery'], summary: 'Begin an auditable DiscoveryRun', bodySchema: BeginDiscoveryInputSchema, responseSchema: BeginDiscoveryOutputSchema, successStatus: 201 }),
  completeDiscovery: route({ operationId: 'completeDiscovery', method: 'post', path: '/discovery/:runId/complete', tags: ['Discovery'], summary: 'Complete an existing DiscoveryRun', paramsSchema: IdParam('runId'), bodySchema: CompleteDiscoveryBodySchema, responseSchema: CompleteDiscoveryOutputSchema, successStatus: 200 }),
  discovery: route({ operationId: 'listDiscoveryRuns', method: 'get', path: '/discovery', tags: ['Discovery'], summary: 'List DiscoveryRun history', querySchema: ListDiscoveryRunsInputSchema, responseSchema: ListDiscoveryRunsOutputSchema, successStatus: 200 }),
  discoveryDetail: route({ operationId: 'getDiscoveryRunDetail', method: 'get', path: '/discovery/:runId', tags: ['Discovery'], summary: 'Read one DiscoveryRun projection', paramsSchema: IdParam('runId'), responseSchema: DiscoveryRunDetailSchema, successStatus: 200 }),
  export: route({ operationId: 'exportCareerState', method: 'get', path: '/export', tags: ['Data'], summary: 'Download a logical Career JSON snapshot', responseSchema: CareerExportSnapshotSchema, successStatus: 200, responseContentType: 'application/json' }),
  backup: route({ operationId: 'backupCareerDatabase', method: 'get', path: '/backup', tags: ['Data'], summary: 'Download a WAL-safe SQLite backup', successStatus: 200, responseContentType: 'application/vnd.sqlite3', binaryResponse: true }),
} as const satisfies Record<string, JobHarnessRestV1RouteContract>;

function jsonSchema(schema: ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _ignored, ...openApiSchema } = converted;
  return openApiSchema;
}

function parameters(schema: ZodType | undefined, location: 'path' | 'query'): Array<Record<string, unknown>> {
  if (!schema) return [];
  const converted = jsonSchema(schema);
  const properties = (converted.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(Array.isArray(converted.required) ? converted.required.map(String) : []);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === 'path' || required.has(name),
    schema: property,
    ...(location === 'query' && property.type === 'array' ? { style: 'form', explode: true } : {}),
  }));
}

function openApiPath(path: string): string {
  return `/api/v1${path.replace(/:(\w+)/g, '{$1}')}`;
}

export function generateJobHarnessOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const contract of Object.values(JOB_HARNESS_REST_V1_ROUTES)) {
    const path = openApiPath(contract.path);
    const operation: Record<string, unknown> = {
      operationId: contract.operationId,
      tags: [...contract.tags],
      summary: contract.summary,
      security: [{ bearerAuth: [] }],
      parameters: [
        ...parameters(contract.paramsSchema, 'path'),
        ...parameters(contract.querySchema, 'query'),
      ],
      responses: {
        [String(contract.successStatus)]: {
          description: 'Success',
          content: contract.binaryResponse
            ? {
                [contract.responseContentType ?? 'application/octet-stream']: {
                  schema: { type: 'string', format: 'binary' },
                },
              }
            : {
                [contract.responseContentType ?? 'application/json']: {
                  schema: contract.responseSchema ? jsonSchema(contract.responseSchema) : {},
                },
              },
        },
        '400': { description: 'Validation error', content: { 'application/json': { schema: jsonSchema(RestErrorEnvelopeSchema) } } },
        '401': { description: 'Bearer authentication required', content: { 'application/json': { schema: jsonSchema(RestErrorEnvelopeSchema) } } },
        '404': { description: 'Entity not found', content: { 'application/json': { schema: jsonSchema(RestErrorEnvelopeSchema) } } },
        '409': { description: 'Conflict or idempotency conflict', content: { 'application/json': { schema: jsonSchema(RestErrorEnvelopeSchema) } } },
        '422': { description: 'Invalid lifecycle transition', content: { 'application/json': { schema: jsonSchema(RestErrorEnvelopeSchema) } } },
        '500': { description: 'Internal server error', content: { 'application/json': { schema: jsonSchema(RestErrorEnvelopeSchema) } } },
      },
    };
    if (contract.bodySchema) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: jsonSchema(contract.bodySchema) } },
      };
    }
    if ((operation.parameters as unknown[]).length === 0) delete operation.parameters;
    (paths[path] ??= {})[contract.method] = operation;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Job Harness REST API',
      version: '1.0.0',
      description: 'Versioned transport projection of the canonical Job Harness contracts. Career state remains owned by Job Harness; this document is generated from the same Zod schemas used at runtime.',
      license: { name: 'MIT' },
    },
    servers: [{ url: 'https://oracle.taile92a8e.ts.net:20901', description: 'Current Tailnet-only Oracle2 deployment' }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Scoped/private Job Harness bearer credential.' },
      },
    },
    paths,
  };
}
