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
