import type { CareerApplicationPorts } from '@job-harness/application';
import type { RecruitmentCollectionRuntimeMcpPort } from '@job-harness/mcp';
import { GetJobsRuntimeSiteSchema } from './model';
import type { GetJobsRuntimeClient } from './client';
import { syncGetJobsRuntimeCache } from './sync';

export function deriveCampaignCollectionKeywords(campaign: {
  readonly targetRoles: readonly string[];
  readonly keywords: readonly string[];
}): string[] {
  const preferred: string[] = [];
  const add = (value: string) => { if (!preferred.includes(value)) preferred.push(value); };
  for (const role of campaign.targetRoles) {
    if (/agent|智能体/i.test(role)) { add('Agent'); add('智能体'); }
    if (role.includes('全栈')) { add('全栈开发'); add('Node.js'); }
    if (role.includes('前端')) { add('前端开发'); add('React'); add('TypeScript'); }
    if (/AI\s*应用|大模型应用/i.test(role)) add('AI应用开发');
    if (role.includes('大模型')) add('大模型应用');
  }
  // Campaign keywords may refine a search, never replace the user's chosen role scope.
  if (preferred.length) return preferred.slice(0, 10);
  return [...new Set(campaign.keywords.map((value) => value.trim()).filter(Boolean))].slice(0, 10);
}

/** Exact values verified against the current Zhilian single-select UI (2026-10-20).
 * '应届生' and '无经验' share its unrestricted band, not the 3+ years bands.
 */
export function deriveZhilianExperienceCodes(experience: readonly string[]): string[] {
  const codes: string[] = [];
  const add = (code: string) => { if (!codes.includes(code)) codes.push(code); };
  for (const value of experience) {
    if (['经验不限', '不限', '无经验', '应届生', '往届可'].includes(value)) add('-1');
    else if (['1年以内', '1年以下'].includes(value)) add('0001');
    else if (['1-3年', '1～3年', '1至3年'].includes(value)) add('0103');
  }
  if (!codes.length) throw new Error('Campaign has no Zhilian-supported experience bands; refusing unfiltered collection');
  return codes;
}

export function createGetJobsCollectionRuntimeMcpPort(
  runtime: GetJobsRuntimeClient,
  career: Pick<CareerApplicationPorts, 'campaigns' | 'jobs'>,
): RecruitmentCollectionRuntimeMcpPort {
  return {
    async status(input) {
      const site = GetJobsRuntimeSiteSchema.parse(input.site);
      const health = await runtime.health(site);
      if (health.state !== 'offline') {
        const info = await runtime.runtimeInfo();
        if (!info.collectOnly || info.mode !== 'collect-only') {
          throw new Error('get_jobs runtime is not in Job Harness collect-only mode');
        }
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

      const health = await runtime.health(site);
      if (health.state === 'offline') {
        throw new Error(`${site} runtime is offline`);
      }
      if (health.state === 'login-required') {
        throw new Error(`${site} requires human login before collect-only discovery can start`);
      }
      if (health.state !== 'ready') {
        throw new Error(`${site} runtime is not ready: ${health.state}${health.detail ? ` (${health.detail})` : ''}`);
      }

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

      const experienceCodes = site === 'zhilian' ? deriveZhilianExperienceCodes(campaign.experience) : undefined;
      await runtime.configureCollection(site, { keywords, city, experienceCodes });
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
