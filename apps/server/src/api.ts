import type { Express, Request, Response } from 'express';
import {
  CareerApplicationError,
  type CareerRuntimePorts,
} from '@job-harness/application';
import {
  AnalyticsSnapshotInputSchema,
  BeginDiscoveryInputSchema,
  CompleteDiscoveryInputSchema,
  DashboardSnapshotInputSchema,
  EntityIdSchema,
  ListApplicationBoardInputSchema,
  ListCampaignsInputSchema,
  ListCompaniesInputSchema,
  ListDiscoveryRunsInputSchema,
  ListResumeUsageInputSchema,
  JOB_HARNESS_REST_V1_ROUTES,
  ListSavedViewsInputSchema,
  PipelineStatsInputSchema,
  RecordApplicationInputSchema,
  SearchJobListItemsInputSchema,
  SetJobStateInputSchema,
  TransitionApplicationInputSchema,
  UpsertCampaignInputSchema,
  UpsertSavedViewInputSchema,
  UpsertJobsBatchInputSchema,
  PrepareSubmissionIntentInputSchema,
  BeginSubmissionIntentInputSchema,
  ConfirmSubmissionIntentInputSchema,
  FailSubmissionIntentInputSchema,
  ReconcileSubmissionIntentInputSchema,
  ListSubmissionIntentsInputSchema,
  ReconcileSubmissionIntentsInputSchema,
} from '@job-harness/contracts';
import { registerRestV1Route } from './rest-route';
import { writeCommonRestError, writeInternalRestError, writeRestError } from './http-errors';

const API_PREFIX = '/api/v1';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.length ? String(value[0]) : undefined;
  return typeof value === 'string' ? value : undefined;
}

function list(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? [value] : [];
  const result = values.flatMap((item) => item.split(',')).map((item) => item.trim()).filter(Boolean);
  return result.length ? result : undefined;
}

