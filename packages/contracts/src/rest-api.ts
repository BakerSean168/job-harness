import { z, type ZodType } from 'zod';
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
import { EntityIdSchema } from './schemas';
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

export const RestErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.unknown().optional(),
  }).strict(),
}).strict();

const route = (contract: JobHarnessRestV1RouteContract): JobHarnessRestV1RouteContract => contract;

export const JOB_HARNESS_REST_V1_ROUTES = {
  analytics: route({ operationId: 'getAnalyticsSnapshot', method: 'get', path: '/analytics', tags: ['Analytics'], summary: 'Read the analytics snapshot', querySchema: AnalyticsSnapshotInputSchema, responseSchema: AnalyticsSnapshotSchema, successStatus: 200 }),
  pipeline: route({ operationId: 'getPipelineStats', method: 'get', path: '/pipeline', tags: ['Analytics'], summary: 'Read canonical pipeline statistics', querySchema: PipelineStatsInputSchema, responseSchema: PipelineStatsOutputSchema, successStatus: 200 }),
  dashboard: route({ operationId: 'getDashboardSnapshot', method: 'get', path: '/dashboard', tags: ['Dashboard'], summary: 'Read the operational dashboard snapshot', querySchema: DashboardSnapshotInputSchema, responseSchema: DashboardSnapshotSchema, successStatus: 200 }),
  companies: route({ operationId: 'listCompanies', method: 'get', path: '/companies', tags: ['Companies'], summary: 'List company workspace projections', querySchema: ListCompaniesInputSchema, responseSchema: ListCompaniesOutputSchema, successStatus: 200 }),
  companyDetail: route({ operationId: 'getCompanyDetail', method: 'get', path: '/companies/:companyId', tags: ['Companies'], summary: 'Read one company workspace projection', paramsSchema: IdParam('companyId'), querySchema: OptionalCampaignQuerySchema, responseSchema: CompanyDetailSchema, successStatus: 200 }),
  jobs: route({ operationId: 'searchJobs', method: 'get', path: '/jobs', tags: ['Jobs'], summary: 'Search durable job projections', querySchema: SearchJobListItemsInputSchema, responseSchema: SearchJobListItemsOutputSchema, successStatus: 200 }),
  jobDetail: route({ operationId: 'getJobDetail', method: 'get', path: '/jobs/:jobId', tags: ['Jobs'], summary: 'Read one job detail projection', paramsSchema: IdParam('jobId'), responseSchema: JobDetailSchema, successStatus: 200 }),
  upsertJobsBatch: route({ operationId: 'upsertJobsBatch', method: 'post', path: '/jobs/batch', tags: ['Jobs'], summary: 'Idempotently upsert discovered jobs', bodySchema: UpsertJobsBatchInputSchema, responseSchema: UpsertJobsBatchOutputSchema, successStatus: 200 }),
  setJobState: route({ operationId: 'setJobState', method: 'patch', path: '/jobs/:jobId/state', tags: ['Jobs'], summary: 'Change a job triage state', paramsSchema: IdParam('jobId'), bodySchema: SetJobStateBodySchema, responseSchema: SetJobStateOutputSchema, successStatus: 200 }),
  applications: route({ operationId: 'listApplications', method: 'get', path: '/applications', tags: ['Applications'], summary: 'List application board projections', querySchema: ListApplicationBoardInputSchema, responseSchema: ListApplicationBoardOutputSchema, successStatus: 200 }),
  applicationDetail: route({ operationId: 'getApplicationDetail', method: 'get', path: '/applications/:applicationId', tags: ['Applications'], summary: 'Read one application workspace projection', paramsSchema: IdParam('applicationId'), responseSchema: ApplicationWorkspaceDetailSchema, successStatus: 200 }),
  recordApplication: route({ operationId: 'recordApplication', method: 'post', path: '/applications', tags: ['Applications'], summary: 'Record an application against a known job', bodySchema: RecordApplicationInputSchema, responseSchema: RecordApplicationOutputSchema, successStatus: 201 }),
  transitionApplication: route({ operationId: 'transitionApplication', method: 'post', path: '/applications/:applicationId/transition', tags: ['Applications'], summary: 'Transition an application lifecycle stage', paramsSchema: IdParam('applicationId'), bodySchema: TransitionApplicationBodySchema, responseSchema: TransitionApplicationOutputSchema, successStatus: 200 }),
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
