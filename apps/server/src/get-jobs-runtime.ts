import { z } from 'zod';
import type { UpsertJobCandidate, UpsertJobsBatchInput, UpsertJobsBatchOutput } from '@job-harness/contracts';
import type { CareerApplicationPorts } from '@job-harness/application';
import type { RecruitmentCollectionRuntimeMcpPort } from '@job-harness/mcp';
import {
  RecruitmentRuntimeDescriptorSchema,
  RecruitmentRuntimeHealthSchema,
  type RecruitmentRuntimeDescriptor,
  type RecruitmentRuntimeHealth,
} from '@job-harness/recruitment-runtime-contracts';

export const GET_JOBS_UPSTREAM_COMMIT = 'ec3c81c3bf3c09d155cb7f76604e6fca2567612c';
export const GET_JOBS_UPSTREAM_REPOSITORY = 'https://github.com/vvvsrx/get_jobs.git';
export const GET_JOBS_RUNTIME_VERSION = `${GET_JOBS_UPSTREAM_COMMIT.slice(0, 12)}+jh-collect-overlay-v1`;

export const GetJobsRuntimeSiteSchema = z.enum(['zhilian', 'liepin', 'job51']);
export type GetJobsRuntimeSite = z.infer<typeof GetJobsRuntimeSiteSchema>;

const SITE_LABELS: Record<GetJobsRuntimeSite, string> = {
  zhilian: '智联招聘',
  liepin: '猎聘',
  job51: '51job',
};

const SITE_BASE_URLS: Record<GetJobsRuntimeSite, string> = {
  zhilian: 'https://www.zhaopin.com/',
  liepin: 'https://www.liepin.com/',
  job51: 'https://we.51job.com/',
};

const StatusSchema = z.object({
  running: z.boolean(),
  current: z.string().nullable().optional(),
  total: z.unknown().nullable().optional(),
  platform: z.string().nullable().optional(),
  delivered_count: z.number().int().nonnegative().default(0),
  filtered_count: z.number().int().nonnegative().default(0),
}).passthrough();

const LoginStatusSchema = z.object({
  success: z.boolean(),
  isLoggedIn: z.boolean(),
  message: z.string().optional(),
}).passthrough();

const RuntimeInfoSchema = z.object({
  integration: z.literal('job-harness'),
  collectOnly: z.boolean(),
  mode: z.enum(['collect-only', 'upstream-default']),
}).passthrough();

const ActionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  status: z.string().nullable().optional(),
}).passthrough();

const RuntimeConfigOptionSchema = z.object({
  type: z.string().optional(),
  name: z.string(),
  code: z.string(),
}).passthrough();
const RuntimeConfigResponseSchema = z.object({
  success: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  options: z.record(z.string(), z.array(RuntimeConfigOptionSchema)),
}).passthrough();

const CommonRowSchema = z.object({
  id: z.number().int().nonnegative(),
  job_id: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  job_link: z.string().nullable().optional(),
  delivered: z.number().int().nullable().optional(),
  created_at: z.string().nullable().optional(),
}).passthrough();

const ZhilianRowSchema = CommonRowSchema.extend({
  salary: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  experience: z.string().nullable().optional(),
  degree: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  company_tag: z.string().nullable().optional(),
}).passthrough();

const LiepinRowSchema = CommonRowSchema.extend({
  job_salary_text: z.string().nullable().optional(),
  job_area: z.string().nullable().optional(),
  job_edu_req: z.string().nullable().optional(),
  job_exp_req: z.string().nullable().optional(),
  job_publish_time: z.string().nullable().optional(),
  comp_id: z.string().nullable().optional(),
  comp_name: z.string().nullable().optional(),
  comp_industry: z.string().nullable().optional(),
  comp_scale: z.string().nullable().optional(),
  hr_id: z.string().nullable().optional(),
  hr_name: z.string().nullable().optional(),
  hr_title: z.string().nullable().optional(),
}).passthrough();

