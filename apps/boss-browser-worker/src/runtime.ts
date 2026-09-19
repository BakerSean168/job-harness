import type { BrowserBackendPort, BrowserDriverPort, BrowserSessionPort } from '@job-harness/apply-browser';

const SEARCH_URL = 'https://www.zhipin.com/web/geek/job';

const SEARCH_INPUT_SELECTORS = [
  '.search-form input',
  'input[placeholder*="搜索"]',
  'input[type="search"]',
] as const;

const SEARCH_BUTTON_SELECTORS = ['.search-btn'] as const;
const TITLE_SELECTORS = ['.name h1', '.job-banner h1', 'h1'] as const;
const SALARY_SELECTORS = ['.name .salary', '.job-banner .salary', '.salary'] as const;
const DETAIL_SELECTORS = ['.job-sec-text', '.job-detail-section .text', '.job-detail .text'] as const;
const COMPANY_SELECTORS = ['.sider-company .company-info a', '.company-info a', '.job-sider .company-info'] as const;
const CITY_SELECTORS = ['.job-banner .text-city', '.job-banner .job-location', '.job-location', '[class*="job-location"]'] as const;

export interface BossBrowserScoreDecision {
  readonly score: number;
  readonly introduce: string;
  readonly resumeIndex: number;
  readonly profileId: string;
  readonly profileLabel: string;
  readonly decision: string;
}

export interface BossBrowserBridgePort {
  listKeywords(profileId: string): Promise<readonly string[]>;
  score(profileId: string, legacyJobText: string): Promise<BossBrowserScoreDecision>;
  reportDiscovery(input: {
    jobUrl: string;
    title: string;
    companyName: string;
    city?: string | null;
    salary?: string | null;
    description: string;
    observedAt: string;
    discoverySessionId: string;
  }): Promise<void>;
  logDecision(profileId: string, input: {
    action: 'job_decision_consumed';
    scene: 'boss-browser-worker';
    screeningSessionId: string;
    jobUrl: string;
    title: string;
    salary: string | null;
    score: number;
    threshold: number;
    screeningPassed: boolean;
    resumeIndex: number;
  }): Promise<void>;
}

export interface BossBrowserRunOptions {
  readonly backend: BrowserBackendPort;
  readonly bridge: BossBrowserBridgePort;
  readonly profileId: string;
  readonly keywords?: readonly string[] | null;
  readonly maxKeywords?: number;
  readonly maxJobsPerKeyword?: number;
  readonly maxTotalJobs?: number;
  readonly threshold?: number;
  readonly waitLogin?: boolean;
  readonly loginTimeoutMs?: number;
  readonly now?: () => string;
  readonly logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

export interface BossBrowserRunResult {
  readonly sessionId: string;
  readonly status: 'completed' | 'login_required' | 'human_verification_required';
  readonly humanControlUrl: string | null;
  readonly keywords: readonly string[];
  readonly discoveredUrls: number;
  readonly inspectedJobs: number;
  readonly reportedJobs: number;
  readonly scoredJobs: number;
  readonly passedJobs: number;
  readonly skippedJobs: number;
  readonly jobs: readonly {
    readonly url: string;
    readonly title: string;
    readonly company: string | null;
    readonly salary: string | null;
    readonly score: number | null;
    readonly profileId: string | null;
    readonly passed: boolean;
    readonly reported: boolean;
    readonly reason: string | null;
  }[];
}

export async function runBossBrowserDiscovery(options: BossBrowserRunOptions): Promise<BossBrowserRunResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const logger = options.logger ?? console;
  const threshold = boundedInt(options.threshold ?? 58, 0, 100, 'threshold');
  const maxKeywords = boundedInt(options.maxKeywords ?? 8, 1, 20, 'maxKeywords');
  const maxJobsPerKeyword = boundedInt(options.maxJobsPerKeyword ?? 20, 1, 100, 'maxJobsPerKeyword');
  const maxTotalJobs = boundedInt(options.maxTotalJobs ?? 80, 1, 250, 'maxTotalJobs');
  const loginTimeoutMs = boundedInt(options.loginTimeoutMs ?? 10 * 60_000, 1_000, 2 * 60 * 60_000, 'loginTimeoutMs');
  const sessionId = 'boss-browser-' + now().replace(/[-:.TZ]/g, '').slice(0, 14);
  const keywords = uniqueStrings(
    options.keywords?.length ? options.keywords : await options.bridge.listKeywords(options.profileId),
  ).slice(0, maxKeywords);
  if (!keywords.length) throw new Error('BOSS browser discovery has no search keywords');

