import { LocalCdpBrowserBackend, SteelBrowserBackend, type BrowserBackendPort } from '@job-harness/apply-browser';
import { BossExtensionValidationBackend } from './extension-backend';
import { runBossBrowserDiscovery, type BossBrowserBridgePort, type BossBrowserScoreDecision } from './runtime';

const config = readConfig(process.env);
const backend = createBackend(config);
const bridge = createBridge(config.bridgeUrl);
const result = await runBossBrowserDiscovery({
  backend,
  bridge,
  profileId: config.profileId,
  keywords: config.keywords,
  maxKeywords: config.maxKeywords,
  maxJobsPerKeyword: config.maxJobsPerKeyword,
  maxTotalJobs: config.maxTotalJobs,
  threshold: config.threshold,
  waitLogin: config.waitLogin,
  loginTimeoutMs: config.loginTimeoutMs,
});
console.log(JSON.stringify(result, null, 2));
// A retained Steel human-handoff intentionally keeps the remote browser session
// alive. Force the one-shot worker process to drop its local CDP/WebSocket handles
// after stdout has had a short flush window, without releasing the remote session.
const exitCode = result.status === 'completed' ? 0 : 2;
await new Promise((resolve) => setTimeout(resolve, 20));
process.exit(exitCode);

function createBackend(config: ReturnType<typeof readConfig>): BrowserBackendPort {
  if (config.provider === 'local-cdp') {
    return new LocalCdpBrowserBackend({ endpoint: config.localCdpUrl });
  }
  if (config.provider === 'extension') {
    return new BossExtensionValidationBackend({
      apiUrl: config.jobHarnessApiUrl,
      authToken: config.jobHarnessAuthToken,
      agentId: config.browserExtensionAgentId,
      commandTimeoutMs: 30_000,
    });
  }
  return new SteelBrowserBackend({
    baseUrl: config.steelBaseUrl,
    viewerBaseUrl: config.steelViewerBaseUrl,
    contextPath: config.steelContextPath,
    timezone: config.timezone,
    headless: config.steelHeadless,
    requestTimeoutMs: 15_000,
  });
}

function createBridge(baseUrl: string): BossBrowserBridgePort {
  const base = baseUrl.replace(/\/+$/, '');
  async function json(path: string, init: RequestInit = {}): Promise<any> {
    const response = await fetch(base + path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error('BOSS bridge ' + path + ' failed with HTTP ' + response.status + ': ' + text.replace(/\s+/g, ' ').slice(0, 300));
    return text ? JSON.parse(text) : null;
  }
  return {
    async listKeywords(profileId) {
      const body = await json('/p/' + encodeURIComponent(profileId) + '/tags');
      return Array.isArray(body?.tags) ? body.tags.map(String).filter(Boolean) : [];
    },
    async score(profileId, legacyJobText) {
      return await json('/p/' + encodeURIComponent(profileId) + '/get-job-score', {
        method: 'POST',
        body: JSON.stringify({ job: legacyJobText }),
      }) as BossBrowserScoreDecision;
    },
    async reportDiscovery(input) {
      await json('/api/discovery/report', { method: 'POST', body: JSON.stringify(input) });
    },
    async logDecision(profileId, input) {
      await json('/p/' + encodeURIComponent(profileId) + '/log-action', { method: 'POST', body: JSON.stringify(input) });
    },
  };
}

function readConfig(env: NodeJS.ProcessEnv) {
  const provider = (env.JOB_HARNESS_BOSS_BROWSER_PROVIDER?.trim() || 'extension') as 'steel' | 'local-cdp' | 'extension';
  if (!['steel', 'local-cdp', 'extension'].includes(provider)) throw new Error("JOB_HARNESS_BOSS_BROWSER_PROVIDER must be 'steel', 'local-cdp', or 'extension'");
  return {
    provider,
    bridgeUrl: httpUrl(env.JOB_HARNESS_BOSS_BRIDGE_URL?.trim() || 'http://127.0.0.1:18788', 'JOB_HARNESS_BOSS_BRIDGE_URL'),
    jobHarnessApiUrl: httpUrl(env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:20901', 'JOB_HARNESS_API_URL'),
    jobHarnessAuthToken: env.JOB_HARNESS_AUTH_TOKEN?.trim() || '',
    browserExtensionAgentId: env.JOB_HARNESS_BROWSER_EXTENSION_AGENT_ID?.trim() || 'windows-chrome-primary',
    profileId: env.JOB_HARNESS_BOSS_BROWSER_PROFILE_ID?.trim() || 'ai-agent-app',
    keywords: csv(env.JOB_HARNESS_BOSS_BROWSER_KEYWORDS),
    maxKeywords: integer(env.JOB_HARNESS_BOSS_BROWSER_MAX_KEYWORDS, 8, 1, 20, 'JOB_HARNESS_BOSS_BROWSER_MAX_KEYWORDS'),
    maxJobsPerKeyword: integer(env.JOB_HARNESS_BOSS_BROWSER_MAX_JOBS_PER_KEYWORD, 20, 1, 100, 'JOB_HARNESS_BOSS_BROWSER_MAX_JOBS_PER_KEYWORD'),
    maxTotalJobs: integer(env.JOB_HARNESS_BOSS_BROWSER_MAX_TOTAL_JOBS, 80, 1, 250, 'JOB_HARNESS_BOSS_BROWSER_MAX_TOTAL_JOBS'),
    threshold: integer(env.JOB_HARNESS_BOSS_BROWSER_THRESHOLD, 58, 0, 100, 'JOB_HARNESS_BOSS_BROWSER_THRESHOLD'),
    waitLogin: bool(env.JOB_HARNESS_BOSS_BROWSER_WAIT_LOGIN, false),
    loginTimeoutMs: integer(env.JOB_HARNESS_BOSS_BROWSER_LOGIN_TIMEOUT_MS, 600_000, 1_000, 7_200_000, 'JOB_HARNESS_BOSS_BROWSER_LOGIN_TIMEOUT_MS'),
    steelBaseUrl: httpUrl(env.JOB_HARNESS_STEEL_BASE_URL?.trim() || 'http://127.0.0.1:3000', 'JOB_HARNESS_STEEL_BASE_URL'),
    steelViewerBaseUrl: env.JOB_HARNESS_STEEL_VIEWER_BASE_URL?.trim() || null,
    steelContextPath: env.JOB_HARNESS_BOSS_STEEL_CONTEXT_PATH?.trim() || '/home/ubuntu/.local/share/job-harness/boss-browser/steel-context.json',
    steelHeadless: bool(env.JOB_HARNESS_STEEL_HEADLESS, true),
    localCdpUrl: httpUrl(env.JOB_HARNESS_LOCAL_CDP_URL?.trim() || 'http://127.0.0.1:9222', 'JOB_HARNESS_LOCAL_CDP_URL'),
    timezone: env.JOB_HARNESS_APPLY_BROWSER_TIMEZONE?.trim() || 'Asia/Shanghai',
  };
}

function csv(value: string | undefined): string[] | null {
  if (!value?.trim()) return null;
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? [...new Set(items)] : null;
}

function integer(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(name + ' must be an integer between ' + min + ' and ' + max);
  return value;
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error('Expected boolean, got ' + raw);
}

function httpUrl(raw: string, name: string): string {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(name + ' must be http(s)');
  return url.toString().replace(/\/$/, '');
}
