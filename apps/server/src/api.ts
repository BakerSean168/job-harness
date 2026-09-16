import type { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  CareerApplicationError,
  type CareerRuntimePorts,
} from '@job-harness/application';
import {
  AnalyticsSnapshotInputSchema,
  DashboardSnapshotInputSchema,
  EntityIdSchema,
  ListApplicationBoardInputSchema,
  ListCampaignsInputSchema,
  ListCompaniesInputSchema,
  ListDiscoveryRunsInputSchema,
  ListResumeUsageInputSchema,
  ListSavedViewsInputSchema,
  RecordApplicationInputSchema,
  SearchJobListItemsInputSchema,
  SetJobStateInputSchema,
  TransitionApplicationInputSchema,
  UpsertCampaignInputSchema,
  UpsertSavedViewInputSchema,
  UpsertJobsBatchInputSchema,
} from '@job-harness/contracts';

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
  if (res.headersSent) {
    res.end();
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        issues: error.issues,
      },
    });
    return;
  }
  if (error instanceof CareerApplicationError) {
    res.status(errorStatus(error)).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
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
  app.get(`${API_PREFIX}/analytics`, route(async (req, res) => {
    const input = AnalyticsSnapshotInputSchema.parse({
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
    });
    res.json(await career.workspace.getAnalyticsSnapshot(input));
  }));

  app.get(`${API_PREFIX}/dashboard`, route(async (req, res) => {
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

  app.get(`${API_PREFIX}/companies`, route(async (req, res) => {
    const input = ListCompaniesInputSchema.parse({
      ...pageQuery(req.query),
      ...(first(req.query.query) ? { query: first(req.query.query) } : {}),
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
    });
    res.json(await career.workspace.listCompanies(input));
  }));

  app.get(`${API_PREFIX}/companies/:companyId`, route(async (req, res) => {
    const companyId = entityId(req.params.companyId);
    const result = await career.workspace.getCompanyDetail(companyId, first(req.query.campaignId));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Company '${companyId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  app.get(`${API_PREFIX}/jobs`, route(async (req, res) => {
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

  app.get(`${API_PREFIX}/jobs/:jobId`, route(async (req, res) => {
    const result = await career.workspace.getJobDetail(entityId(req.params.jobId));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Job '${req.params.jobId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  app.post(`${API_PREFIX}/jobs/batch`, route(async (req, res) => {
    const input = UpsertJobsBatchInputSchema.parse(req.body);
    res.status(200).json(await career.jobs.upsertJobsBatch(input));
  }));

  app.patch(`${API_PREFIX}/jobs/:jobId/state`, route(async (req, res) => {
    const input = SetJobStateInputSchema.parse({ ...req.body, jobId: entityId(req.params.jobId) });
    res.json(await career.jobs.setJobState(input));
  }));

  app.get(`${API_PREFIX}/applications`, route(async (req, res) => {
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

  app.get(`${API_PREFIX}/applications/:applicationId`, route(async (req, res) => {
    const result = await career.workspace.getApplicationWorkspaceDetail(entityId(req.params.applicationId));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Application '${req.params.applicationId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  app.post(`${API_PREFIX}/applications`, route(async (req, res) => {
    const input = RecordApplicationInputSchema.parse(req.body);
    res.status(201).json(await career.applications.recordApplication(input));
  }));

  app.post(`${API_PREFIX}/applications/:applicationId/transition`, route(async (req, res) => {
    const input = TransitionApplicationInputSchema.parse({
      ...req.body,
      applicationId: entityId(req.params.applicationId),
    });
    res.json(await career.applications.transitionApplication(input));
  }));

  app.get(`${API_PREFIX}/campaigns`, route(async (req, res) => {
    const input = ListCampaignsInputSchema.parse(pageQuery(req.query));
    res.json(await career.campaigns.listCampaigns(input));
  }));

  app.get(`${API_PREFIX}/campaigns/:campaignId`, route(async (req, res) => {
    const campaignId = entityId(req.params.campaignId);
    const result = await career.campaigns.getCampaign(campaignId);
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Campaign '${campaignId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  app.put(`${API_PREFIX}/campaigns/:campaignId`, route(async (req, res) => {
    const input = UpsertCampaignInputSchema.parse({ ...req.body, id: entityId(req.params.campaignId) });
    res.json(await career.campaigns.upsertCampaign(input));
  }));

  app.get(`${API_PREFIX}/resumes`, route(async (req, res) => {
    const input = ListResumeUsageInputSchema.parse({
      ...pageQuery(req.query),
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
    });
    res.json(await career.workspace.listResumeUsage(input));
  }));

  app.get(`${API_PREFIX}/saved-views`, route(async (req, res) => {
    const input = ListSavedViewsInputSchema.parse({
      ...pageQuery(req.query),
      ...(first(req.query.workspace) ? { workspace: first(req.query.workspace) } : {}),
    });
    res.json(await career.savedViews.listSavedViews(input));
  }));

  app.post(`${API_PREFIX}/saved-views`, route(async (req, res) => {
    const input = UpsertSavedViewInputSchema.parse(req.body);
    res.json(await career.savedViews.upsertSavedView(input));
  }));

  app.delete(`${API_PREFIX}/saved-views/:savedViewId`, route(async (req, res) => {
    res.json(await career.savedViews.deleteSavedView(entityId(req.params.savedViewId)));
  }));

  app.get(`${API_PREFIX}/discovery`, route(async (req, res) => {
    const input = ListDiscoveryRunsInputSchema.parse({
      ...pageQuery(req.query),
      ...(first(req.query.campaignId) ? { campaignId: first(req.query.campaignId) } : {}),
      ...(first(req.query.executor) ? { executor: first(req.query.executor) } : {}),
    });
    res.json(await career.workspace.listDiscoveryRuns(input));
  }));

  app.get(`${API_PREFIX}/discovery/:runId`, route(async (req, res) => {
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
