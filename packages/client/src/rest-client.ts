import {
  AnalyticsSnapshotSchema,
  BeginDiscoveryOutputSchema,
  CompleteDiscoveryOutputSchema,
  ApplicationWorkspaceDetailSchema,
  CompanyDetailSchema,
  DashboardSnapshotSchema,
  DeleteSavedViewOutputSchema,
  JobDetailSchema,
  JobSchema,
  JobSearchCampaignSchema,
  ListApplicationBoardOutputSchema,
  ListCampaignsOutputSchema,
  ListCompaniesOutputSchema,
  ListDiscoveryRunsOutputSchema,
  ListResumeUsageOutputSchema,
  ListSavedViewsOutputSchema,
  PipelineStatsOutputSchema,
  SavedViewSchema,
  SearchJobListItemsOutputSchema,
  UpsertJobsBatchOutputSchema,
  type AnalyticsSnapshot,
  type AnalyticsSnapshotInput,
  type BeginDiscoveryInput,
  type CompanyDetail,
  type CompleteDiscoveryInput,
  type DiscoveryRun,
  type DashboardSnapshot,
  type DashboardSnapshotInput,
  type Job,
  type JobDetail,
  type JobSearchCampaign,
  type ListApplicationBoardInput,
  type ListApplicationBoardOutput,
  type ListCampaignsInput,
  type ListCampaignsOutput,
  type ListCompaniesInput,
  type ListCompaniesOutput,
  type ListDiscoveryRunsInput,
  type ListDiscoveryRunsOutput,
  type ListResumeUsageInput,
  type ListResumeUsageOutput,
  type ListSavedViewsInput,
  type ListSavedViewsOutput,
  type PipelineStatsInput,
  type PipelineStatsOutput,
  type RecordApplicationInput,
  type SearchJobListItemsInput,
  type SearchJobListItemsOutput,
  type SavedView,
  type SetJobStateInput,
  type TransitionApplicationInput,
  type UpsertCampaignInput,
  type UpsertSavedViewInput,
  type UpsertJobsBatchInput,
  type UpsertJobsBatchOutput,
  RecordApplicationOutputSchema,
  TransitionApplicationOutputSchema,
  DiscoveryRunDetailSchema,
  type ApplicationWorkspaceDetail,
  type DiscoveryRunDetail,
} from '@job-harness/contracts';
import {
  ListResumeProfilesInputSchema,
  ListResumeProfilesOutputSchema,
  ResumePreviewInputSchema,
  ResumePreviewOutputSchema,
  ResumeProfileContextSchema,
  ResumeLibrarySchema,
  SaveResumeLibraryInputSchema,
  SaveResumeProfileInputSchema,
  ListResumeRevisionsOutputSchema,
  PublishResumeRevisionInputSchema,
  PublishResumeRevisionOutputSchema,
  ResumeRevisionDetailSchema,
  ResumeRevisionDiffOutputSchema,
  ResumeRevisionDiffQuerySchema,
  MaterializeResumeArtifactInputSchema,
  MaterializeResumeArtifactOutputSchema,
  type ListResumeProfilesInput,
  type ListResumeProfilesOutput,
  type ResumePreviewInput,
  type ResumePreviewOutput,
  type ResumeProfileContext,
  type SaveResumeLibraryInput,
  type SaveResumeProfileInput,
  type ListResumeRevisionsOutput,
  type PublishResumeRevisionInput,
  type PublishResumeRevisionOutput,
  type ResumeRevisionDetail,
  type ResumeRevisionDiffOutput,
  type ResumeRevisionDiffQuery,
  type MaterializeResumeArtifactInput,
  type MaterializeResumeArtifactOutput,
} from '@job-harness/resume-contracts';

export interface JobHarnessRestClientOptions {
  readonly baseUrl: string;
  readonly authToken?: string | null;
  readonly fetch?: typeof globalThis.fetch;
  readonly defaultInit?: RequestInit;
}

export interface JobHarnessRestErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly issues?: unknown;
}

export class JobHarnessRestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: JobHarnessRestErrorPayload,
  ) {
    super(payload.message);
    this.name = 'JobHarnessRestError';
  }
}

function normalizedBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function append(query: URLSearchParams, key: string, value: string | number | boolean | undefined): void {
  if (value === undefined) return;
  query.append(key, String(value));
}

function appendMany(query: URLSearchParams, key: string, values: readonly string[] | undefined): void {
  for (const value of values ?? []) query.append(key, value);
}

function companiesQuery(input: ListCompaniesInput): string {
  const query = new URLSearchParams();
  append(query, 'limit', input.limit);
  append(query, 'offset', input.offset);
  append(query, 'query', input.query);
  append(query, 'campaignId', input.campaignId);
  return query.toString();
}