  const session = await options.backend.acquire({ preferredUrl: SEARCH_URL, reuseLiveSession: true });
  try {
    const driver = session.driver();
    await driver.navigate(SEARCH_URL);
    await driver.wait(900);

    let auth = await inspectBossAuth(driver);
    if (!auth.loggedIn && options.waitLogin) {
      const deadline = Date.now() + loginTimeoutMs;
      while (!auth.loggedIn && Date.now() < deadline) {
        await driver.wait(1_500);
        auth = await inspectBossAuth(driver);
      }
    }
    if (!auth.loggedIn) {
      await session.persist().catch(() => undefined);
      return emptyAuthResult(session, sessionId, keywords, auth.reason);
    }

    const jobUrls = new Set<string>();
    for (const keyword of keywords) {
      if (jobUrls.size >= maxTotalJobs) break;
      await driver.navigate(SEARCH_URL);
      await driver.wait(650);
      const authAtSearch = await inspectBossAuth(driver);
      if (!authAtSearch.loggedIn) {
        await session.persist().catch(() => undefined);
        return emptyAuthResult(session, sessionId, keywords, authAtSearch.reason);
      }
      const inputSelector = await firstExisting(driver, SEARCH_INPUT_SELECTORS);
      if (!inputSelector) {
        logger.warn('BOSS search input was not found; stopping keyword rotation');
        break;
      }
      await driver.fill(inputSelector, keyword);
      const clicked = await clickSearch(driver);
      if (!clicked) {
        logger.warn('BOSS search button was not found; stopping keyword rotation');
        break;
      }
      await driver.wait(1_600);

      let stableRounds = 0;
      let previous = jobUrls.size;
      for (let round = 0; round < 30 && jobUrls.size < maxTotalJobs; round += 1) {
        const beforeKeyword = jobUrls.size;
        for (const action of await driver.scanActions()) {
          if (!action.href) continue;
          const url = canonicalBossJobUrl(action.href);
          if (!url) continue;
          jobUrls.add(url);
          if (jobUrls.size >= maxTotalJobs || jobUrls.size - beforeKeyword >= maxJobsPerKeyword) break;
        }
        if (jobUrls.size === previous) stableRounds += 1;
        else stableRounds = 0;
        previous = jobUrls.size;
        if (stableRounds >= 5 || jobUrls.size - beforeKeyword >= maxJobsPerKeyword) break;
        await driver.scroll(650);
        await driver.wait(350);
      }
    }

    const jobs: BossBrowserRunResult['jobs'][number][] = [];
    let reportedJobs = 0;
    let scoredJobs = 0;
    let passedJobs = 0;

    for (const url of [...jobUrls].slice(0, maxTotalJobs)) {
      try {
        await driver.navigate(url);
        await driver.wait(900);
        const detailAuth = await inspectBossAuth(driver);
        if (!detailAuth.loggedIn) {
          jobs.push({ url, title: '', company: null, salary: null, score: null, profileId: null, passed: false, reported: false, reason: detailAuth.reason });
          break;
        }

        const title = compact(await firstText(driver, TITLE_SELECTORS), 240);
        const salary = nullableCompact(await firstText(driver, SALARY_SELECTORS), 120);
        const company = nullableCompact(await firstText(driver, COMPANY_SELECTORS), 300);
        const city = nullableCompact(await firstText(driver, CITY_SELECTORS), 200);
        const detail = compact(await firstText(driver, DETAIL_SELECTORS), 50_000)
          || compact(await driver.bodyText(50_000), 50_000);

        if (!title || !detail) {
          jobs.push({ url, title, company, salary, score: null, profileId: null, passed: false, reported: false, reason: 'missing_job_detail' });
          continue;
        }

        const decision = await options.bridge.score(options.profileId, legacyJobText(title, salary, detail));
        scoredJobs += 1;
        const passed = decision.score >= threshold;
        if (passed) passedJobs += 1;

        let reported = false;
        if (company) {
          await options.bridge.reportDiscovery({
            jobUrl: url,
            title,
            companyName: company,
            ...(city ? { city } : {}),
            ...(salary ? { salary } : {}),
            description: detail,
            observedAt: now(),
            discoverySessionId: sessionId,
          });
          reported = true;
          reportedJobs += 1;
        }

        await options.bridge.logDecision(options.profileId, {
          action: 'job_decision_consumed',
          scene: 'boss-browser-worker',
          screeningSessionId: sessionId,
          jobUrl: url,
          title,
          salary,
          score: decision.score,
          threshold,
          screeningPassed: passed,
          resumeIndex: decision.resumeIndex,
        });

        jobs.push({
          url,
          title,
          company,
          salary,
          score: decision.score,
          profileId: decision.profileId,
          passed,
          reported,
          reason: company ? null : 'missing_company_for_discovery_report',
        });
      } catch (error) {
        jobs.push({
          url,
          title: '',
          company: null,
          salary: null,
          score: null,
          profileId: null,
          passed: false,
          reported: false,
          reason: sanitizeError(error),
        });
      }
    }

    await session.persist();
    return {
      sessionId,
      status: 'completed',
      humanControlUrl: session.humanControlUrl,
      keywords,
      discoveredUrls: jobUrls.size,
      inspectedJobs: jobs.length,
      reportedJobs,
      scoredJobs,
      passedJobs,
      skippedJobs: jobs.length - passedJobs,
      jobs,
    };
  } finally {
    await session.release().catch((error) => logger.warn('BOSS browser session release warning', sanitizeError(error)));
  }
}