function integer(value: unknown): number | undefined {
  const raw = first(value);
  if (raw == null || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function boolean(value: unknown): boolean | string | undefined {
  const raw = first(value)?.toLowerCase();
  if (raw == null) return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return raw;
}

function pageQuery(query: Request['query']) {
  return {
    ...(integer(query.limit) !== undefined ? { limit: integer(query.limit) } : {}),
    ...(integer(query.offset) !== undefined ? { offset: integer(query.offset) } : {}),
  };
}

function errorStatus(error: CareerApplicationError): number {
  switch (error.code) {
    case 'NOT_FOUND': return 404;
    case 'CONFLICT':
    case 'IDEMPOTENCY_CONFLICT': return 409;
    case 'INVALID_TRANSITION': return 422;
    default: return 400;
  }
}

function sendError(res: Response, error: unknown): void {
  if (writeCommonRestError(res, error)) return;
  if (error instanceof CareerApplicationError) {
    writeRestError(res, errorStatus(error), error.code, error.message);
    return;
  }
  writeInternalRestError(res);
}

function route(handler: AsyncHandler) {
  return (req: Request, res: Response) => {
    void handler(req, res).catch((error) => sendError(res, error));
  };
}

function entityId(value: unknown): string {
  return EntityIdSchema.parse(first(value));
}

export function registerJobHarnessApi(app: Express, career: CareerRuntimePorts): void {
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.analytics, route(async (req, res) => {
    const input = AnalyticsSnapshotInputSchema.parse({
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
    });
    res.json(await career.workspace.getAnalyticsSnapshot(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.pipeline, route(async (req, res) => {
    const input = PipelineStatsInputSchema.parse({
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
    });
    res.json(await career.analytics.getPipelineStats(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.dashboard, route(async (req, res) => {
    const input = DashboardSnapshotInputSchema.parse({
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
      ...(integer(req.query.recentDiscoveryLimit) !== undefined
        ? { recentDiscoveryLimit: integer(req.query.recentDiscoveryLimit) }
        : {}),
      ...(integer(req.query.attentionLimit) !== undefined
        ? { attentionLimit: integer(req.query.attentionLimit) }
        : {}),
    });
    res.json(await career.workspace.getDashboardSnapshot(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.companies, route(async (req, res) => {
    const input = ListCompaniesInputSchema.parse({
      ...pageQuery(req.query),
      ...(first(req.query.query) ? { query: first(req.query.query) } : {}),
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
    });
    res.json(await career.workspace.listCompanies(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.companyDetail, route(async (req, res) => {
    const companyId = entityId(req.params.companyId);
    const result = await career.workspace.getCompanyDetail(companyId, first(req.query.campaignId));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Company '${companyId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.jobs, route(async (req, res) => {
    const input = SearchJobListItemsInputSchema.parse({
      ...pageQuery(req.query),
      ...(first(req.query.company) ? { company: first(req.query.company) } : {}),
      ...(first(req.query.title) ? { title: first(req.query.title) } : {}),
      ...(first(req.query.city) ? { city: first(req.query.city) } : {}),
      ...(list(req.query.states) ? { states: list(req.query.states) } : {}),
      ...(list(req.query.sourceKinds) ? { sourceKinds: list(req.query.sourceKinds) } : {}),
      ...(boolean(req.query.applied) !== undefined ? { applied: boolean(req.query.applied) } : {}),
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
    });
    res.json(await career.workspace.searchJobListItems(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.jobDetail, route(async (req, res) => {
    const result = await career.workspace.getJobDetail(entityId(req.params.jobId));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Job '${req.params.jobId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.upsertJobsBatch, route(async (req, res) => {
    const input = UpsertJobsBatchInputSchema.parse(req.body);
    res.status(200).json(await career.jobs.upsertJobsBatch(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.setJobState, route(async (req, res) => {
    const input = SetJobStateInputSchema.parse({ ...req.body, jobId: entityId(req.params.jobId) });
    res.json(await career.jobs.setJobState(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.applications, route(async (req, res) => {
    const input = ListApplicationBoardInputSchema.parse({
      ...pageQuery(req.query),
      ...(list(req.query.stages) ? { stages: list(req.query.stages) } : {}),
      ...(first(req.query.company) ? { company: first(req.query.company) } : {}),
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
      ...(first(req.query.resumeProfileId) ? { resumeProfileId: first(req.query.resumeProfileId) } : {}),
      ...(first(req.query.appliedFrom) ? { appliedFrom: first(req.query.appliedFrom) } : {}),
      ...(first(req.query.appliedTo) ? { appliedTo: first(req.query.appliedTo) } : {}),
      ...(first(req.query.terminal) ? { terminal: first(req.query.terminal) } : {}),
    });
    res.json(await career.workspace.listApplicationBoard(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.applicationDetail, route(async (req, res) => {
    const result = await career.workspace.getApplicationWorkspaceDetail(entityId(req.params.applicationId));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Application '${req.params.applicationId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.recordApplication, route(async (req, res) => {
    const input = RecordApplicationInputSchema.parse(req.body);
    res.status(201).json(await career.applications.recordApplication(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.transitionApplication, route(async (req, res) => {
    const input = TransitionApplicationInputSchema.parse({
      ...req.body,
      applicationId: entityId(req.params.applicationId),
    });
    res.json(await career.applications.transitionApplication(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.submissionIntents, route(async (req, res) => {
    const input = ListSubmissionIntentsInputSchema.parse({
      ...pageQuery(req.query),
      ...(list(req.query.statuses) ? { statuses: list(req.query.statuses) } : {}),
      ...(first(req.query.jobId) ? { jobId: first(req.query.jobId) } : {}),
      ...(first(req.query.updatedBefore) ? { updatedBefore: first(req.query.updatedBefore) } : {}),
      ...(first(req.query.order) ? { order: first(req.query.order) } : {}),
    });
    res.json(await career.submissionIntents.list(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.submissionIntentDetail, route(async (req, res) => {
    const intentId = entityId(req.params.intentId);
    const result = await career.submissionIntents.get(intentId);
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `SubmissionIntent '${intentId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.prepareSubmissionIntent, route(async (req, res) => {
    const input = PrepareSubmissionIntentInputSchema.parse(req.body);
    res.status(201).json(await career.submissionIntents.prepare(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.beginSubmissionIntent, route(async (req, res) => {
    const input = BeginSubmissionIntentInputSchema.parse({ ...req.body, intentId: entityId(req.params.intentId) });
    res.json(await career.submissionIntents.begin(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.confirmSubmissionIntent, route(async (req, res) => {
    const input = ConfirmSubmissionIntentInputSchema.parse({ ...req.body, intentId: entityId(req.params.intentId) });
    res.json(await career.submissionIntents.confirm(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.failSubmissionIntent, route(async (req, res) => {
    const input = FailSubmissionIntentInputSchema.parse({ ...req.body, intentId: entityId(req.params.intentId) });
    res.json(await career.submissionIntents.fail(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.reconcileSubmissionIntent, route(async (req, res) => {
    const input = ReconcileSubmissionIntentInputSchema.parse({ intentId: entityId(req.params.intentId) });
    res.json(await career.submissionIntents.reconcile(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.reconcileSubmissionIntents, route(async (req, res) => {
    const input = ReconcileSubmissionIntentsInputSchema.parse(req.body ?? {});
    res.json(await career.submissionIntents.reconcilePending(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.campaigns, route(async (req, res) => {
    const input = ListCampaignsInputSchema.parse(pageQuery(req.query));
    res.json(await career.campaigns.listCampaigns(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.campaignDetail, route(async (req, res) => {
    const campaignId = entityId(req.params.campaignId);
    const result = await career.campaigns.getCampaign(campaignId);
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Campaign '${campaignId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.upsertCampaign, route(async (req, res) => {
    const input = UpsertCampaignInputSchema.parse({ ...req.body, id: entityId(req.params.campaignId) });
    res.json(await career.campaigns.upsertCampaign(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.resumes, route(async (req, res) => {
    const input = ListResumeUsageInputSchema.parse({
      ...pageQuery(req.query),
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
    });
    res.json(await career.workspace.listResumeUsage(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.savedViews, route(async (req, res) => {
    const input = ListSavedViewsInputSchema.parse({
      ...pageQuery(req.query),
      ...(first(req.query.workspace) ? { workspace: first(req.query.workspace) } : {}),
    });
    res.json(await career.savedViews.listSavedViews(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.upsertSavedView, route(async (req, res) => {
    const input = UpsertSavedViewInputSchema.parse(req.body);
    res.json(await career.savedViews.upsertSavedView(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.deleteSavedView, route(async (req, res) => {
    res.json(await career.savedViews.deleteSavedView(entityId(req.params.savedViewId)));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.beginDiscovery, route(async (req, res) => {
    const input = BeginDiscoveryInputSchema.parse(req.body);
    res.status(201).json(await career.discovery.beginDiscoveryRun(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.completeDiscovery, route(async (req, res) => {
    const input = CompleteDiscoveryInputSchema.parse({
      ...req.body,
      runId: entityId(req.params.runId),
    });
    res.json(await career.discovery.completeDiscoveryRun(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.discovery, route(async (req, res) => {
    const input = ListDiscoveryRunsInputSchema.parse({
      ...pageQuery(req.query),
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
      ...(first(req.query.executor) ? { executor: first(req.query.executor) } : {}),
    });
    res.json(await career.workspace.listDiscoveryRuns(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.discoveryDetail, route(async (req, res) => {
    const runId = entityId(req.params.runId);
    const result = await career.workspace.getDiscoveryRunDetail(runId);
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `DiscoveryRun '${runId}' was not found` } });
      return;
    }
    res.json(result);
  }));
}

export { API_PREFIX };