function analyticsQuery(input: AnalyticsSnapshotInput): string {
  const query = new URLSearchParams();
  append(query, 'campaignId', input.campaignId);
  return query.toString();
}

function pipelineQuery(input: PipelineStatsInput): string {
  const query = new URLSearchParams();
  append(query, 'campaignId', input.campaignId);
  return query.toString();
}

function jobsQuery(input: SearchJobListItemsInput): string {
  const query = new URLSearchParams();
  append(query, 'limit', input.limit);
  append(query, 'offset', input.offset);
  append(query, 'company', input.company);
  append(query, 'title', input.title);
  append(query, 'city', input.city);
  append(query, 'applied', input.applied);
  append(query, 'campaignId', input.campaignId);
  appendMany(query, 'states', input.states);
  appendMany(query, 'sourceKinds', input.sourceKinds);
  return query.toString();
}

function applicationsQuery(input: ListApplicationBoardInput): string {
  const query = new URLSearchParams();
  append(query, 'limit', input.limit);
  append(query, 'offset', input.offset);
  append(query, 'company', input.company);
  appendMany(query, 'stages', input.stages);
  append(query, 'campaignId', input.campaignId);
  append(query, 'resumeProfileId', input.resumeProfileId);
  append(query, 'appliedFrom', input.appliedFrom);
  append(query, 'appliedTo', input.appliedTo);
  append(query, 'terminal', input.terminal);
  return query.toString();
}

function pageQuery(input: ListCampaignsInput): string {
  const query = new URLSearchParams();
  append(query, 'limit', input.limit);
  append(query, 'offset', input.offset);
  return query.toString();
}

function discoveryQuery(input: ListDiscoveryRunsInput): string {
  const query = new URLSearchParams();
  append(query, 'limit', input.limit);
  append(query, 'offset', input.offset);
  append(query, 'campaignId', input.campaignId);
  append(query, 'executor', input.executor);
  return query.toString();
}

function resumeQuery(input: ListResumeUsageInput): string {
  const query = new URLSearchParams();
  append(query, 'limit', input.limit);
  append(query, 'offset', input.offset);
  append(query, 'campaignId', input.campaignId);
  return query.toString();
}

function resumeProfilesQuery(input: ListResumeProfilesInput): string {
  const query = new URLSearchParams();
  append(query, 'libraryId', input.libraryId);
  append(query, 'includeArchived', input.includeArchived);
  return query.toString();
}

function dashboardQuery(input: DashboardSnapshotInput): string {
  const query = new URLSearchParams();
  append(query, 'campaignId', input.campaignId);
  append(query, 'recentDiscoveryLimit', input.recentDiscoveryLimit);
  append(query, 'attentionLimit', input.attentionLimit);
  return query.toString();
}

function savedViewsQuery(input: ListSavedViewsInput): string {
  const query = new URLSearchParams();
  append(query, 'limit', input.limit);
  append(query, 'offset', input.offset);
  append(query, 'workspace', input.workspace);
  return query.toString();
}

