import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreJob } from '../src/job-score.js';
import {
  openJobLedger, upsertJob, recordApplication, lockCompanyApplications,
  checkDuplicate, getLedgerStats, listPrimaryQueue,
} from './lib/job-ledger.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bundlePath = path.join(root, 'data', 'profile-bundle.json');
const localRoot = path.join(root, '.local', 'boss-companion');
const host = process.env.JAC_BOSS_HOST || '127.0.0.1';
const port = Number(process.env.JAC_BOSS_PORT || 18788);
const publicBaseUrl = String(process.env.JAC_BOSS_PUBLIC_BASE_URL || 'https://oracle.taile92a8e.ts.net:10444').replace(/\/+$/, '');
const baseDelayMs = Math.max(0, Number(process.env.JAC_BOSS_SCORE_DELAY_MS ?? 4000));
const delayJitterMs = Math.max(0, Number(process.env.JAC_BOSS_SCORE_DELAY_JITTER_MS ?? 500));

fs.mkdirSync(localRoot, { recursive: true });
const jobLedger = openJobLedger();

const server = http.createServer(async (req, res) => {
  try {
    setCommonHeaders(res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/health') {
      const bundle = loadBundle();
      return sendJson(res, 200, {
        ok: true,
        service: 'job-application-copilot-boss-companion',
        mode: 'screening-first',
        profiles: bundle.profiles.map((profile) => ({ id: profile.id, label: profile.label })),
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/screening-summary') {
      return sendJson(res, 200, buildScreeningSummary({
        sessionId: String(url.searchParams.get('sessionId') || ''),
        profileId: String(url.searchParams.get('profileId') || ''),
        limit: Number(url.searchParams.get('limit') || 100),
      }));
    }

    if (req.method === 'GET' && url.pathname === '/api/ledger/stats') {
      return sendJson(res, 200, { ok: true, ...getLedgerStats(jobLedger) });
    }
    if (req.method === 'GET' && url.pathname === '/api/ledger/queue') {
      return sendJson(res, 200, {
        ok: true,
        jobs: listPrimaryQueue(jobLedger, Number(url.searchParams.get('limit') || 100)),
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/ledger/check') {
      return sendJson(res, 200, {
        ok: true,
        ...checkDuplicate(jobLedger, {
          company: String(url.searchParams.get('company') || ''),
          title: String(url.searchParams.get('title') || ''),
          city: String(url.searchParams.get('city') || ''),
          source: String(url.searchParams.get('source') || ''),
          externalJobId: String(url.searchParams.get('externalJobId') || ''),
          url: String(url.searchParams.get('url') || ''),
        }),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/ledger/jobs') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, { ok: true, ...upsertJob(jobLedger, body && typeof body === 'object' ? body : {}) });
    }
    if (req.method === 'POST' && url.pathname === '/api/ledger/applications') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, { ok: true, ...recordApplication(jobLedger, body && typeof body === 'object' ? body : {}) });
    }
    if (req.method === 'POST' && url.pathname === '/api/ledger/applications/import') {
      const body = await readJsonBody(req);
      const rows = Array.isArray(body?.applications) ? body.applications.slice(0, 500) : [];
      const results = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object' || !row.company) continue;
        results.push(recordApplication(jobLedger, {
          ...row,
          appliedAt: row.appliedAt || row.createdAt,
          platform: row.platform || row.source,
          resumeName: row.resumeName || row.resumePdfName,
        }));
      }
      return sendJson(res, 200, {
        ok: true,
        imported: results.filter((item) => item.recorded).length,
        duplicates: results.filter((item) => item.duplicate).length,
        skipped: rows.length - results.length,
        stats: getLedgerStats(jobLedger),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/ledger/company-locks') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, { ok: true, lock: lockCompanyApplications(jobLedger, body && typeof body === 'object' ? body : {}) });
    }

    const match = url.pathname.match(/^\/p\/([A-Za-z0-9._-]+)\/(client-config|tags|get-introduce|get-job-score|log-action|reply|is-need-resume|is-need-works)$/);
    if (!match) return sendJson(res, 404, { error: 'not_found' });

    const [, profileId, action] = match;
    const profile = getProfile(profileId);
    if (!profile) return sendJson(res, 404, { error: 'unknown_profile', profileId });

    if (req.method === 'GET' && action === 'client-config') {
      return sendJson(res, 200, buildClientConfig(profile));
    }
    if (req.method === 'GET' && action === 'tags') {
      return sendJson(res, 200, { tags: getProfileTags(profile) });
    }
    if (req.method === 'GET' && action === 'get-introduce') {
      return sendJson(res, 200, { introduce: profile.greeting || '' });
    }

    if (req.method === 'POST' && action === 'get-job-score') {
      const body = await readJsonBody(req);
      const rawJob = typeof body === 'string' ? body : String(body?.job || body?.text || '');
      const job = parseCzcJobPayload(rawJob);
      const result = scoreJob(job, profile.scoring || {});
      const delayMs = computeDelayMs();
      appendJsonl('job-decisions.jsonl', {
        loggedAt: new Date().toISOString(),
        profileId: profile.id,
        title: job.title,
        score: result.score,
        decision: result.decision,
        resumeIndex: getResumeIndex(profile.id),
        delayMs,
        matches: result.matches,
        url: '',
      });
      if (delayMs > 0) await sleep(delayMs);
      return sendJson(res, 200, {
        score: result.score,
        introduce: profile.greeting || '',
        resumeIndex: getResumeIndex(profile.id),
      });
    }

    if (req.method === 'POST' && action === 'log-action') {
      const body = await readJsonBody(req);
      appendJsonl('job-actions.jsonl', {
        loggedAt: new Date().toISOString(),
        profileId: profile.id,
        ...(body && typeof body === 'object' && !Array.isArray(body) ? body : { value: body }),
      });
      return sendJson(res, 200, { success: true });
    }

    if (req.method === 'POST' && ['reply', 'is-need-resume', 'is-need-works'].includes(action)) {
      return sendJson(res, 409, {
        error: 'only_greet_mode',
        message: '当前 Oracle2 companion 只负责岗位评分和首次打招呼，不启用自动聊天。',
      });
    }

    return sendJson(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    return sendJson(res, 500, {
      error: 'internal_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`Job Application Copilot BOSS companion listening on http://${host}:${port}`);
  console.log(`Public tailnet base: ${publicBaseUrl}`);
});

function loadBundle() {
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Missing profile bundle: ${bundlePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const profiles = Array.isArray(parsed.profiles) ? parsed.profiles.filter((profile) => profile?.id) : [];
  if (profiles.length === 0) throw new Error('Profile bundle contains no profiles.');
  return { ...parsed, profiles };
}

function getProfile(profileId) {
  return loadBundle().profiles.find((profile) => profile.id === profileId) || null;
}

function getResumeIndex(profileId) {
  return {
    'ai-agent-app': 0,
    'ai-frontend': 1,
    'ai-fullstack': 2,
  }[profileId] ?? 0;
}

function getProfileTags(profile) {
  return [...new Set([
    ...Object.keys(profile.scoring?.titleStrongKeywords || {}),
    ...Object.keys(profile.scoring?.titleMediumKeywords || {}),
  ].filter(Boolean))].slice(0, 10);
}

function buildClientConfig(profile) {
  return {
    introduce: profile.greeting || '',
    character: '简洁 直接 礼貌',
    tags: getProfileTags(profile),
    frontend: {
      serverHost: `${publicBaseUrl}/p/${profile.id}`,
      resumeIndex: getResumeIndex(profile.id),
      thread: 58,
      timestampTimeout: 3000,
      onlyGreet: true,
      manualFilterWaitMs: 10000,
      roundRestartDelayMs: 2000,
      maxEmptyRounds: 3,
      detailTimeout: 10000,
      greetTimeout: 12000,
      preloadScrollPixels: 180,
      preloadScrollWaitMs: 450,
      preloadStableRoundsLimit: 24,
      preloadMaxRounds: 300,
      preloadActivateCardEvery: 0,
      preloadActivateCardWaitMs: 250,
    },
  };
}

function parseCzcJobPayload(raw) {
  const text = String(raw || '');
  const title = text.match(/#\s*职位名称\s*\n([^\n]+)/)?.[1]?.trim() || '';
  const detail = text.match(/#\s*职位描述\s*\n([\s\S]*)$/)?.[1]?.trim() || text;
  return {
    title: title.slice(0, 240),
    text: detail.slice(0, 50000),
  };
}

function computeDelayMs() {
  if (!delayJitterMs) return Math.round(baseDelayMs);
  const jitter = Math.round((Math.random() * 2 - 1) * delayJitterMs);
  return Math.max(0, Math.round(baseDelayMs + jitter));
}

function appendJsonl(filename, value) {
  fs.appendFileSync(path.join(localRoot, filename), `${JSON.stringify(value)}\n`, 'utf8');
}

function readJsonl(filename) {
  const filePath = path.join(localRoot, filename);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function buildScreeningSummary(options = {}) {
  const limit = Math.max(1, Math.min(500, Number(options.limit || 100)));
  const rows = readJsonl('job-actions.jsonl')
    .filter((row) => row?.action === 'job_decision_consumed' && row?.screeningSessionId)
    .filter((row) => !options.profileId || row.profileId === options.profileId);

  const sessions = new Map();
  for (const row of rows) {
    const sessionId = String(row.screeningSessionId || '');
    if (!sessionId) continue;
    if (!sessions.has(sessionId)) sessions.set(sessionId, []);
    sessions.get(sessionId).push(row);
  }

  const summaries = Array.from(sessions.entries()).map(([sessionId, jobs]) => {
    const ordered = jobs.slice().sort((a, b) => String(a.loggedAt || '').localeCompare(String(b.loggedAt || '')));
    const scores = ordered.map((job) => Number(job.score)).filter(Number.isFinite);
    const passed = ordered.filter((job) => job.screeningPassed === true || Number(job.score) >= Number(job.threshold || 58)).length;
    return {
      sessionId,
      profileId: String(ordered[0]?.profileId || ''),
      startedAt: String(ordered[0]?.loggedAt || ''),
      latestAt: String(ordered.at(-1)?.loggedAt || ''),
      total: ordered.length,
      passed,
      skipped: ordered.length - passed,
      threshold: Number(ordered.at(-1)?.threshold || 58),
      averageScore: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
      minScore: scores.length ? Math.min(...scores) : null,
      maxScore: scores.length ? Math.max(...scores) : null,
      jobs: ordered.slice(-limit).map((job) => ({
        loggedAt: String(job.loggedAt || ''),
        title: String(job.title || ''),
        salary: String(job.salary || ''),
        score: Number.isFinite(Number(job.score)) ? Number(job.score) : null,
        threshold: Number(job.threshold || 58),
        passed: job.screeningPassed === true || Number(job.score) >= Number(job.threshold || 58),
        jobUrl: String(job.jobUrl || ''),
        resumeIndex: Number.isFinite(Number(job.resumeIndex)) ? Number(job.resumeIndex) : null,
      })),
    };
  }).sort((a, b) => b.latestAt.localeCompare(a.latestAt));

  const filtered = options.sessionId
    ? summaries.filter((item) => item.sessionId === options.sessionId)
    : summaries;
  return {
    ok: true,
    mode: 'screening-first',
    latest: filtered[0] || null,
    sessions: filtered.slice(0, 20),
  };
}

function readJsonBody(req, limit = 128 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return resolve(null);
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(text);
      }
    });
    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(res, status, value) {
  const body = `${JSON.stringify(value)}\n`;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function setCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Access-Control-Allow-Origin', 'https://www.zhipin.com');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
