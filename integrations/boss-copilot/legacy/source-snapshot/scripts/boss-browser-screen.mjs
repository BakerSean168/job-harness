import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreJob } from '../src/job-score.js';
import { createBrowserProvider } from './browser/browser-provider.mjs';
import {
  extractBossJobDetail,
  inspectBossAuth,
  openBossSearch,
  searchBossJobs,
  waitForBossLogin,
} from './browser/boss-adapter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const localRoot = path.join(root, '.local', 'boss-browser');
const bundlePath = path.join(root, 'data', 'profile-bundle.json');

await main();
await new Promise((resolve) => setTimeout(resolve, 20));
process.exit(process.exitCode || 0);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const providerName = args.provider || process.env.JAC_BROWSER_PROVIDER || 'steel';
  const profileId = args.profile || process.env.JAC_BOSS_PROFILE || 'ai-agent-app';
  const keyword = args.keyword || process.env.JAC_BOSS_KEYWORD || 'AI Agent';
  const maxJobs = clampNumber(args.max || process.env.JAC_BOSS_MAX_JOBS || 20, 1, 100);
  const threshold = clampNumber(args.threshold || process.env.JAC_BOSS_SCREENING_THRESHOLD || 42, 0, 100);
  const waitLogin = Boolean(args['wait-login']);
  const loginOnly = Boolean(args['login-only']);
  const loginTimeoutMinutes = clampNumber(args['login-timeout-minutes'] || process.env.JAC_BOSS_LOGIN_TIMEOUT_MINUTES || 120, 1, 720);
  const release = Boolean(args.release);

  fs.mkdirSync(localRoot, { recursive: true });
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const profile = bundle.profiles?.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`Unknown profile: ${profileId}`);

  const provider = createBrowserProvider(providerName);
  let detailPage = null;
  try {
    const browserMeta = await provider.start();
    const page = await provider.getPage();
    const context = await provider.getContext();
    console.log(JSON.stringify({ event: 'browser_started', ...browserMeta }, null, 2));

    await openBossSearch(page);
    let auth = await inspectBossAuth(page);
    if (!auth.loggedIn) {
      console.log(JSON.stringify({
        event: auth.reason === 'boss_human_verification_required' ? 'human_action_required' : 'login_required',
        reason: auth.reason,
        provider: providerName,
        humanControlUrl: browserMeta.humanControlUrl || browserMeta.humanControl || null,
        url: auth.url,
      }, null, 2));
      if (!waitLogin) {
        await provider.saveState().catch(() => null);
        process.exitCode = 2;
        return;
      }
      auth = await waitForBossLogin(page, { timeoutMs: loginTimeoutMinutes * 60 * 1000 });
      if (!auth.loggedIn || !auth.ready) throw new Error('Timed out waiting for manual BOSS login.');
    }

    if (loginOnly) {
      const saved = await provider.saveState();
      console.log(JSON.stringify({ event: 'login_ready', savedAt: saved?.savedAt || new Date().toISOString() }, null, 2));
      return;
    }

    const search = await searchBossJobs(page, keyword, { maxJobs });
    if (!search.loggedIn) {
      console.log(JSON.stringify({
        event: search.reason === 'boss_human_verification_required' ? 'human_action_required' : 'login_required',
        reason: search.reason,
        provider: providerName,
        humanControlUrl: browserMeta.humanControlUrl || browserMeta.humanControl || null,
        url: search.url,
      }, null, 2));
      process.exitCode = 2;
      return;
    }
    if (!search.jobs.length) {
      console.log(JSON.stringify({ event: 'no_jobs_found', keyword, searchUrl: search.url }, null, 2));
      return;
    }

    detailPage = await context.newPage();
    const sessionId = `boss-browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const run = {
      format: 'JobApplicationCopilotBossBrowserScreening',
      version: 1,
      sessionId,
      provider: providerName,
      browserSessionId: browserMeta.sessionId || null,
      profileId,
      profileLabel: profile.label || profileId,
      keyword,
      threshold,
      startedAt: new Date().toISOString(),
      sourceSearchUrl: search.url,
      jobs: [],
    };

    for (const [index, item] of search.jobs.slice(0, maxJobs).entries()) {
      const detail = await extractBossJobDetail(detailPage, item.href);
      if (!detail.loggedIn) {
        run.jobs.push({ index: index + 1, url: item.href, status: 'login_required', score: null, passed: false });
        break;
      }
      const result = scoreJob({ title: detail.title || item.title, text: detail.text }, profile.scoring || {});
      const row = {
        index: index + 1,
        url: detail.url || item.href,
        title: detail.title || item.title,
        company: detail.company,
        salary: detail.salary,
        score: result.score,
        decision: result.decision,
        passed: result.score >= threshold,
        matches: result.matches,
      };
      run.jobs.push(row);
      console.log(`${String(index + 1).padStart(2, '0')} ${row.passed ? 'PASS' : 'SKIP'} ${String(row.score).padStart(3)} ${row.title}${row.company ? ` | ${row.company}` : ''}${row.salary ? ` | ${row.salary}` : ''}`);
    }

    run.finishedAt = new Date().toISOString();
    run.total = run.jobs.length;
    run.passed = run.jobs.filter((job) => job.passed).length;
    run.skipped = run.total - run.passed;
    const scores = run.jobs.map((job) => job.score).filter(Number.isFinite);
    run.averageScore = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
    run.minScore = scores.length ? Math.min(...scores) : null;
    run.maxScore = scores.length ? Math.max(...scores) : null;
    persistRun(run);
    console.log(JSON.stringify({
      event: 'screening_complete',
      sessionId: run.sessionId,
      total: run.total,
      passed: run.passed,
      skipped: run.skipped,
      averageScore: run.averageScore,
      minScore: run.minScore,
      maxScore: run.maxScore,
      reportPath: path.join(localRoot, 'runs', `${run.sessionId}.json`),
    }, null, 2));
  } finally {
    if (detailPage) await detailPage.close().catch(() => {});
    await provider.stop({ persist: true, release }).catch((error) => {
      console.error(`provider stop warning: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

function persistRun(value) {
  const runsRoot = path.join(localRoot, 'runs');
  fs.mkdirSync(runsRoot, { recursive: true });
  fs.writeFileSync(path.join(runsRoot, `${value.sessionId}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.appendFileSync(path.join(localRoot, 'screening-runs.jsonl'), `${JSON.stringify(value)}\n`, 'utf8');
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}