const Job51RowSchema = LiepinRowSchema;

const ListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.record(z.string(), z.unknown())),
  total: z.number().int().nonnegative(),
}).passthrough();

export type GetJobsRuntimeRow = z.infer<typeof ZhilianRowSchema> | z.infer<typeof LiepinRowSchema> | z.infer<typeof Job51RowSchema>;

export interface GetJobsRuntimeClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly requestTimeoutMs?: number;
}

export interface GetJobsRuntimeListInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: 'pending' | 'delivered';
}

export interface GetJobsRuntimeImportInput {
  readonly observedAt?: string;
  readonly discoveryRunId?: string | null;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('get_jobs runtime URL must use HTTP(S)');
  if (url.username || url.password) throw new Error('get_jobs runtime URL must not contain credentials');
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

function text(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function normalizeListingUrl(site: GetJobsRuntimeSite, value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw, SITE_BASE_URLS[site]);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function parseRow(site: GetJobsRuntimeSite, raw: Record<string, unknown>): GetJobsRuntimeRow {
  if (site === 'zhilian') return ZhilianRowSchema.parse(raw);
  if (site === 'liepin') return LiepinRowSchema.parse(raw);
  return Job51RowSchema.parse(raw);
}

function descriptor(site: GetJobsRuntimeSite): RecruitmentRuntimeDescriptor {
  return RecruitmentRuntimeDescriptorSchema.parse({
    runtimeId: `get-jobs-${site}`,
    runtimeVersion: GET_JOBS_RUNTIME_VERSION,
    site,
    implementation: 'upstream-direct',
    upstream: {
      project: 'vvvsrx-get-jobs',
      repository: GET_JOBS_UPSTREAM_REPOSITORY,
      commit: GET_JOBS_UPSTREAM_COMMIT,
      license: 'MIT',
    },
    capabilities: ['discovery', 'inspect-job'],
    browserProfile: 'dedicated',
    controlGranularity: 'business-task',
  });
}

export const GET_JOBS_RUNTIME_DESCRIPTORS = Object.freeze({
  zhilian: descriptor('zhilian'),
  liepin: descriptor('liepin'),
  job51: descriptor('job51'),
});

export function getJobsRuntimeRowToCandidate(
  site: GetJobsRuntimeSite,
  raw: Record<string, unknown>,
  input: GetJobsRuntimeImportInput = {},
): UpsertJobCandidate | null {
  const row = parseRow(site, raw) as Record<string, unknown>;
  const title = text(row.job_title, 500);
  const companyName = text(site === 'zhilian' ? row.company_name : row.comp_name, 300);
  if (!title || !companyName) return null;

  const externalId = text(row.job_id, 300);
  const url = normalizeListingUrl(site, row.job_link);
  if (!externalId && !url) return null;

  const city = text(site === 'zhilian' ? row.location : row.job_area, 200);
  const salary = text(site === 'zhilian' ? row.salary : row.job_salary_text, 200);
  const experience = text(site === 'zhilian' ? row.experience : row.job_exp_req, 200);
  const education = text(site === 'zhilian' ? row.degree : row.job_edu_req, 200);
  const observedAt = input.observedAt ?? new Date().toISOString();
  const upstreamCreatedAt = text(row.created_at, 100);

  const metadataSnapshot: Record<string, unknown> = {
    source: 'vvvsrx-get-jobs',
    upstreamProject: 'vvvsrx/get_jobs',
    upstreamCommit: GET_JOBS_UPSTREAM_COMMIT,
    collectOnlyOverlay: true,
    upstreamRowId: row.id,
    upstreamDelivered: row.delivered === 1,
  };
  if (salary) metadataSnapshot.salary = salary;
  if (experience) metadataSnapshot.experience = experience;
  if (education) metadataSnapshot.education = education;
  if (upstreamCreatedAt) metadataSnapshot.upstreamCreatedAt = upstreamCreatedAt;

  if (site !== 'zhilian') {
    for (const key of ['job_publish_time', 'comp_id', 'comp_industry', 'comp_scale', 'hr_id', 'hr_name', 'hr_title'] as const) {
      const value = text(row[key], 300);
      if (value) metadataSnapshot[key] = value;
    }
  } else {
    const companyTag = text(row.company_tag, 300);
    if (companyTag) metadataSnapshot.companyTag = companyTag;
  }

  return {
    companyName,
    title,
    ...(city ? { city } : {}),
    observedAt,
    ...(input.discoveryRunId ? { discoveryRunId: input.discoveryRunId } : {}),
    listings: [{
      sourceKind: site,
      label: SITE_LABELS[site],
      ...(url ? { url } : {}),
      ...(externalId ? {
        externalNamespace: `vvvsrx-get-jobs:${site}`,
        externalId,
        identityKind: 'external-id' as const,
      } : {
        identityKind: 'url' as const,
      }),
      status: 'active',
      metadataSnapshot,
    }],
  };
}

export function createGetJobsRuntimeClient(options: GetJobsRuntimeClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const requestTimeoutMs = Math.max(1_000, Math.min(60_000, options.requestTimeoutMs ?? 10_000));

  const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`get_jobs runtime request failed: http_${response.status}`);
    return payload;
  };