export function createJobHarnessRestClient(options: JobHarnessRestClientOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('A Fetch implementation is required');
  const baseUrl = normalizedBaseUrl(options.baseUrl);

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(options.defaultInit?.headers);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (options.authToken) headers.set('authorization', `Bearer ${options.authToken}`);
    if (init.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json');

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options.defaultInit,
      ...init,
      headers,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      const error = payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error: JobHarnessRestErrorPayload }).error
        : { code: 'HTTP_ERROR', message: `Job Harness request failed with ${response.status}` };
      throw new JobHarnessRestError(response.status, error);
    }
    return payload;
  }

  async function nullable<T>(work: () => Promise<T>): Promise<T | null> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof JobHarnessRestError && error.status === 404) return null;
      throw error;
    }
  }

  return {
    resume: {
      async listProfiles(input: ListResumeProfilesInput = {}): Promise<ListResumeProfilesOutput> {
        const parsed = ListResumeProfilesInputSchema.parse(input);
        const query = resumeProfilesQuery(parsed);
        return ListResumeProfilesOutputSchema.parse(await request(`/resume/profiles${query ? `?${query}` : ""}`));
      },
      async getProfileContext(profileId: string): Promise<ResumeProfileContext | null> {
        return nullable(async () => ResumeProfileContextSchema.parse(await request(`/resume/profiles/${encodeURIComponent(profileId)}`)));
      },
      async preview(input: ResumePreviewInput): Promise<ResumePreviewOutput> {
        const parsed = ResumePreviewInputSchema.parse(input);
        return ResumePreviewOutputSchema.parse(await request('/resume/preview', { method: 'POST', body: JSON.stringify(parsed) }));
      },
      async saveProfile(input: SaveResumeProfileInput): Promise<ResumeProfileContext> {
        const parsed = SaveResumeProfileInputSchema.parse(input);
        return ResumeProfileContextSchema.parse(await request(`/resume/profiles/${encodeURIComponent(parsed.profile.id)}`, { method: 'PUT', body: JSON.stringify(parsed) }));
      },
      async saveLibrary(input: SaveResumeLibraryInput) {
        const parsed = SaveResumeLibraryInputSchema.parse(input);
        return ResumeLibrarySchema.parse(await request(`/resume/libraries/${encodeURIComponent(parsed.library.id)}`, { method: 'PUT', body: JSON.stringify(parsed) }));
      },
      async listRevisions(profileId: string): Promise<ListResumeRevisionsOutput> {
        return ListResumeRevisionsOutputSchema.parse(await request(`/resume/profiles/${encodeURIComponent(profileId)}/revisions`));
      },
      async publishRevision(input: PublishResumeRevisionInput): Promise<PublishResumeRevisionOutput> {
        const parsed = PublishResumeRevisionInputSchema.parse(input);
        return PublishResumeRevisionOutputSchema.parse(await request(`/resume/profiles/${encodeURIComponent(parsed.profileId)}/revisions`, {
          method: 'POST',
          body: JSON.stringify({ expectedProfileVersion: parsed.expectedProfileVersion, expectedLibraryVersion: parsed.expectedLibraryVersion, note: parsed.note ?? null }),
        }));
      },
      async getRevision(revisionId: string): Promise<ResumeRevisionDetail | null> {
        return nullable(async () => ResumeRevisionDetailSchema.parse(await request(`/resume/revisions/${encodeURIComponent(revisionId)}`)));
      },
      async diffRevision(revisionId: string, input: ResumeRevisionDiffQuery = {}): Promise<ResumeRevisionDiffOutput | null> {
        const parsed = ResumeRevisionDiffQuerySchema.parse(input);
        const query = new URLSearchParams();
        append(query, 'against', parsed.against);
        const suffix = query.toString();
        return nullable(async () => ResumeRevisionDiffOutputSchema.parse(await request(`/resume/revisions/${encodeURIComponent(revisionId)}/diff${suffix ? `?${suffix}` : ''}`)));
      },
      async materializeArtifact(input: MaterializeResumeArtifactInput): Promise<MaterializeResumeArtifactOutput> {
        const parsed = MaterializeResumeArtifactInputSchema.parse(input);
        return MaterializeResumeArtifactOutputSchema.parse(await request(`/resume/revisions/${encodeURIComponent(parsed.revisionId)}/artifacts`, {
          method: 'POST',
          body: JSON.stringify({ kind: parsed.kind }),
        }));
      },
    },
    analytics: {
      async getPipelineStats(input: PipelineStatsInput = {}): Promise<PipelineStatsOutput> {
        const query = pipelineQuery(input);
        return PipelineStatsOutputSchema.parse(await request(`/pipeline${query ? `?${query}` : ''}`));
      },
    },
    workspace: {
      async listCompanies(input: ListCompaniesInput = {}): Promise<ListCompaniesOutput> {
        const query = companiesQuery(input);
        return ListCompaniesOutputSchema.parse(await request(`/companies${query ? `?${query}` : ''}`));
      },
      async getCompanyDetail(companyId: string, campaignId?: string): Promise<CompanyDetail | null> {
        const query = new URLSearchParams();
        append(query, 'campaignId', campaignId);
        const encoded = query.toString();
        return nullable(async () => CompanyDetailSchema.parse(await request(`/companies/${encodeURIComponent(companyId)}${encoded ? `?${encoded}` : ''}`)));
      },
      async getAnalyticsSnapshot(input: AnalyticsSnapshotInput = {}): Promise<AnalyticsSnapshot> {
        const query = analyticsQuery(input);
        return AnalyticsSnapshotSchema.parse(await request(`/analytics${query ? `?${query}` : ''}`));
      },
      async searchJobListItems(input: SearchJobListItemsInput = {}): Promise<SearchJobListItemsOutput> {
        const query = jobsQuery(input);
        return SearchJobListItemsOutputSchema.parse(await request(`/jobs${query ? `?${query}` : ''}`));
      },
      async getJobDetail(jobId: string): Promise<JobDetail | null> {
        return nullable(async () => JobDetailSchema.parse(await request(`/jobs/${encodeURIComponent(jobId)}`)));
      },
      async listApplicationBoard(input: ListApplicationBoardInput = {}): Promise<ListApplicationBoardOutput> {
        const query = applicationsQuery(input);
        return ListApplicationBoardOutputSchema.parse(await request(`/applications${query ? `?${query}` : ''}`));
      },
      async getApplicationWorkspaceDetail(applicationId: string): Promise<ApplicationWorkspaceDetail | null> {
        return nullable(async () => ApplicationWorkspaceDetailSchema.parse(await request(`/applications/${encodeURIComponent(applicationId)}`)));
      },
      async getDashboardSnapshot(input: DashboardSnapshotInput = {}): Promise<DashboardSnapshot> {
        const query = dashboardQuery(input);
        return DashboardSnapshotSchema.parse(await request(`/dashboard${query ? `?${query}` : ''}`));
      },
      async listResumeUsage(input: ListResumeUsageInput = {}): Promise<ListResumeUsageOutput> {
        const query = resumeQuery(input);
        return ListResumeUsageOutputSchema.parse(await request(`/resumes${query ? `?${query}` : ''}`));
      },
      async listDiscoveryRuns(input: ListDiscoveryRunsInput = {}): Promise<ListDiscoveryRunsOutput> {
        const query = discoveryQuery(input);
        return ListDiscoveryRunsOutputSchema.parse(await request(`/discovery${query ? `?${query}` : ''}`));
      },
      async getDiscoveryRunDetail(runId: string): Promise<DiscoveryRunDetail | null> {
        return nullable(async () => DiscoveryRunDetailSchema.parse(await request(`/discovery/${encodeURIComponent(runId)}`)));
      },
    },
    jobs: {
      async upsertJobsBatch(input: UpsertJobsBatchInput): Promise<UpsertJobsBatchOutput> {
        return UpsertJobsBatchOutputSchema.parse(await request('/jobs/batch', {
          method: 'POST',
          body: JSON.stringify(input),
        }));
      },
      async setJobState(input: SetJobStateInput): Promise<Job> {
        return JobSchema.parse(await request(`/jobs/${encodeURIComponent(input.jobId)}/state`, {
          method: 'PATCH',
          body: JSON.stringify({ state: input.state, idempotencyKey: input.idempotencyKey }),
        }));
      },
    },
    applications: {
      async record(input: RecordApplicationInput) {
        return RecordApplicationOutputSchema.parse(await request('/applications', {
          method: 'POST',
          body: JSON.stringify(input),
        }));
      },
      async transition(input: TransitionApplicationInput) {
        return TransitionApplicationOutputSchema.parse(await request(`/applications/${encodeURIComponent(input.applicationId)}/transition`, {
          method: 'POST',
          body: JSON.stringify({
            toStage: input.toStage,
            occurredAt: input.occurredAt,
            idempotencyKey: input.idempotencyKey,
            actor: input.actor,
            note: input.note,
          }),
        }));
      },
    },
    campaigns: {
      async list(input: ListCampaignsInput = {}): Promise<ListCampaignsOutput> {
        const query = pageQuery(input);
        return ListCampaignsOutputSchema.parse(await request(`/campaigns${query ? `?${query}` : ''}`));
      },
      async get(campaignId: string): Promise<JobSearchCampaign | null> {
        return nullable(async () => JobSearchCampaignSchema.parse(await request(`/campaigns/${encodeURIComponent(campaignId)}`)));
      },
      async upsert(input: UpsertCampaignInput): Promise<JobSearchCampaign> {
        return JobSearchCampaignSchema.parse(await request(`/campaigns/${encodeURIComponent(input.id)}`, {
          method: 'PUT',
          body: JSON.stringify(input),
        }));
      },
    },
    discovery: {
      async begin(input: BeginDiscoveryInput): Promise<DiscoveryRun> {
        return BeginDiscoveryOutputSchema.parse(await request('/discovery', {
          method: 'POST',
          body: JSON.stringify(input),
        }));
      },
      async complete(input: CompleteDiscoveryInput): Promise<DiscoveryRun> {
        return CompleteDiscoveryOutputSchema.parse(await request(`/discovery/${encodeURIComponent(input.runId)}/complete`, {
          method: 'POST',
          body: JSON.stringify({
            completedAt: input.completedAt,
            candidateCount: input.candidateCount,
            insertedCount: input.insertedCount,
            duplicateCount: input.duplicateCount,
            rejectedCount: input.rejectedCount,
          }),
        }));
      },
    },
    savedViews: {
      async list(input: ListSavedViewsInput = {}): Promise<ListSavedViewsOutput> {
        const query = savedViewsQuery(input);
        return ListSavedViewsOutputSchema.parse(await request(`/saved-views${query ? `?${query}` : ''}`));
      },
      async upsert(input: UpsertSavedViewInput): Promise<SavedView> {
        return SavedViewSchema.parse(await request('/saved-views', {
          method: 'POST',
          body: JSON.stringify(input),
        }));
      },
      async delete(savedViewId: string): Promise<{ deleted: boolean }> {
        return DeleteSavedViewOutputSchema.parse(
          await request(`/saved-views/${encodeURIComponent(savedViewId)}`, { method: 'DELETE' }),
        );
      },
    },
  };
}

export type JobHarnessRestClient = ReturnType<typeof createJobHarnessRestClient>;