async function inspectBossAuth(driver: BrowserDriverPort): Promise<{ loggedIn: true; reason: 'ok' } | { loggedIn: false; reason: 'boss_login_required' | 'boss_human_verification_required' }> {
  const url = await driver.refreshCurrentUrl();
  const body = await driver.bodyText(12_000);
  if (url.includes('/web/passport/zp/verify')) return { loggedIn: false, reason: 'boss_human_verification_required' };
  const loggedOut = ['/web/user/', 'APP扫码登录', '验证码登录/注册', '微信登录/注册', '登录/注册']
    .some((signal) => url.includes(signal) || body.includes(signal));
  return loggedOut
    ? { loggedIn: false, reason: 'boss_login_required' }
    : { loggedIn: true, reason: 'ok' };
}

async function firstExisting(driver: BrowserDriverPort, selectors: readonly string[]): Promise<string | null> {
  for (const selector of selectors) {
    if (await driver.exists(selector)) return selector;
  }
  return null;
}

async function firstText(driver: BrowserDriverPort, selectors: readonly string[]): Promise<string> {
  for (const selector of selectors) {
    const text = await driver.text(selector);
    if (text?.trim()) return text;
  }
  return '';
}

async function clickSearch(driver: BrowserDriverPort): Promise<boolean> {
  for (const selector of SEARCH_BUTTON_SELECTORS) {
    if (!await driver.exists(selector)) continue;
    await driver.click(selector);
    return true;
  }
  const exact = (await driver.scanActions())
    .filter((action) => !action.disabled && !action.ariaDisabled && normalize(action.text) === '搜索');
  if (exact.length !== 1) return false;
  await driver.click(exact[0]!.actionRef, { expectedText: exact[0]!.text });
  return true;
}

function canonicalBossJobUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['www.zhipin.com', 'zhipin.com'].includes(url.hostname.toLowerCase()) || !/^\/job_detail\//i.test(url.pathname)) return null;
    url.protocol = 'https:';
    url.hostname = 'www.zhipin.com';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key !== 'ka') url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function legacyJobText(title: string, salary: string | null, description: string): string {
  return ['# 职位名称', title, '# 薪资范围', salary ?? '', '# 职位描述', description].join('\n');
}

function emptyAuthResult(
  session: BrowserSessionPort,
  sessionId: string,
  keywords: readonly string[],
  reason: 'boss_login_required' | 'boss_human_verification_required',
): BossBrowserRunResult {
  return {
    sessionId,
    status: reason === 'boss_human_verification_required' ? 'human_verification_required' : 'login_required',
    humanControlUrl: session.humanControlUrl,
    keywords,
    discoveredUrls: 0,
    inspectedJobs: 0,
    reportedJobs: 0,
    scoredJobs: 0,
    passedJobs: 0,
    skippedJobs: 0,
    jobs: [],
  };
}

function compact(value: string, max: number): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function nullableCompact(value: string, max: number): string | null {
  const normalized = compact(value, max);
  return normalized || null;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function boundedInt(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(name + ' must be an integer between ' + min + ' and ' + max);
  return value;
}

function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export const bossBrowserInternals = {
  SEARCH_URL,
  canonicalBossJobUrl,
  legacyJobText,
};
