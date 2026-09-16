import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  Application,
  ApplicationDetail,
  ApplicationWorkspaceDetail,
  ApplicationEvent,
  Company,
  DashboardSnapshot,
  DashboardSnapshotInput,
  DiscoveryRun,
  DiscoveryRunDetail,
  DuplicateCheckInput,
  DuplicateCheckOutput,
  Job,
  JobListing,
  JobListingCandidate,
  JobObservation,
  JobDetail,
  JobListItem,
  JobSearchCampaign,
  ListApplicationBoardInput,
  ListApplicationBoardOutput,
  ListApplicationsInput,
  ListApplicationsOutput,
  ListCampaignsInput,
  ListCampaignsOutput,
  ListResumesInput,
  ListResumesOutput,
  ListDiscoveryRunsInput,
  ListDiscoveryRunsOutput,
  ListResumeUsageInput,
  ListResumeUsageOutput,
  PipelineStatsInput,
  PipelineStatsOutput,
  ResumeProfileRef,
  SearchJobsInput,
  SearchJobsOutput,
  SearchJobListItemsInput,
  SearchJobListItemsOutput,
  UpsertJobCandidate,
} from '@job-harness/contracts';
import {
  ApplicationBoardItemSchema,
  ApplicationDetailSchema,
  ApplicationWorkspaceDetailSchema,
  ApplicationEventSchema,
  ApplicationSchema,
  CampaignRefSchema,
  CompanySchema,
  DashboardSnapshotSchema,
  DiscoveryRunDetailSchema,
  DiscoveryRunSchema,
  JobDetailSchema,
  JobListItemSchema,
  JobListingSchema,
  JobObservationSchema,
  JobSchema,
  JobSearchCampaignSchema,
  ListApplicationBoardOutputSchema,
  ListDiscoveryRunsOutputSchema,
  ListResumeUsageOutputSchema,
  ResumeProfileRefSchema,
  ResumeUsageSummarySchema,
} from '@job-harness/contracts';
import type {
  CareerStorePort,
  CareerStoreReadPort,
  CareerStoreTransactionPort,
  IdempotencyReceipt,
} from '@job-harness/application';
import {
  APPLICATION_STAGES,
  JOB_STATES,
  buildJobListingIdentityKey,
  normalizeCanonicalUrl,
  normalizeIdentityText,
  type ApplicationStage,
  type JobState,
} from '@job-harness/domain';
import { migrateSqliteDatabase } from './schema';

type Row = Record<string, unknown>;

function json<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}


function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

class SqliteCareerSession implements CareerStoreTransactionPort {
  constructor(private readonly db: DatabaseSync) {}

  private companyById(id: string): Company | null {
    const row = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Row | undefined;
    if (!row) return null;
    const aliases = (this.db.prepare('SELECT alias FROM company_aliases WHERE company_id = ? ORDER BY alias').all(id) as Row[]).map((entry) => String(entry.alias));
    return CompanySchema.parse({ id: row.id, name: row.name, aliases, createdAt: row.created_at, updatedAt: row.updated_at });
  }

  private listingFromRow(row: Row): JobListing {
    return JobListingSchema.parse({
      id: row.id,
      jobId: row.job_id,
      sourceKind: row.source_kind,
      label: row.label,
      url: row.url,
      externalNamespace: row.external_namespace,
      externalId: row.external_id,
      identityKind: row.identity_kind,
      status: row.status,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      publishedAt: row.published_at,
      closedAt: row.closed_at,
      metadataSnapshot: json(row.metadata_snapshot_json),
    });
  }

  private listingsByJobId(jobId: string): JobListing[] {
    return (this.db.prepare('SELECT * FROM job_listings WHERE job_id = ? ORDER BY last_seen_at DESC, id').all(jobId) as Row[])
      .map((row) => this.listingFromRow(row));
  }

