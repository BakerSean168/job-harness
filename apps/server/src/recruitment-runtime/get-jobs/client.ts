import type { UpsertJobCandidate } from '@job-harness/contracts';
import {
  RecruitmentRuntimeHealthSchema,
  type RecruitmentRuntimeHealth,
} from '@job-harness/recruitment-runtime-contracts';
import {
  ActionResponseSchema,
  GET_JOBS_RUNTIME_DESCRIPTORS,
  GetJobsRuntimeSiteSchema,
  ListResponseSchema,
  LoginStatusSchema,
  RuntimeConfigResponseSchema,
  RuntimeInfoSchema,
  StatusSchema,
  parseGetJobsRuntimeRow,
  type GetJobsRuntimeRow,
  type GetJobsRuntimeSite,
} from './model';
import { getJobsRuntimeRowToCandidate, type GetJobsRuntimeImportInput } from './mapper';

export interface GetJobsRuntimeClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly requestTimeoutMs?: number;
  readonly healthTimeoutMs?: number;
}

export interface GetJobsRuntimeListInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: 'pending' | 'delivered';
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('get_jobs runtime URL must use HTTP(S)');
  if (url.username || url.password) throw new Error('get_jobs runtime URL must not contain credentials');
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

function runtimeOfflineDetail(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || /timeout|timed out|aborted/i.test(error.message)) return 'offline:health-timeout';
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause && typeof cause === 'object' && 'code' in cause && typeof (cause as { code?: unknown }).code === 'string') {
      return `offline:${String((cause as { code: string }).code).trim().toLowerCase().slice(0, 80)}`;
    }
    const token = error.message.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
    return token ? `offline:${token}` : 'offline:unknown-error';
  }
  return 'offline:unknown-error';
}

export function createGetJobsRuntimeClient(options: GetJobsRuntimeClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const requestTimeoutMs = Math.max(1_000, Math.min(60_000, options.requestTimeoutMs ?? 10_000));
  const healthTimeoutMs = Math.max(100, Math.min(10_000, options.healthTimeoutMs ?? 2_500));

  const request = async (path: string, init: RequestInit = {}, timeoutMs = requestTimeoutMs): Promise<unknown> => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`get_jobs runtime request failed: http_${response.status}`);
    return payload;
  };

  const list = async (
    siteInput: GetJobsRuntimeSite,
    input: GetJobsRuntimeListInput = {},
  ): Promise<{ total: number; items: GetJobsRuntimeRow[] }> => {
    const site = GetJobsRuntimeSiteSchema.parse(siteInput);
    const limit = Math.max(1, Math.min(1000, Math.trunc(input.limit ?? 100)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (input.status) query.set('status', input.status);
    const response = ListResponseSchema.parse(await request(`/api/${site}/list?${query.toString()}`));
    if (!response.success) throw new Error(`get_jobs ${site} list request reported failure`);
    return {
      total: response.total,
      items: response.data.map((row) => parseGetJobsRuntimeRow(site, row)),
    };
  };

  return {
    descriptor(siteInput: GetJobsRuntimeSite) {
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
          request(`/api/${site}/status`, {}, healthTimeoutMs).then((value) => StatusSchema.parse(value)),
          request(`/api/${site}/login-status`, {}, healthTimeoutMs).then((value) => LoginStatusSchema.parse(value)),
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
          detail: runtimeOfflineDetail(error),
          checkedAt,
        });
      }
    },

    list,

    async collectCandidates(
      siteInput: GetJobsRuntimeSite,
      input: GetJobsRuntimeListInput & GetJobsRuntimeImportInput = {},
    ): Promise<{ total: number; candidates: UpsertJobCandidate[]; rejected: number }> {
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
