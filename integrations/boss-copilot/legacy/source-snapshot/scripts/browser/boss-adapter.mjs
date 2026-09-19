const SEARCH_URL = 'https://www.zhipin.com/web/geek/job';

const SELECTORS = {
  searchInput: [
    '.search-form input',
    'input[placeholder*="搜索"]',
    'input[type="search"]',
  ],
  searchButton: ['.search-btn', 'button:has-text("搜索")'],
  jobLinks: [
    '.rec-job-list .job-card-box .job-name',
    '.job-list-box .job-card-box .job-name',
    '.job-card-box .job-name',
    'a.job-name',
  ],
  title: ['.name h1', '.job-banner h1', 'h1'],
  salary: ['.name .salary', '.job-banner .salary', '.salary'],
  detail: ['.job-sec-text', '.job-detail-section .text', '.job-detail .text'],
  company: ['.sider-company .company-info a', '.company-info a', '.job-sider .company-info'],
};

export async function openBossSearch(page) {
  if (!page.url().startsWith(SEARCH_URL)) {
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  const deadline = Date.now() + 10000;
  let auth = await inspectBossAuth(page);
  while (Date.now() < deadline) {
    auth = await inspectBossAuth(page);
    if (!auth.loggedIn) return { ...auth, ready: false };
    const input = await firstVisible(page, SELECTORS.searchInput);
    if (input) return { ...auth, ready: true };
    await page.waitForTimeout(500);
  }
  return { ...auth, ready: false, reason: 'boss_search_not_ready' };
}

export async function inspectBossAuth(page) {
  const url = page.url();
  const title = await page.title().catch(() => '');
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (url.includes('/web/passport/zp/verify')) {
    return {
      loggedIn: false,
      url,
      title,
      reason: 'boss_human_verification_required',
    };
  }
  const loginSignals = [
    '/web/user/',
    'APP扫码登录',
    '验证码登录/注册',
    '微信登录/注册',
    '登录/注册',
  ];
  const loggedOut = loginSignals.some((signal) => url.includes(signal) || body.includes(signal));
  return {
    loggedIn: !loggedOut,
    url,
    title,
    reason: loggedOut ? 'boss_login_required' : 'ok',
  };
}

export async function waitForBossLogin(page, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 10 * 60 * 1000));
  const intervalMs = Math.max(500, Number(options.intervalMs || 1500));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const auth = await inspectBossAuth(page);
    if (auth.loggedIn) {
      const input = await firstVisible(page, SELECTORS.searchInput);
      if (input) return { ...auth, ready: true };
    }
    await page.waitForTimeout(intervalMs);
  }
  const auth = await inspectBossAuth(page);
  return { ...auth, ready: false };
}

export async function searchBossJobs(page, keyword, options = {}) {
  const maxJobs = Math.max(1, Math.min(100, Number(options.maxJobs || 20)));
  const maxScrollRounds = Math.max(1, Math.min(100, Number(options.maxScrollRounds || 30)));
  const auth = await openBossSearch(page);
  if (!auth.loggedIn) return { ...auth, jobs: [] };
  if (!auth.ready) return { ...auth, jobs: [] };

  const input = await firstVisible(page, SELECTORS.searchInput);
  if (!input) throw new Error('BOSS search input not found.');
  await input.fill(String(keyword || '').trim());
  const button = await firstVisible(page, SELECTORS.searchButton);
  if (button) await button.click();
  else await input.press('Enter');

  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1600);

  const jobs = new Map();
  let stableRounds = 0;
  let previousCount = 0;
  for (let round = 0; round < maxScrollRounds && jobs.size < maxJobs; round += 1) {
    const current = await collectJobLinks(page);
    for (const job of current) {
      if (!job.href || jobs.has(job.href)) continue;
      jobs.set(job.href, job);
      if (jobs.size >= maxJobs) break;
    }
    if (jobs.size === previousCount) stableRounds += 1;
    else stableRounds = 0;
    previousCount = jobs.size;
    if (stableRounds >= 6) break;
    await page.evaluate(() => window.scrollBy({ top: 650, left: 0, behavior: 'instant' }));
    await page.waitForTimeout(350);
  }

  return {
    loggedIn: true,
    reason: 'ok',
    url: page.url(),
    title: await page.title().catch(() => ''),
    jobs: [...jobs.values()].slice(0, maxJobs),
  };
}

export async function extractBossJobDetail(page, url) {
  if (!isBossJobUrl(url)) throw new Error(`Refusing non-BOSS job URL: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(900);
  const auth = await inspectBossAuth(page);
  if (!auth.loggedIn) return { ...auth, url, title: '', salary: '', company: '', text: '' };

  const title = await textFromFirst(page, SELECTORS.title);
  const salary = await textFromFirst(page, SELECTORS.salary);
  const detail = await textFromFirst(page, SELECTORS.detail);
  const company = await textFromFirst(page, SELECTORS.company);
  const bodyFallback = detail ? '' : await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  return {
    loggedIn: true,
    reason: 'ok',
    url: page.url(),
    title: compact(title).slice(0, 240),
    salary: compact(salary).slice(0, 120),
    company: compact(company).slice(0, 240),
    text: compact(detail || bodyFallback).slice(0, 50000),
  };
}

export function isBossJobUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'www.zhipin.com' && (url.pathname.includes('/job_detail/') || url.pathname.startsWith('/job_detail'));
  } catch {
    return false;
  }
}

async function collectJobLinks(page) {
  for (const selector of SELECTORS.jobLinks) {
    const count = await page.locator(selector).count().catch(() => 0);
    if (!count) continue;
    return page.locator(selector).evaluateAll((anchors) => anchors.map((anchor) => ({
      href: anchor.href || anchor.getAttribute('href') || '',
      title: (anchor.textContent || '').trim(),
    })));
  }
  return [];
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

async function textFromFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    const text = await locator.innerText({ timeout: 3000 }).catch(() => '');
    if (text.trim()) return text;
  }
  return '';
}

function compact(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