  private jobFromRow(row: Row): Job {
    const company = this.companyById(String(row.company_id));
    if (!company) throw new Error(`Company '${String(row.company_id)}' is missing for Job '${String(row.id)}'`);
    return JobSchema.parse({
      id: row.id,
      companyId: row.company_id,
      companyName: company.name,
      title: row.title,
      city: row.city,
      state: row.state,
      description: row.description,
      listings: this.listingsByJobId(String(row.id)),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private primaryListing(job: Job): JobListing | null {
    const statusRank: Record<JobListing['status'], number> = { active: 0, unknown: 1, closed: 2 };
    const sourceRank: Record<string, number> = {
      official: 0,
      moka: 1,
      greenhouse: 2,
      lever: 3,
      ashby: 4,
      boss: 5,
      zhilian: 6,
      liepin: 7,
      email: 8,
      manual: 9,
      other: 10,
    };
    return [...job.listings].sort((left, right) =>
      statusRank[left.status] - statusRank[right.status]
      || Number(Boolean(right.url)) - Number(Boolean(left.url))
      || (sourceRank[left.sourceKind] ?? 99) - (sourceRank[right.sourceKind] ?? 99)
      || right.lastSeenAt.localeCompare(left.lastSeenAt)
      || left.id.localeCompare(right.id)
    )[0] ?? null;
  }

  private campaignRefsForJob(jobId: string) {
    const rows = this.db.prepare(`
      SELECT DISTINCT c.id, c.name, c.status
      FROM campaigns c
      JOIN discovery_runs d ON d.campaign_id = c.id
      JOIN job_observations o ON o.discovery_run_id = d.id
      WHERE o.job_id = ?
      ORDER BY c.name, c.id
    `).all(jobId) as Row[];
    return rows.map((row) => CampaignRefSchema.parse({ id: row.id, name: row.name, status: row.status }));
  }

  private campaignRefById(campaignId: string | null) {
    if (!campaignId) return null;
    const row = this.db.prepare('SELECT id,name,status FROM campaigns WHERE id = ?').get(campaignId) as Row | undefined;
    return row ? CampaignRefSchema.parse({ id: row.id, name: row.name, status: row.status }) : null;
  }

  private async jobListItemFromJob(job: Job): Promise<JobListItem> {
    const application = await this.findApplicationByJobId(job.id);
    const resume = application?.resumeProfileId ? await this.getResumeProfile(application.resumeProfileId) : null;
    return JobListItemSchema.parse({
      jobId: job.id,
      companyId: job.companyId,
      companyName: job.companyName,
      title: job.title,
      city: job.city,
      state: job.state,
      application: application ? {
        id: application.id,
        currentStage: application.currentStage,
        appliedAt: application.appliedAt,
        resumeProfileId: application.resumeProfileId,
        updatedAt: application.updatedAt,
      } : null,
      primaryListing: this.primaryListing(job),
      listingCount: job.listings.length,
      sourceKinds: [...new Set(job.listings.map((listing) => listing.sourceKind))].sort(),
      campaigns: this.campaignRefsForJob(job.id),
      resume,
      firstSeenAt: job.firstSeenAt,
      lastSeenAt: job.lastSeenAt,
    });
  }

  private applicationFromRow(row: Row): Application {
    return ApplicationSchema.parse({
      id: row.id,
      jobId: row.job_id,
      currentStage: row.current_stage,
      appliedAt: row.applied_at,
      resumeProfileId: row.resume_profile_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  async searchJobs(input: SearchJobsInput): Promise<SearchJobsOutput> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (input.company) {
      where.push(`EXISTS (SELECT 1 FROM companies c LEFT JOIN company_aliases ca ON ca.company_id = c.id WHERE c.id = j.company_id AND (c.normalized_name LIKE ? OR ca.normalized_alias LIKE ?))`);
      const q = `%${normalizeIdentityText(input.company)}%`;
      params.push(q, q);
    }
    if (input.title) { where.push('j.normalized_title LIKE ?'); params.push(`%${normalizeIdentityText(input.title)}%`); }
    if (input.city) { where.push('j.normalized_city LIKE ?'); params.push(`%${normalizeIdentityText(input.city)}%`); }
    if (input.states?.length) {
      where.push(`j.state IN (${input.states.map(() => '?').join(',')})`);
      params.push(...input.states);
    }
    if (input.sourceKinds?.length) {
      where.push(`EXISTS (SELECT 1 FROM job_listings jl WHERE jl.job_id = j.id AND jl.source_kind IN (${input.sourceKinds.map(() => '?').join(',')}))`);
      params.push(...input.sourceKinds);
    }
    if (input.applied !== undefined) {
      where.push(`${input.applied ? '' : 'NOT '}EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)`);
    }
    if (input.campaignId) {
      where.push(`EXISTS (
        SELECT 1 FROM job_observations o
        JOIN discovery_runs d ON d.id = o.discovery_run_id
        WHERE o.job_id = j.id AND d.campaign_id = ?
      )`);
      params.push(input.campaignId);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS n FROM jobs j ${clause}`).get(...params) as Row).n);
    const rows = this.db.prepare(`SELECT j.* FROM jobs j ${clause} ORDER BY j.last_seen_at DESC, j.id LIMIT ? OFFSET ?`).all(...params, input.limit ?? 50, input.offset ?? 0) as Row[];
    return { items: rows.map((row) => this.jobFromRow(row)), total };
  }

  async getJob(jobId: string): Promise<Job | null> {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as Row | undefined;
    return row ? this.jobFromRow(row) : null;
  }

  async findDuplicate(input: DuplicateCheckInput): Promise<DuplicateCheckOutput> {
    const strongOwners = new Map<string, { row: Row; matchedBy: 'listing-external-id' | 'listing-url' }>();
    for (const listing of input.listings ?? []) {
      const identityKey = buildJobListingIdentityKey({
        sourceKind: listing.sourceKind,
        identityKind: listing.identityKind,
        url: listing.url ?? null,
        externalNamespace: listing.externalNamespace ?? null,
        externalId: listing.externalId ?? null,
      });
      if (!identityKey) continue;
      const row = this.db.prepare(`
        SELECT j.* FROM job_listings jl
        JOIN jobs j ON j.id = jl.job_id
        WHERE jl.identity_key = ? LIMIT 1
      `).get(identityKey) as Row | undefined;
      if (row) {
        strongOwners.set(String(row.id), {
          row,
          matchedBy: listing.identityKind === 'external-id' ? 'listing-external-id' : 'listing-url',
        });
      }
    }

    if (strongOwners.size === 1) {
      const owner = [...strongOwners.values()][0]!;
      return {
        duplicate: true,
        job: this.jobFromRow(owner.row),
        matchedBy: owner.matchedBy,
        potentialMatches: [],
        identityConflict: false,
      };
    }
    if (strongOwners.size > 1) {
      return {
        duplicate: false,
        job: null,
        matchedBy: null,
        potentialMatches: [...strongOwners.values()].map((owner) => this.jobFromRow(owner.row)),
        identityConflict: true,
      };
    }

    const company = normalizeIdentityText(input.companyName);
    const title = normalizeIdentityText(input.title);
    const city = normalizeIdentityText(input.city ?? '');
    const rows = this.db.prepare(`
      SELECT DISTINCT j.* FROM jobs j
      JOIN companies c ON c.id = j.company_id
      LEFT JOIN company_aliases ca ON ca.company_id = c.id
      WHERE (c.normalized_name = ? OR ca.normalized_alias = ?)
        AND j.normalized_title = ? AND j.normalized_city = ?
      ORDER BY j.last_seen_at DESC, j.id
      LIMIT 20
    `).all(company, company, title, city) as Row[];
    return {
      duplicate: false,
      job: null,
      matchedBy: null,
      potentialMatches: rows.map((row) => this.jobFromRow(row)),
      identityConflict: false,
    };
  }

  async listApplications(input: ListApplicationsInput): Promise<ListApplicationsOutput> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (input.stages?.length) {
      where.push(`a.current_stage IN (${input.stages.map(() => '?').join(',')})`);
      params.push(...input.stages);
    }
    if (input.company) {
      where.push(`(c.normalized_name LIKE ? OR EXISTS (SELECT 1 FROM company_aliases ca WHERE ca.company_id = c.id AND ca.normalized_alias LIKE ?))`);
      const q = `%${normalizeIdentityText(input.company)}%`; params.push(q, q);
    }
    if (input.campaignId) {
      where.push(`EXISTS (
        SELECT 1 FROM job_observations o
        JOIN discovery_runs d ON d.id = o.discovery_run_id
        WHERE o.job_id = j.id AND d.campaign_id = ?
      )`);
      params.push(input.campaignId);
    }
    if (input.resumeProfileId) {
      where.push('a.resume_profile_id = ?');
      params.push(input.resumeProfileId);
    }
    if (input.appliedFrom) {
      where.push('a.applied_at >= ?');
      params.push(input.appliedFrom);
    }
    if (input.appliedTo) {
      where.push('a.applied_at <= ?');
      params.push(input.appliedTo);
    }
    if (input.terminal === 'exclude') {
      where.push(`a.current_stage NOT IN ('rejected','withdrawn')`);
    } else if (input.terminal === 'only') {
      where.push(`a.current_stage IN ('rejected','withdrawn')`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS n FROM applications a JOIN jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id ${clause}`).get(...params) as Row).n);
    const rows = this.db.prepare(`SELECT a.* FROM applications a JOIN jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id ${clause} ORDER BY a.updated_at DESC, a.id LIMIT ? OFFSET ?`).all(...params, input.limit ?? 50, input.offset ?? 0) as Row[];
    const items = [];
    for (const row of rows) {
      const job = await this.getJob(String(row.job_id));
      if (!job) throw new Error(`Job '${String(row.job_id)}' is missing for Application '${String(row.id)}'`);
      items.push({ application: this.applicationFromRow(row), job });
    }
    return { items, total };
  }

  async getApplication(applicationId: string): Promise<ApplicationDetail | null> {
    const row = this.db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as Row | undefined;
    if (!row) return null;
    const job = await this.getJob(String(row.job_id));
    if (!job) throw new Error(`Job '${String(row.job_id)}' is missing for Application '${applicationId}'`);
    const timeline = (this.db.prepare('SELECT * FROM application_events WHERE application_id = ? ORDER BY occurred_at, id').all(applicationId) as Row[]).map((event) => ApplicationEventSchema.parse({
      id: event.id,
      applicationId: event.application_id,
      type: event.type,
      stage: event.stage,
      occurredAt: event.occurred_at,
      actor: event.actor,
      idempotencyKey: event.idempotency_key,
      note: event.note,
    }));
    return ApplicationDetailSchema.parse({ application: this.applicationFromRow(row), job, timeline });
  }

  async findApplicationByJobId(jobId: string): Promise<Application | null> {
    const row = this.db.prepare('SELECT * FROM applications WHERE job_id = ?').get(jobId) as Row | undefined;
    return row ? this.applicationFromRow(row) : null;
  }

  async listCampaigns(input: ListCampaignsInput): Promise<ListCampaignsOutput> {
    const total = Number((this.db.prepare('SELECT COUNT(*) AS n FROM campaigns').get() as Row).n);
    const rows = this.db.prepare('SELECT * FROM campaigns ORDER BY updated_at DESC, id LIMIT ? OFFSET ?').all(input.limit ?? 50, input.offset ?? 0) as Row[];
    return { items: rows.map((row) => this.campaignFromRow(row)), total };
  }

  private campaignFromRow(row: Row): JobSearchCampaign {
    return JobSearchCampaignSchema.parse({
      id: row.id, name: row.name,
      targetRoles: json(row.target_roles_json), cities: json(row.cities_json), graduationYears: json(row.graduation_years_json),
      experience: json(row.experience_json), keywords: json(row.keywords_json), exclusions: json(row.exclusions_json),
      sources: json(row.sources_json), resumeProfileIds: json(row.resume_profile_ids_json), status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at,
    });
  }

  async getCampaign(campaignId: string): Promise<JobSearchCampaign | null> {
    const row = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as Row | undefined;
    return row ? this.campaignFromRow(row) : null;
  }

  async listResumeProfiles(input: ListResumesInput): Promise<ListResumesOutput> {
    const total = Number((this.db.prepare('SELECT COUNT(*) AS n FROM resume_profile_refs').get() as Row).n);
    const rows = this.db.prepare('SELECT * FROM resume_profile_refs ORDER BY updated_at DESC, id LIMIT ? OFFSET ?').all(input.limit ?? 50, input.offset ?? 0) as Row[];
    return { items: rows.map((row) => this.resumeFromRow(row)), total };
  }

  private resumeFromRow(row: Row): ResumeProfileRef {
    return ResumeProfileRefSchema.parse({ id: row.id, name: row.name, source: row.source, externalProfileId: row.external_profile_id, targetRole: row.target_role, version: row.version, hash: row.hash, artifactUri: row.artifact_uri, updatedAt: row.updated_at });
  }

  async getResumeProfile(resumeProfileId: string): Promise<ResumeProfileRef | null> {
    const row = this.db.prepare('SELECT * FROM resume_profile_refs WHERE id = ?').get(resumeProfileId) as Row | undefined;
    return row ? this.resumeFromRow(row) : null;
  }

  private discoveryFromRow(row: Row): DiscoveryRun {
    return DiscoveryRunSchema.parse({ id: row.id, campaignId: row.campaign_id, executor: row.executor, contextSnapshot: json(row.context_snapshot_json), startedAt: row.started_at, completedAt: row.completed_at, candidateCount: Number(row.candidate_count), insertedCount: Number(row.inserted_count), duplicateCount: Number(row.duplicate_count), rejectedCount: Number(row.rejected_count) });
  }

  async getDiscoveryRun(runId: string): Promise<DiscoveryRun | null> {
    const row = this.db.prepare('SELECT * FROM discovery_runs WHERE id = ?').get(runId) as Row | undefined;
    return row ? this.discoveryFromRow(row) : null;
  }

  async getPipelineStats(input: PipelineStatsInput): Promise<PipelineStatsOutput> {
    const campaignClause = input.campaignId ? ` AND EXISTS (SELECT 1 FROM job_observations o JOIN discovery_runs d ON d.id = o.discovery_run_id WHERE o.job_id = j.id AND d.campaign_id = ?)` : '';
    const campaignParams = input.campaignId ? [input.campaignId] : [];
    const knownJobs = Number((this.db.prepare(`SELECT COUNT(*) AS n FROM jobs j WHERE 1=1${campaignClause}`).get(...campaignParams) as Row).n);
    const applications = Number((this.db.prepare(`SELECT COUNT(*) AS n FROM applications a JOIN jobs j ON j.id = a.job_id WHERE 1=1${campaignClause}`).get(...campaignParams) as Row).n);
    const jobsByState = Object.fromEntries(JOB_STATES.map((state: JobState) => [state, 0])) as Record<JobState, number>;
    for (const row of this.db.prepare(`SELECT j.state AS k, COUNT(*) AS n FROM jobs j WHERE 1=1${campaignClause} GROUP BY j.state`).all(...campaignParams) as Row[]) jobsByState[row.k as JobState] = Number(row.n);
    const applicationsByStage = Object.fromEntries(APPLICATION_STAGES.map((stage: ApplicationStage) => [stage, 0])) as Record<ApplicationStage, number>;
    for (const row of this.db.prepare(`SELECT a.current_stage AS k, COUNT(*) AS n FROM applications a JOIN jobs j ON j.id = a.job_id WHERE 1=1${campaignClause} GROUP BY a.current_stage`).all(...campaignParams) as Row[]) applicationsByStage[row.k as ApplicationStage] = Number(row.n);
    return { knownJobs, applications, jobsByState, applicationsByStage };
  }

  private stageEnteredAt(application: Application, timeline: ApplicationEvent[]): string {
    if (application.currentStage === 'applied') {
      return timeline.find((event) => event.type === 'application_recorded')?.occurredAt ?? application.appliedAt;
    }
    const transition = [...timeline].reverse().find((event) =>
      event.type === 'stage_changed' && event.stage === application.currentStage
    );
    return transition?.occurredAt ?? application.appliedAt;
  }

  async listApplicationBoard(input: ListApplicationBoardInput): Promise<ListApplicationBoardOutput> {
    const page = await this.listApplications(input);
    const items = await Promise.all(page.items.map(async ({ application, job }) => {
      const detail = await this.getApplication(application.id);
      if (!detail) throw new Error(`Application '${application.id}' disappeared during board projection`);
      const resume = application.resumeProfileId ? await this.getResumeProfile(application.resumeProfileId) : null;
      const latestEvent = detail.timeline.length ? detail.timeline[detail.timeline.length - 1]! : null;
      return ApplicationBoardItemSchema.parse({
        application,
        companyId: job.companyId,
        companyName: job.companyName,
        title: job.title,
        city: job.city,
        jobState: job.state,
        primaryListing: this.primaryListing(job),
        campaigns: this.campaignRefsForJob(job.id),
        resume,
        latestEvent,
        stageEnteredAt: this.stageEnteredAt(application, detail.timeline),
        submissionCount: detail.timeline.filter((event) =>
          event.type === 'application_recorded' || event.type === 'submission_recorded'
        ).length,
      });
    }));
    return ListApplicationBoardOutputSchema.parse({ items, total: page.total });
  }

  async getApplicationWorkspaceDetail(applicationId: string): Promise<ApplicationWorkspaceDetail | null> {
    const detail = await this.getApplication(applicationId);
    if (!detail) return null;
    const resume = detail.application.resumeProfileId
      ? await this.getResumeProfile(detail.application.resumeProfileId)
      : null;
    const latestEvent = detail.timeline.length ? detail.timeline[detail.timeline.length - 1]! : null;
    return ApplicationWorkspaceDetailSchema.parse({
      application: detail.application,
      job: detail.job,
      primaryListing: this.primaryListing(detail.job),
      campaigns: this.campaignRefsForJob(detail.job.id),
      resume,
      timeline: detail.timeline,
      latestEvent,
      stageEnteredAt: this.stageEnteredAt(detail.application, detail.timeline),
      submissionCount: detail.timeline.filter((event) =>
        event.type === 'application_recorded' || event.type === 'submission_recorded'
      ).length,
    });
  }

  async searchJobListItems(input: SearchJobListItemsInput): Promise<SearchJobListItemsOutput> {
    const page = await this.searchJobs(input);
    return {
      items: await Promise.all(page.items.map((job) => this.jobListItemFromJob(job))),
      total: page.total,
    };
  }

  async getJobDetailView(jobId: string): Promise<JobDetail | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;
    const application = await this.findApplicationByJobId(jobId);
    const applicationDetail = application ? await this.getApplication(application.id) : null;
    const resume = application?.resumeProfileId ? await this.getResumeProfile(application.resumeProfileId) : null;
    const observationRows = this.db.prepare(`
      SELECT * FROM job_observations
      WHERE job_id = ?
      ORDER BY observed_at DESC, id DESC
    `).all(jobId) as Row[];
    const observations = observationRows.map((row) => {
      const listingRow = this.db.prepare('SELECT * FROM job_listings WHERE id = ?').get(String(row.listing_id)) as Row | undefined;
      if (!listingRow) throw new Error(`Listing '${String(row.listing_id)}' is missing for Observation '${String(row.id)}'`);
      return {
        observation: JobObservationSchema.parse({
          id: row.id,
          jobId: row.job_id,
          listingId: row.listing_id,
          discoveryRunId: row.discovery_run_id,
          observedAt: row.observed_at,
          availability: row.availability,
        }),
        listing: this.listingFromRow(listingRow),
      };
    });
    const timeline = applicationDetail?.timeline ?? [];
    const latestEvent = timeline.length ? timeline[timeline.length - 1]! : null;
    return JobDetailSchema.parse({
      job,
      primaryListing: this.primaryListing(job),
      campaigns: this.campaignRefsForJob(job.id),
      application: applicationDetail ? {
        application: applicationDetail.application,
        timeline,
        resume,
        latestEvent,
        submissionCount: timeline.filter((event) =>
          event.type === 'application_recorded' || event.type === 'submission_recorded'
        ).length,
      } : null,
      observations,
    });
  }

  async listResumeUsage(input: ListResumeUsageInput): Promise<ListResumeUsageOutput> {
    const resumePage = await this.listResumeProfiles({ limit: input.limit ?? 50, offset: input.offset ?? 0 });
    const campaignFilter = input.campaignId
      ? ` AND EXISTS (
          SELECT 1 FROM job_observations o
          JOIN discovery_runs d ON d.id = o.discovery_run_id
          WHERE o.job_id = j.id AND d.campaign_id = ?
        )`
      : '';
    const campaignParams = input.campaignId ? [input.campaignId] : [];
    const items = resumePage.items.map((resume) => {
      const rows = this.db.prepare(`
        SELECT a.current_stage AS stage, COUNT(*) AS n, MAX(a.applied_at) AS last_used_at
        FROM applications a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.resume_profile_id = ?${campaignFilter}
        GROUP BY a.current_stage
      `).all(resume.id, ...campaignParams) as Row[];
      const applicationsByStage = Object.fromEntries(APPLICATION_STAGES.map((stage) => [stage, 0])) as Record<ApplicationStage, number>;
      let applications = 0;
      let lastUsedAt: string | null = null;
      for (const row of rows) {
        const stage = row.stage as ApplicationStage;
        const count = Number(row.n);
        applicationsByStage[stage] = count;
        applications += count;
        const candidate = row.last_used_at == null ? null : String(row.last_used_at);
        if (candidate && (!lastUsedAt || candidate > lastUsedAt)) lastUsedAt = candidate;
      }
      return ResumeUsageSummarySchema.parse({ resume, applications, applicationsByStage, lastUsedAt });
    });
    return ListResumeUsageOutputSchema.parse({ items, total: resumePage.total });
  }

  async listDiscoveryRunViews(input: ListDiscoveryRunsInput): Promise<ListDiscoveryRunsOutput> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (input.campaignId) { where.push('d.campaign_id = ?'); params.push(input.campaignId); }
    if (input.executor) { where.push('d.executor = ?'); params.push(input.executor); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS n FROM discovery_runs d ${clause}`).get(...params) as Row).n);
    const rows = this.db.prepare(`SELECT d.* FROM discovery_runs d ${clause} ORDER BY d.started_at DESC, d.id DESC LIMIT ? OFFSET ?`).all(
      ...params, input.limit ?? 50, input.offset ?? 0,
    ) as Row[];
    return ListDiscoveryRunsOutputSchema.parse({
      items: rows.map((row) => {
        const run = this.discoveryFromRow(row);
        return { run, campaign: this.campaignRefById(run.campaignId) };
      }),
      total,
    });
  }

  async getDiscoveryRunDetailView(runId: string): Promise<DiscoveryRunDetail | null> {
    const run = await this.getDiscoveryRun(runId);
    if (!run) return null;
    const jobRows = this.db.prepare(`
      SELECT DISTINCT j.*
      FROM jobs j
      JOIN job_observations o ON o.job_id = j.id
      WHERE o.discovery_run_id = ?
      ORDER BY j.last_seen_at DESC, j.id
    `).all(runId) as Row[];
    const observationCount = Number((this.db.prepare(
      'SELECT COUNT(*) AS n FROM job_observations WHERE discovery_run_id = ?',
    ).get(runId) as Row).n);
    return DiscoveryRunDetailSchema.parse({
      run,
      campaign: this.campaignRefById(run.campaignId),
      affectedJobs: await Promise.all(jobRows.map((row) => this.jobListItemFromJob(this.jobFromRow(row)))),
      observationCount,
    });
  }

  async getDashboardSnapshot(input: DashboardSnapshotInput, generatedAt: string): Promise<DashboardSnapshot> {
    const pipeline = await this.getPipelineStats({ campaignId: input.campaignId });
    const campaignCondition = input.campaignId
      ? `EXISTS (
          SELECT 1 FROM job_observations o
          JOIN discovery_runs d ON d.id = o.discovery_run_id
          WHERE o.job_id = j.id AND d.campaign_id = ?
        )`
      : '1=1';
    const params = input.campaignId ? [input.campaignId] : [];
    const countJobsInState = (state: JobState) => Number((this.db.prepare(
      `SELECT COUNT(*) AS n FROM jobs j WHERE j.state = ? AND ${campaignCondition}`,
    ).get(state, ...params) as Row).n);
    const countApplications = (where: string, extraParams: Array<string | number> = []) => Number((this.db.prepare(`
      SELECT COUNT(*) AS n
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      WHERE ${where} AND ${campaignCondition}
    `).get(...extraParams, ...params) as Row).n);

    const activePipeline = countApplications("a.current_stage NOT IN ('offer','rejected','withdrawn')");
    const interviewStage = countApplications('a.current_stage = ?', ['interview']);
    const recentRunRows = input.campaignId
      ? this.db.prepare('SELECT * FROM discovery_runs WHERE campaign_id = ? ORDER BY started_at DESC, id DESC LIMIT ?').all(input.campaignId, input.recentDiscoveryLimit ?? 5) as Row[]
      : this.db.prepare('SELECT * FROM discovery_runs ORDER BY started_at DESC, id DESC LIMIT ?').all(input.recentDiscoveryLimit ?? 5) as Row[];
    const recentDiscoveryRuns = recentRunRows.map((row) => {
      const run = this.discoveryFromRow(row);
      return { run, campaign: this.campaignRefById(run.campaignId) };
    });
    const resumeUsage = await this.listResumeUsage({
      limit: 200,
      offset: 0,
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    });

    const generatedMs = new Date(generatedAt).getTime();
    const daysAgo = (days: number) => new Date(generatedMs - days * 86_400_000).toISOString();
    const attention: DashboardSnapshot['attention'] = [];
    const attentionLimit = input.attentionLimit ?? 10;

    const staleApplicationRows = this.db.prepare(`
      SELECT a.id AS application_id, j.id AS job_id, c.name AS company_name, j.title AS job_title,
             a.current_stage AS current_stage, COALESCE(MAX(e.occurred_at), a.applied_at) AS since_at
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN companies c ON c.id = j.company_id
      LEFT JOIN application_events e ON e.application_id = a.id
      WHERE a.current_stage IN ('applied','screening','assessment','interview') AND ${campaignCondition}
      GROUP BY a.id, j.id, c.name, j.title, a.current_stage, a.applied_at
      HAVING COALESCE(MAX(e.occurred_at), a.applied_at) < ?
      ORDER BY since_at ASC
      LIMIT ?
    `).all(...params, daysAgo(7), attentionLimit) as Row[];
    for (const row of staleApplicationRows) attention.push({
      id: `stale_application:${String(row.application_id)}`,
      kind: 'stale_application', severity: 'warning',
      label: `${String(row.company_name)} · ${String(row.job_title)}`,
      jobId: String(row.job_id), applicationId: String(row.application_id), campaignId: input.campaignId ?? null, resumeProfileId: null,
      stage: row.current_stage as ApplicationStage, sinceAt: String(row.since_at),
    });

    const shortlistRows = this.db.prepare(`
      SELECT j.id AS job_id, c.name AS company_name, j.title AS job_title, j.first_seen_at AS since_at
      FROM jobs j JOIN companies c ON c.id = j.company_id
      WHERE j.state = 'shortlisted'
        AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)
        AND ${campaignCondition}
        AND j.first_seen_at < ?
      ORDER BY j.first_seen_at ASC
      LIMIT ?
    `).all(...params, daysAgo(3), attentionLimit) as Row[];
    for (const row of shortlistRows) attention.push({
      id: `shortlisted_unapplied:${String(row.job_id)}`,
      kind: 'shortlisted_unapplied', severity: 'warning',
      label: `${String(row.company_name)} · ${String(row.job_title)}`,
      jobId: String(row.job_id), applicationId: null, campaignId: input.campaignId ?? null, resumeProfileId: null, stage: null, sinceAt: String(row.since_at),
    });

    const closedListingRows = this.db.prepare(`
      SELECT a.id AS application_id, j.id AS job_id, c.name AS company_name, j.title AS job_title, a.current_stage AS current_stage,
             MAX(COALESCE(jl.closed_at, jl.last_seen_at)) AS since_at
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN companies c ON c.id = j.company_id
      JOIN job_listings jl ON jl.job_id = j.id AND jl.status = 'closed'
      WHERE a.current_stage IN ('applied','screening','assessment','interview') AND ${campaignCondition}
      GROUP BY a.id, j.id, c.name, j.title, a.current_stage
      ORDER BY since_at DESC
      LIMIT ?
    `).all(...params, attentionLimit) as Row[];
    for (const row of closedListingRows) attention.push({
      id: `closed_listing_active_application:${String(row.application_id)}`,
      kind: 'closed_listing_active_application', severity: 'critical',
      label: `${String(row.company_name)} · ${String(row.job_title)}`,
      jobId: String(row.job_id), applicationId: String(row.application_id), campaignId: input.campaignId ?? null, resumeProfileId: null,
      stage: row.current_stage as ApplicationStage, sinceAt: row.since_at == null ? null : String(row.since_at),
    });

    const campaignWhere = input.campaignId ? "c.status = 'active' AND c.id = ?" : "c.status = 'active'";
    const staleCampaignRows = this.db.prepare(`
      SELECT c.id AS campaign_id, c.name AS campaign_name, c.created_at AS created_at, MAX(d.completed_at) AS last_completed_at
      FROM campaigns c LEFT JOIN discovery_runs d ON d.campaign_id = c.id AND d.completed_at IS NOT NULL
      WHERE ${campaignWhere}
      GROUP BY c.id, c.name, c.created_at
      HAVING last_completed_at IS NULL OR last_completed_at < ?
      ORDER BY COALESCE(last_completed_at, c.created_at) ASC
      LIMIT ?
    `).all(...(input.campaignId ? [input.campaignId] : []), daysAgo(3), attentionLimit) as Row[];
    for (const row of staleCampaignRows) attention.push({
      id: `stale_campaign_discovery:${String(row.campaign_id)}`, kind: 'stale_campaign_discovery', severity: 'info',
      label: String(row.campaign_name), jobId: null, applicationId: null, campaignId: String(row.campaign_id), resumeProfileId: null, stage: null,
      sinceAt: String(row.last_completed_at ?? row.created_at),
    });

    const selectedCampaign = input.campaignId ? await this.getCampaign(input.campaignId) : null;
    const allowedResumeIds = selectedCampaign ? new Set(selectedCampaign.resumeProfileIds) : null;
    const resumePage = await this.listResumeProfiles({ limit: 200, offset: 0 });
    for (const resume of resumePage.items) {
      if (allowedResumeIds && !allowedResumeIds.has(resume.id)) continue;
      if (!resume.artifactUri) {
        attention.push({
          id: `missing_resume_artifact:${resume.id}`, kind: 'missing_resume_artifact', severity: 'warning', label: resume.name,
          jobId: null, applicationId: null, campaignId: input.campaignId ?? null, resumeProfileId: resume.id, stage: null, sinceAt: resume.updatedAt,
        });
      } else if (resume.updatedAt < daysAgo(30)) {
        attention.push({
          id: `stale_resume_artifact:${resume.id}`, kind: 'stale_resume_artifact', severity: 'info', label: resume.name,
          jobId: null, applicationId: null, campaignId: input.campaignId ?? null, resumeProfileId: resume.id, stage: null, sinceAt: resume.updatedAt,
        });
      }
    }
    const severityRank = { critical: 0, warning: 1, info: 2 } as const;
    attention.sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
      || (left.sinceAt ?? generatedAt).localeCompare(right.sinceAt ?? generatedAt)
      || left.id.localeCompare(right.id));

    const generatedDate = new Date(generatedAt);
    const dayAnchor = Date.UTC(generatedDate.getUTCFullYear(), generatedDate.getUTCMonth(), generatedDate.getUTCDate());
    const dayKeys = Array.from({ length: 7 }, (_, index) => new Date(dayAnchor - (6 - index) * 86_400_000).toISOString().slice(0, 10));
    const weeklyStart = `${dayKeys[0]}T00:00:00.000Z`;
    const countsByDay = (rows: Row[]) => new Map(rows.map((row) => [String(row.day), Number(row.n)]));

    const observationRows = input.campaignId
      ? this.db.prepare(`SELECT substr(o.observed_at,1,10) AS day, COUNT(DISTINCT o.job_id) AS n
          FROM job_observations o JOIN discovery_runs d ON d.id = o.discovery_run_id
          WHERE d.campaign_id = ? AND o.observed_at >= ? GROUP BY day`).all(input.campaignId, weeklyStart) as Row[]
      : this.db.prepare(`SELECT substr(o.observed_at,1,10) AS day, COUNT(DISTINCT o.job_id) AS n
          FROM job_observations o WHERE o.observed_at >= ? GROUP BY day`).all(weeklyStart) as Row[];
    const insertedRows = this.db.prepare(`SELECT substr(j.created_at,1,10) AS day, COUNT(*) AS n FROM jobs j
      WHERE ${campaignCondition} AND j.created_at >= ? GROUP BY day`).all(...params, weeklyStart) as Row[];
    const eventCounts = (type: string) => this.db.prepare(`
      SELECT substr(e.occurred_at,1,10) AS day, COUNT(*) AS n
      FROM application_events e
      JOIN applications a ON a.id = e.application_id
      JOIN jobs j ON j.id = a.job_id
      WHERE e.type = ? AND ${campaignCondition} AND e.occurred_at >= ?
      GROUP BY day
    `).all(type, ...params, weeklyStart) as Row[];
    const observedByDay = countsByDay(observationRows);
    const insertedByDay = countsByDay(insertedRows);
    const applicationsByDay = countsByDay(eventCounts('application_recorded'));
    const stageChangesByDay = countsByDay(eventCounts('stage_changed'));
    const interviewsByDay = countsByDay(eventCounts('interview_scheduled'));
    const weeklyActivity: DashboardSnapshot['weeklyActivity'] = dayKeys.map((date) => ({
      date,
      jobsObserved: observedByDay.get(date) ?? 0,
      opportunitiesInserted: insertedByDay.get(date) ?? 0,
      shortlisted: null,
      applicationsRecorded: applicationsByDay.get(date) ?? 0,
      stageChanges: stageChangesByDay.get(date) ?? 0,
      interviewsScheduled: interviewsByDay.get(date) ?? 0,
    }));

    const sourceRows = this.db.prepare(`
      SELECT jl.source_kind AS source_kind,
             COUNT(DISTINCT j.id) AS opportunities,
             COUNT(DISTINCT a.id) AS applications
      FROM job_listings jl
      JOIN jobs j ON j.id = jl.job_id
      LEFT JOIN applications a ON a.job_id = j.id
      WHERE ${campaignCondition}
      GROUP BY jl.source_kind
    `).all(...params) as Row[];
    const sourceStageRows = this.db.prepare(`
      SELECT jl.source_kind AS source_kind, a.current_stage AS stage, COUNT(DISTINCT a.id) AS n
      FROM job_listings jl
      JOIN jobs j ON j.id = jl.job_id
      JOIN applications a ON a.job_id = j.id
      WHERE ${campaignCondition}
      GROUP BY jl.source_kind, a.current_stage
    `).all(...params) as Row[];
    const sourceStages = new Map<string, Record<ApplicationStage, number>>();
    for (const row of sourceRows) {
      sourceStages.set(String(row.source_kind), Object.fromEntries(
        APPLICATION_STAGES.map((stage) => [stage, 0]),
      ) as Record<ApplicationStage, number>);
    }
    for (const row of sourceStageRows) {
      const stages = sourceStages.get(String(row.source_kind));
      if (stages) stages[row.stage as ApplicationStage] = Number(row.n);
    }
    const sourcePerformance: DashboardSnapshot['sourcePerformance'] = sourceRows
      .map((row) => ({
        sourceKind: String(row.source_kind) as DashboardSnapshot['sourcePerformance'][number]['sourceKind'],
        opportunities: Number(row.opportunities),
        applications: Number(row.applications),
        applicationsByStage: sourceStages.get(String(row.source_kind))!,
      }))
      .sort((left, right) => right.applications - left.applications
        || right.opportunities - left.opportunities
        || left.sourceKind.localeCompare(right.sourceKind));

    return DashboardSnapshotSchema.parse({
      generatedAt,
      campaign: this.campaignRefById(input.campaignId ?? null),
      kpis: {
        knownJobs: pipeline.knownJobs,
        inbox: countJobsInState('discovered'),
        shortlisted: countJobsInState('shortlisted'),
        applications: pipeline.applications,
        activePipeline,
        interviewStage,
      },
      funnel: {
        discovered: pipeline.jobsByState.discovered,
        shortlisted: pipeline.jobsByState.shortlisted,
        applied: pipeline.applicationsByStage.applied,
        screening: pipeline.applicationsByStage.screening,
        assessment: pipeline.applicationsByStage.assessment,
        interview: pipeline.applicationsByStage.interview,
        offer: pipeline.applicationsByStage.offer,
      },
      recentDiscoveryRuns,
      resumeUsage: resumeUsage.items,
      attention: attention.slice(0, attentionLimit),
      weeklyActivity,
      sourcePerformance,
    });
  }

  async getIdempotencyReceipt(scope: string, key: string): Promise<IdempotencyReceipt | null> {
    const row = this.db.prepare('SELECT * FROM idempotency_receipts WHERE scope = ? AND key = ?').get(scope, key) as Row | undefined;
    return row ? { scope: String(row.scope), key: String(row.key), requestHash: String(row.request_hash), result: json(row.result_json), createdAt: String(row.created_at) } : null;
  }

  async resolveCompany(name: string, now: string): Promise<Company> {
    const normalized = normalizeIdentityText(name);
    const row = this.db.prepare(`SELECT c.* FROM companies c LEFT JOIN company_aliases ca ON ca.company_id = c.id WHERE c.normalized_name = ? OR ca.normalized_alias = ? LIMIT 1`).get(normalized, normalized) as Row | undefined;
    if (row) return this.companyById(String(row.id))!;
    const id = randomUUID();
    this.db.prepare('INSERT INTO companies(id, name, normalized_name, created_at, updated_at) VALUES(?,?,?,?,?)').run(id, name.trim(), normalized, now, now);
    return this.companyById(id)!;
  }

  async insertJob(job: Job): Promise<void> {
    this.db.prepare(`INSERT INTO jobs(id,company_id,title,normalized_title,city,normalized_city,state,canonical_url,description,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      job.id, job.companyId, job.title, normalizeIdentityText(job.title), job.city, normalizeIdentityText(job.city ?? ''), job.state,
      null, job.description, job.firstSeenAt, job.lastSeenAt, job.createdAt, job.updatedAt,
    );
    for (const listing of job.listings) {
      this.insertListingRecord(listing);
    }
  }

  private insertListingRecord(listing: JobListing): void {
    const identityKey = buildJobListingIdentityKey({
      sourceKind: listing.sourceKind,
      identityKind: listing.identityKind,
      url: listing.url,
      externalNamespace: listing.externalNamespace,
      externalId: listing.externalId,
    });
    this.db.prepare(`INSERT INTO job_listings(
      id,job_id,source_kind,label,url,normalized_url,external_namespace,external_id,
      normalized_external_namespace,normalized_external_id,identity_kind,identity_key,status,
      first_seen_at,last_seen_at,published_at,closed_at,metadata_snapshot_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      listing.id, listing.jobId, listing.sourceKind, listing.label, listing.url,
      listing.url ? normalizeCanonicalUrl(listing.url) : null,
      listing.externalNamespace, listing.externalId,
      listing.externalNamespace ? normalizeIdentityText(listing.externalNamespace) : null,
      listing.externalId ? normalizeIdentityText(listing.externalId) : null,
      listing.identityKind, identityKey, listing.status, listing.firstSeenAt, listing.lastSeenAt,
      listing.publishedAt, listing.closedAt, JSON.stringify(listing.metadataSnapshot),
    );
  }

  private upsertListingCandidate(
    jobId: string,
    candidate: JobListingCandidate,
    observedAt: string,
  ): { listing: JobListing; changed: boolean } {
    const identityKey = buildJobListingIdentityKey({
      sourceKind: candidate.sourceKind,
      identityKind: candidate.identityKind,
      url: candidate.url ?? null,
      externalNamespace: candidate.externalNamespace ?? null,
      externalId: candidate.externalId ?? null,
    });
    const normalizedUrl = candidate.url ? normalizeCanonicalUrl(candidate.url) : null;
    let row: Row | undefined;
    if (identityKey) {
      row = this.db.prepare('SELECT * FROM job_listings WHERE identity_key = ?').get(identityKey) as Row | undefined;
    } else {
      row = this.db.prepare(`
        SELECT * FROM job_listings
        WHERE job_id = ? AND source_kind = ? AND identity_kind = 'scoped'
          AND COALESCE(normalized_url, '') = COALESCE(?, '')
          AND COALESCE(label, '') = COALESCE(?, '')
        ORDER BY id LIMIT 1
      `).get(jobId, candidate.sourceKind, normalizedUrl, candidate.label ?? null) as Row | undefined;
    }
    if (row && String(row.job_id) !== jobId) {
      throw new Error(`Listing identity is already owned by Job '${String(row.job_id)}'`);
    }

    if (!row) {
      const listing = JobListingSchema.parse({
        id: randomUUID(),
        jobId,
        sourceKind: candidate.sourceKind,
        label: candidate.label ?? null,
        url: candidate.url ?? null,
        externalNamespace: candidate.externalNamespace ?? (candidate.identityKind === 'external-id' ? candidate.sourceKind : null),
        externalId: candidate.externalId ?? null,
        identityKind: candidate.identityKind,
        status: candidate.status,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        publishedAt: candidate.publishedAt ?? null,
        closedAt: candidate.status === 'closed' ? observedAt : null,
        metadataSnapshot: candidate.metadataSnapshot,
      });
      this.insertListingRecord(listing);
      return { listing, changed: true };
    }

    const current = this.listingFromRow(row);
    const mergedMetadata = { ...current.metadataSnapshot, ...candidate.metadataSnapshot };
    const next = JobListingSchema.parse({
      ...current,
      label: current.label ?? candidate.label ?? null,
      url: current.url ?? candidate.url ?? null,
      externalNamespace: current.externalNamespace ?? candidate.externalNamespace ?? null,
      externalId: current.externalId ?? candidate.externalId ?? null,
      status: candidate.status,
      lastSeenAt: observedAt > current.lastSeenAt ? observedAt : current.lastSeenAt,
      publishedAt: current.publishedAt ?? candidate.publishedAt ?? null,
      closedAt: candidate.status === 'closed' ? (current.closedAt ?? observedAt) : null,
      metadataSnapshot: mergedMetadata,
    });
    const materialCurrent = { ...current, lastSeenAt: '' };
    const materialNext = { ...next, lastSeenAt: '' };
    const metadataChanged = JSON.stringify(materialNext) !== JSON.stringify(materialCurrent);
    const seenChanged = next.lastSeenAt !== current.lastSeenAt;
    if (metadataChanged || seenChanged) {
      this.db.prepare(`UPDATE job_listings SET
        label=?,url=?,normalized_url=?,external_namespace=?,external_id=?,normalized_external_namespace=?,normalized_external_id=?,
        status=?,last_seen_at=?,published_at=?,closed_at=?,metadata_snapshot_json=? WHERE id=?`).run(
        next.label, next.url, next.url ? normalizeCanonicalUrl(next.url) : null,
        next.externalNamespace, next.externalId,
        next.externalNamespace ? normalizeIdentityText(next.externalNamespace) : null,
        next.externalId ? normalizeIdentityText(next.externalId) : null,
        next.status, next.lastSeenAt, next.publishedAt, next.closedAt, JSON.stringify(next.metadataSnapshot), next.id,
      );
    }
    const listing = metadataChanged || seenChanged
      ? this.listingFromRow(this.db.prepare('SELECT * FROM job_listings WHERE id = ?').get(next.id) as Row)
      : current;
    return { listing, changed: metadataChanged };
  }

  async mergeJobCandidate(jobId: string, candidate: UpsertJobCandidate, now: string): Promise<{ job: Job; metadataChanged: boolean; touchedListings: JobListing[] }> {
    const current = await this.getJob(jobId);
    if (!current) throw new Error(`Job '${jobId}' not found`);
    let metadataChanged = false;
    let city = current.city;
    let description = current.description;
    if (!city && candidate.city) { city = candidate.city; metadataChanged = true; }
    if (candidate.description != null && candidate.description !== description) { description = candidate.description; metadataChanged = true; }
    const touchedListings: JobListing[] = [];
    for (const listingCandidate of candidate.listings) {
      const result = this.upsertListingCandidate(jobId, listingCandidate, candidate.observedAt);
      touchedListings.push(result.listing);
      if (result.changed) metadataChanged = true;
    }
    const lastSeenAt = candidate.observedAt > current.lastSeenAt ? candidate.observedAt : current.lastSeenAt;
    this.db.prepare('UPDATE jobs SET city=?, normalized_city=?, description=?, last_seen_at=?, updated_at=? WHERE id=?').run(
      city, normalizeIdentityText(city ?? ''), description, lastSeenAt, metadataChanged ? now : current.updatedAt, jobId,
    );
    return { job: (await this.getJob(jobId))!, metadataChanged, touchedListings };
  }

  async insertObservation(observation: JobObservation): Promise<void> {
    const listingRow = this.db.prepare('SELECT * FROM job_listings WHERE id = ? AND job_id = ?').get(observation.listingId, observation.jobId) as Row | undefined;
    if (!listingRow) throw new Error(`Listing '${observation.listingId}' is missing for Job '${observation.jobId}'`);
    const listing = this.listingFromRow(listingRow);
    this.db.prepare(`INSERT INTO job_observations(
      id,job_id,discovery_run_id,observed_at,source_kind,source_url,source_label,availability,listing_id
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
      observation.id, observation.jobId, observation.discoveryRunId, observation.observedAt,
      listing.sourceKind, listing.url, listing.label, observation.availability, observation.listingId,
    );
  }

  async updateJobState(jobId: string, state: JobState, now: string): Promise<Job> {
    this.db.prepare('UPDATE jobs SET state=?, updated_at=? WHERE id=?').run(state, now, jobId);
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Job '${jobId}' not found after state update`);
    return job;
  }

  async insertApplication(application: Application): Promise<void> {
    this.db.prepare('INSERT INTO applications(id,job_id,current_stage,applied_at,resume_profile_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(application.id, application.jobId, application.currentStage, application.appliedAt, application.resumeProfileId, application.createdAt, application.updatedAt);
  }

  async reconcileApplicationRecord(applicationId: string, appliedAt: string, resumeProfileId: string | null, now: string): Promise<Application> {
    const row = this.db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as Row | undefined;
    if (!row) throw new Error(`Application '${applicationId}' not found`);
    const currentAppliedAt = String(row.applied_at);
    const nextAppliedAt = appliedAt < currentAppliedAt ? appliedAt : currentAppliedAt;
    const nextResumeProfileId = row.resume_profile_id == null ? resumeProfileId : String(row.resume_profile_id);
    this.db.prepare('UPDATE applications SET applied_at=?, resume_profile_id=?, updated_at=? WHERE id=?').run(
      nextAppliedAt, nextResumeProfileId, now, applicationId,
    );
    const updated = this.db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as Row | undefined;
    if (!updated) throw new Error(`Application '${applicationId}' not found after reconcile`);
    return this.applicationFromRow(updated);
  }

  async updateApplicationStage(applicationId: string, stage: ApplicationStage, now: string): Promise<Application> {
    this.db.prepare('UPDATE applications SET current_stage=?, updated_at=? WHERE id=?').run(stage, now, applicationId);
    const row = this.db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as Row | undefined;
    if (!row) throw new Error(`Application '${applicationId}' not found after stage update`);
    return this.applicationFromRow(row);
  }

  async insertApplicationEvent(event: ApplicationEvent): Promise<void> {
    this.db.prepare('INSERT INTO application_events(id,application_id,type,stage,occurred_at,actor,idempotency_key,note) VALUES(?,?,?,?,?,?,?,?)').run(event.id, event.applicationId, event.type, event.stage, event.occurredAt, event.actor, event.idempotencyKey, event.note);
  }

  async upsertCampaign(campaign: JobSearchCampaign): Promise<JobSearchCampaign> {
    this.db.prepare(`INSERT INTO campaigns(id,name,target_roles_json,cities_json,graduation_years_json,experience_json,keywords_json,exclusions_json,sources_json,resume_profile_ids_json,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,target_roles_json=excluded.target_roles_json,cities_json=excluded.cities_json,graduation_years_json=excluded.graduation_years_json,experience_json=excluded.experience_json,keywords_json=excluded.keywords_json,exclusions_json=excluded.exclusions_json,sources_json=excluded.sources_json,resume_profile_ids_json=excluded.resume_profile_ids_json,status=excluded.status,updated_at=excluded.updated_at`).run(
      campaign.id, campaign.name, JSON.stringify(campaign.targetRoles), JSON.stringify(campaign.cities), JSON.stringify(campaign.graduationYears), JSON.stringify(campaign.experience), JSON.stringify(campaign.keywords), JSON.stringify(campaign.exclusions), JSON.stringify(campaign.sources), JSON.stringify(campaign.resumeProfileIds), campaign.status, campaign.createdAt, campaign.updatedAt,
    );
    return (await this.getCampaign(campaign.id))!;
  }

  async insertDiscoveryRun(run: DiscoveryRun): Promise<void> {
    this.db.prepare('INSERT INTO discovery_runs(id,campaign_id,executor,context_snapshot_json,started_at,completed_at,candidate_count,inserted_count,duplicate_count,rejected_count) VALUES(?,?,?,?,?,?,?,?,?,?)').run(run.id, run.campaignId, run.executor, JSON.stringify(run.contextSnapshot), run.startedAt, run.completedAt, run.candidateCount, run.insertedCount, run.duplicateCount, run.rejectedCount);
  }

  async updateDiscoveryRun(run: DiscoveryRun): Promise<DiscoveryRun> {
    this.db.prepare('UPDATE discovery_runs SET completed_at=?,candidate_count=?,inserted_count=?,duplicate_count=?,rejected_count=? WHERE id=?').run(run.completedAt, run.candidateCount, run.insertedCount, run.duplicateCount, run.rejectedCount, run.id);
    return (await this.getDiscoveryRun(run.id))!;
  }

  async upsertResumeProfiles(profiles: readonly ResumeProfileRef[]): Promise<void> {
    const statement = this.db.prepare(`INSERT INTO resume_profile_refs(id,name,source,external_profile_id,target_role,version,hash,artifact_uri,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,source=excluded.source,external_profile_id=excluded.external_profile_id,target_role=excluded.target_role,version=excluded.version,hash=excluded.hash,artifact_uri=excluded.artifact_uri,updated_at=excluded.updated_at`);
    for (const profile of profiles) statement.run(profile.id, profile.name, profile.source, profile.externalProfileId, profile.targetRole, profile.version, profile.hash, profile.artifactUri, profile.updatedAt);
  }

  async putIdempotencyReceipt(receipt: IdempotencyReceipt): Promise<void> {
    this.db.prepare('INSERT INTO idempotency_receipts(scope,key,request_hash,result_json,created_at) VALUES(?,?,?,?,?)').run(receipt.scope, receipt.key, receipt.requestHash, JSON.stringify(receipt.result), receipt.createdAt);
  }
}

export class SqliteCareerStore implements CareerStorePort {
  private readonly readDb: DatabaseSync;
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(readonly databasePath: string) {
    this.readDb = openDatabase(databasePath);
    migrateSqliteDatabase(this.readDb);
  }

  close(): void { this.readDb.close(); }

  private readSession(): CareerStoreReadPort { return new SqliteCareerSession(this.readDb); }
  searchJobs(input: SearchJobsInput) { return this.readSession().searchJobs(input); }
  getJob(jobId: string) { return this.readSession().getJob(jobId); }
  findDuplicate(input: DuplicateCheckInput) { return this.readSession().findDuplicate(input); }
  listApplications(input: ListApplicationsInput) { return this.readSession().listApplications(input); }
  getApplication(applicationId: string) { return this.readSession().getApplication(applicationId); }
  findApplicationByJobId(jobId: string) { return this.readSession().findApplicationByJobId(jobId); }
  listCampaigns(input: ListCampaignsInput) { return this.readSession().listCampaigns(input); }
  getCampaign(campaignId: string) { return this.readSession().getCampaign(campaignId); }
  listResumeProfiles(input: ListResumesInput) { return this.readSession().listResumeProfiles(input); }
  getResumeProfile(resumeProfileId: string) { return this.readSession().getResumeProfile(resumeProfileId); }
  getDiscoveryRun(runId: string) { return this.readSession().getDiscoveryRun(runId); }
  getPipelineStats(input: PipelineStatsInput) { return this.readSession().getPipelineStats(input); }
  searchJobListItems(input: SearchJobListItemsInput) { return this.readSession().searchJobListItems(input); }
  listApplicationBoard(input: ListApplicationBoardInput) { return this.readSession().listApplicationBoard(input); }
  getApplicationWorkspaceDetail(applicationId: string) { return this.readSession().getApplicationWorkspaceDetail(applicationId); }
  getJobDetailView(jobId: string) { return this.readSession().getJobDetailView(jobId); }
  getDashboardSnapshot(input: DashboardSnapshotInput, generatedAt: string) { return this.readSession().getDashboardSnapshot(input, generatedAt); }
  listDiscoveryRunViews(input: ListDiscoveryRunsInput) { return this.readSession().listDiscoveryRunViews(input); }
  getDiscoveryRunDetailView(runId: string) { return this.readSession().getDiscoveryRunDetailView(runId); }
  listResumeUsage(input: ListResumeUsageInput) { return this.readSession().listResumeUsage(input); }
  getIdempotencyReceipt(scope: string, key: string) { return this.readSession().getIdempotencyReceipt(scope, key); }

  async transaction<T>(work: (tx: CareerStoreTransactionPort) => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.transactionTail;
    this.transactionTail = previous.then(() => gate);
    await previous;
    const db = openDatabase(this.databasePath);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = await work(new SqliteCareerSession(db));
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      db.close();
      release();
    }
  }
}
