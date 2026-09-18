function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
export function readDiscoveryWorkerConfig() {
  const provider = process.env.JOB_HARNESS_DISCOVERY_PROVIDER?.trim() || 'zhilian';
  if (provider !== 'zhilian') throw new Error(`Unsupported JOB_HARNESS_DISCOVERY_PROVIDER '${provider}'`);
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
  };
}
