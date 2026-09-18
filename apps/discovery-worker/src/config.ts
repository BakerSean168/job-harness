function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1','true','yes','on'].includes(raw)) return true;
  if (['0','false','no','off'].includes(raw)) return false;
  throw new Error(`${name} must be a boolean`);
}
function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
export function readDiscoveryWorkerConfig() {
  const provider = process.env.JOB_HARNESS_DISCOVERY_PROVIDER?.trim() || 'zhilian';
  if (provider !== 'zhilian' && provider !== 'liepin') throw new Error(`Unsupported JOB_HARNESS_DISCOVERY_PROVIDER '${provider}'`);
  return {
    provider,
    campaignId: process.env.JOB_HARNESS_DISCOVERY_CAMPAIGN_ID?.trim() || '2026-grad-agent-fullstack-frontend',
    apiUrl: (process.env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:20901/api/v1').replace(/\/+$/, ''),
    authToken: required('JOB_HARNESS_AUTH_TOKEN'),
    zhilian: {
      pageSize: integer('JOB_HARNESS_ZHILIAN_PAGE_SIZE', 20, 1, 50),
      pagesPerQuery: integer('JOB_HARNESS_ZHILIAN_PAGES_PER_QUERY', 1, 1, 3),
      queryDelayMs: integer('JOB_HARNESS_ZHILIAN_QUERY_DELAY_MS', 1500, 0, 30_000),
      maxTerms: integer('JOB_HARNESS_ZHILIAN_MAX_TERMS', 20, 1, 50),
    },
    liepin: {
      pageSize: integer('JOB_HARNESS_LIEPIN_PAGE_SIZE', 40, 1, 40),
      pagesPerQuery: integer('JOB_HARNESS_LIEPIN_PAGES_PER_QUERY', 1, 1, 2),
      queryDelayMs: integer('JOB_HARNESS_LIEPIN_QUERY_DELAY_MS', 2500, 0, 30_000),
      maxTerms: integer('JOB_HARNESS_LIEPIN_MAX_TERMS', 8, 1, 20),
      maxAgeDays: integer('JOB_HARNESS_LIEPIN_MAX_AGE_DAYS', 60, 1, 365),
      detailEnrichment: boolean('JOB_HARNESS_LIEPIN_DETAIL_ENRICHMENT', true),
      detailDelayMs: integer('JOB_HARNESS_LIEPIN_DETAIL_DELAY_MS', 1200, 0, 30_000),
      maxDetailCandidates: integer('JOB_HARNESS_LIEPIN_MAX_DETAIL_CANDIDATES', 24, 0, 100),
    },
    qualification: {
      enabled: boolean('JOB_HARNESS_DISCOVERY_AUTO_QUALIFY', false),
      dryRun: boolean('JOB_HARNESS_QUALIFICATION_DRY_RUN', false),
      autoPrepare: boolean('JOB_HARNESS_QUALIFICATION_AUTO_PREPARE', true),
      minScore: integer('JOB_HARNESS_QUALIFICATION_MIN_SCORE', 58, 1, 100),
      titleOnlyMinTitleScore: integer('JOB_HARNESS_QUALIFICATION_TITLE_ONLY_MIN_TITLE_SCORE', 28, 1, 100),
      maxJobs: integer('JOB_HARNESS_QUALIFICATION_MAX_JOBS', 250, 1, 1000),
    },
  };
}