  const list = async (siteInput: GetJobsRuntimeSite, input: GetJobsRuntimeListInput = {}): Promise<{ total: number; items: GetJobsRuntimeRow[] }> => {
    const site = GetJobsRuntimeSiteSchema.parse(siteInput);
    const limit = Math.max(1, Math.min(1000, Math.trunc(input.limit ?? 100)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (input.status) query.set('status', input.status);
    const response = ListResponseSchema.parse(await request(`/api/${site}/list?${query.toString()}`));
    if (!response.success) throw new Error(`get_jobs ${site} list request reported failure`);
    return {
      total: response.total,
      items: response.data.map((row) => parseRow(site, row)),
    };
  };

  return {
    descriptor(siteInput: GetJobsRuntimeSite): RecruitmentRuntimeDescriptor {
      const site = GetJobsRuntimeSiteSchema.parse(siteInput);
      return GET_JOBS_RUNTIME_DESCRIPTORS[site];
    },

    async runtimeInfo() {
      return RuntimeInfoSchema.parse(await request('/api/job-harness-runtime'));
    },

    async taskStatus(siteInput: GetJobsRuntimeSite) {
      const site = GetJobsRuntimeSiteSchema.parse(siteInput);
      return StatusSchema.parse(await request(`/api/${site}/status`));
    },

    async configureCollection(siteInput: GetJobsRuntimeSite, input: { keywords: readonly string[]; city: string }) {
      const site = GetJobsRuntimeSiteSchema.parse(siteInput);
      const info = RuntimeInfoSchema.parse(await request('/api/job-harness-runtime'));
      if (!info.collectOnly || info.mode !== 'collect-only') {
        throw new Error('get_jobs runtime is not in Job Harness collect-only mode; refusing to configure collection');
      }
      const current = RuntimeConfigResponseSchema.parse(await request(`/api/${site}/config`));
      if (!current.success) throw new Error(`get_jobs ${site} config request reported failure`);
      const optionKey = site === 'job51' ? 'jobArea' : 'city';
      const options = current.options[optionKey] ?? [];
      const cityOption = options.find((item) => item.name === input.city);
      if (!cityOption) throw new Error(`get_jobs ${site} does not expose an exact city option for '${input.city}'`);
      const keywords = [...new Set(input.keywords.map((value) => value.trim()).filter(Boolean))].slice(0, 12);
      if (!keywords.length) throw new Error('At least one collection keyword is required');
      const payload = site === 'job51'
        ? { keywords: keywords.join(','), jobArea: cityOption.code }
        : { keywords: keywords.join(','), cityCode: cityOption.code };
      const result = ActionResponseSchema.parse(await request(`/api/${site}/config`, { method: 'PUT', body: JSON.stringify(payload) }));
      if (!result.success) throw new Error(`get_jobs ${site} config update failed: ${result.message}`);
      return { city: input.city, cityCode: cityOption.code, keywords };
    },

    async login(siteInput: GetJobsRuntimeSite) {
      const site = GetJobsRuntimeSiteSchema.parse(siteInput);
      const info = RuntimeInfoSchema.parse(await request('/api/job-harness-runtime'));
      if (!info.collectOnly || info.mode !== 'collect-only') {
        throw new Error('get_jobs runtime is not in Job Harness collect-only mode; refusing to open a platform login');
      }
      const result = ActionResponseSchema.parse(await request(`/api/${site}/login`, { method: 'POST' }));
      if (!result.success) throw new Error(`get_jobs ${site} login failed: ${result.status ?? result.message}`);
      return result;
    },

    async startCollection(siteInput: GetJobsRuntimeSite) {
      const site = GetJobsRuntimeSiteSchema.parse(siteInput);
      const info = RuntimeInfoSchema.parse(await request('/api/job-harness-runtime'));
      if (!info.collectOnly || info.mode !== 'collect-only') {
        throw new Error('get_jobs runtime is not in Job Harness collect-only mode; refusing to call upstream start');
      }
      const result = ActionResponseSchema.parse(await request(`/api/${site}/start`, { method: 'POST' }));
      if (!result.success) throw new Error(`get_jobs ${site} collection start failed: ${result.status ?? result.message}`);
      return result;
    },

    async stop(siteInput: GetJobsRuntimeSite) {
      const site = GetJobsRuntimeSiteSchema.parse(siteInput);
      return ActionResponseSchema.parse(await request(`/api/${site}/stop`, { method: 'POST' }));
    },

    async health(siteInput: GetJobsRuntimeSite): Promise<RecruitmentRuntimeHealth> {
      const site = GetJobsRuntimeSiteSchema.parse(siteInput);
      const checkedAt = new Date().toISOString();
      try {
        const [status, login] = await Promise.all([
          request(`/api/${site}/status`).then((value) => StatusSchema.parse(value)),
          request(`/api/${site}/login-status`).then((value) => LoginStatusSchema.parse(value)),
        ]);
        const state = !login.isLoggedIn ? 'login-required' : 'ready';
        return RecruitmentRuntimeHealthSchema.parse({
          runtimeId: GET_JOBS_RUNTIME_DESCRIPTORS[site].runtimeId,
          site,
          state,
          browserConnected: status.running,
          activeTaskId: null,
          lastEventAt: null,
          detail: `${status.running ? 'running' : 'idle'}; delivered=${status.delivered_count}; filtered=${status.filtered_count}${status.current ? `; ${status.current}` : ''}`,
          checkedAt,
        });
      } catch (error) {
        return RecruitmentRuntimeHealthSchema.parse({
          runtimeId: GET_JOBS_RUNTIME_DESCRIPTORS[site].runtimeId,
          site,
          state: 'offline',
          browserConnected: false,
          activeTaskId: null,
          lastEventAt: null,
          detail: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
          checkedAt,
        });
      }
    },

    list,

    async collectCandidates(siteInput: GetJobsRuntimeSite, input: GetJobsRuntimeListInput & GetJobsRuntimeImportInput = {}): Promise<{ total: number; candidates: UpsertJobCandidate[]; rejected: number }> {
      const site = GetJobsRuntimeSiteSchema.parse(siteInput);
      const page = await list(site, input);
      const candidates = page.items.flatMap((row) => {
        const candidate = getJobsRuntimeRowToCandidate(site, row as unknown as Record<string, unknown>, input);
        return candidate ? [candidate] : [];
      });
      return { total: page.total, candidates, rejected: page.items.length - candidates.length };
    },
  };
}

export type GetJobsRuntimeClient = ReturnType<typeof createGetJobsRuntimeClient>;

export interface GetJobsCanonicalJobSink {
  upsertJobsBatch(input: UpsertJobsBatchInput): Promise<UpsertJobsBatchOutput>;
}

export interface SyncGetJobsRuntimeCacheOptions {
  readonly site: GetJobsRuntimeSite;
  readonly discoveryRunId?: string | null;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly status?: 'pending' | 'delivered';
  readonly observedAt?: string;
}

export interface SyncGetJobsRuntimeCacheResult {
  readonly site: GetJobsRuntimeSite;
  readonly upstreamTotal: number;
  readonly scanned: number;
  readonly normalized: number;
  readonly normalizationRejected: number;
  readonly inserted: number;
  readonly updated: number;
  readonly duplicate: number;
  readonly persistenceRejected: number;
}

function deriveCampaignCollectionKeywords(campaign: { readonly targetRoles: readonly string[]; readonly keywords: readonly string[] }): string[] {
  const preferred: string[] = [];
  for (const role of campaign.targetRoles) {
    if (/agent/i.test(role) && !preferred.includes('Agent')) preferred.push('Agent');
    if (role.includes('全栈') && !preferred.includes('全栈开发')) preferred.push('全栈开发');
    if (role.includes('前端') && !preferred.includes('前端开发')) preferred.push('前端开发');
  }
  if (preferred.length) return preferred;
  return [...new Set(campaign.keywords.map((value) => value.trim()).filter(Boolean))].slice(0, 6);
}

export function createGetJobsCollectionRuntimeMcpPort(
  runtime: GetJobsRuntimeClient,
  career: Pick<CareerApplicationPorts, 'campaigns' | 'jobs'>,
): RecruitmentCollectionRuntimeMcpPort {
  return {
    async status(input) {
      const site = GetJobsRuntimeSiteSchema.parse(input.site);
      const [info, health] = await Promise.all([runtime.runtimeInfo(), runtime.health(site)]);
      if (!info.collectOnly || info.mode !== 'collect-only') {
        throw new Error('get_jobs runtime is not in Job Harness collect-only mode');
      }
      return {
        descriptor: runtime.descriptor(site),
        health,
        integration: 'job-harness',
        collectOnly: true,
        mode: 'collect-only',
      };
    },

    async start(input) {
      const site = GetJobsRuntimeSiteSchema.parse(input.site);
      const campaign = await career.campaigns.getCampaign(input.campaignId);
      if (!campaign || campaign.status !== 'active') throw new Error(`Campaign '${input.campaignId}' is not active`);
      if (!campaign.automation.collection.enabled) throw new Error(`Campaign '${input.campaignId}' has collection disabled`);
      const city = input.city ?? campaign.cities[0];
      if (!city) throw new Error(`Campaign '${input.campaignId}' has no target city`);
      if (!campaign.cities.includes(city)) throw new Error(`City '${city}' is not enabled by Campaign '${input.campaignId}'`);
      const keywords = deriveCampaignCollectionKeywords(campaign);
      if (!keywords.length) throw new Error(`Campaign '${input.campaignId}' has no usable collection keywords`);

      const info = await runtime.runtimeInfo();
      if (!info.collectOnly || info.mode !== 'collect-only') {
        throw new Error('get_jobs runtime is not in Job Harness collect-only mode; refusing collection start');
      }
      const current = await runtime.taskStatus(site);
      if (current.running) {
        if (current.platform && current.platform !== site) {
          throw new Error(`get_jobs runtime is already running platform '${current.platform}'`);
        }
        return {
          site,
          success: true,
          message: `${site} collect-only runtime is already running`,
          status: 'running',
          reused: true,
          campaignId: campaign.id,
          city,
          keywords,
        };
      }

      const health = await runtime.health(site);
      if (health.state === 'login-required') {
        throw new Error(`${site} requires human login before collect-only discovery can start`);
      }
      if (health.state !== 'ready') {
        throw new Error(`${site} runtime is not ready: ${health.state}${health.detail ? ` (${health.detail})` : ''}`);
      }

      await runtime.configureCollection(site, { keywords, city });
      const result = await runtime.startCollection(site);
      return {
        site,
        success: result.success,
        message: result.message,
        status: result.status ?? null,
        reused: false,
        campaignId: campaign.id,
        city,
        keywords,
      };
    },

    async stop(input) {
      const site = GetJobsRuntimeSiteSchema.parse(input.site);
      const current = await runtime.taskStatus(site);
      if (!current.running) {
        return {
          site,
          success: true,
          message: `${site} collect-only runtime is already stopped`,
          status: 'stopped',
          reused: true,
          campaignId: null,
          city: null,
          keywords: [],
        };
      }
      const result = await runtime.stop(site);
      return {
        site,
        success: result.success,
        message: result.message,
        status: result.status ?? 'stopped',
        reused: false,
        campaignId: null,
        city: null,
        keywords: [],
      };
    },

    async sync(input) {
      const site = GetJobsRuntimeSiteSchema.parse(input.site);
      const info = await runtime.runtimeInfo();
      if (!info.collectOnly || info.mode !== 'collect-only') {
        throw new Error('Refusing canonical Job sync from a get_jobs runtime that is not marked collect-only');
      }
      return syncGetJobsRuntimeCache(runtime, career.jobs, {
        site,
        discoveryRunId: input.discoveryRunId ?? null,
        pageSize: input.pageSize,
        maxPages: input.maxPages,
      });
    },
  };
}

export async function syncGetJobsRuntimeCache(
  runtime: GetJobsRuntimeClient,
  jobs: GetJobsCanonicalJobSink,
  options: SyncGetJobsRuntimeCacheOptions,
): Promise<SyncGetJobsRuntimeCacheResult> {
  const site = GetJobsRuntimeSiteSchema.parse(options.site);
  const pageSize = Math.max(1, Math.min(1000, Math.trunc(options.pageSize ?? 100)));
  const maxPages = Math.max(1, Math.min(100, Math.trunc(options.maxPages ?? 20)));
  const observedAt = options.observedAt ?? new Date().toISOString();
  let upstreamTotal = 0;
  let scanned = 0;
  let normalized = 0;
  let normalizationRejected = 0;
  let inserted = 0;
  let updated = 0;
  let duplicate = 0;
  let persistenceRejected = 0;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await runtime.list(site, {
      limit: pageSize,
      offset: pageIndex * pageSize,
      ...(options.status ? { status: options.status } : {}),
    });
    upstreamTotal = page.total;
    scanned += page.items.length;
    const candidates = page.items.flatMap((row) => {
      const candidate = getJobsRuntimeRowToCandidate(site, row as unknown as Record<string, unknown>, {
        observedAt,
        discoveryRunId: options.discoveryRunId ?? null,
      });
      if (!candidate) {
        normalizationRejected += 1;
        return [];
      }
      return [candidate];
    });
    normalized += candidates.length;

    for (let index = 0; index < candidates.length; index += 100) {
      const batch = candidates.slice(index, index + 100);
      if (!batch.length) continue;
      const result = await jobs.upsertJobsBatch({ jobs: batch });
      for (const item of result.items) {
        if (item.status === 'inserted') inserted += 1;
        else if (item.status === 'updated') updated += 1;
        else if (item.status === 'duplicate') duplicate += 1;
        else persistenceRejected += 1;
      }
    }

    if (page.items.length < pageSize || scanned >= page.total) break;
  }

  return {
    site,
    upstreamTotal,
    scanned,
    normalized,
    normalizationRejected,
    inserted,
    updated,
    duplicate,
    persistenceRejected,
  };
}
