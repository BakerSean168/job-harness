import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { rankResumeProfilesForJob, type ResumeJobMatch } from '@job-harness/resume-application';
import type { ApplicantProfileContext } from '@job-harness/applicant-contracts';
import type { ListResumeProfilesOutput } from '@job-harness/resume-contracts';
import { BossDiscoveryReportSchema, parseBossDiscoveryDecision, renderBossDiscoveryReporter, type BossDiscoveryCoordinator } from './boss-discovery';

export interface BossOutreachBridgeClient {
  readonly applicant: { getProfile(): Promise<ApplicantProfileContext> };
  readonly resume: { listProfiles(): Promise<ListResumeProfilesOutput> };
}

export interface BossOutreachBridgeOptions {
  readonly client: BossOutreachBridgeClient;
  readonly publicBaseUrl: string;
  readonly logPath: string;
  readonly baseDelayMs?: number;
  readonly delayJitterMs?: number;
  readonly random?: () => number;
  readonly discovery?: BossDiscoveryCoordinator | null;
}

export interface ParsedBossJob {
  readonly title: string;
  readonly salary: string;
  readonly description: string;
}

export interface BossJobDecision {
  readonly score: number;
  readonly introduce: string;
  readonly resumeIndex: number;
  readonly profileId: string;
  readonly profileLabel: string;
  readonly decision: ResumeJobMatch['decision'];
  readonly signals: readonly string[];
}

export function parseLegacyBossJobPayload(raw: unknown): ParsedBossJob {
  const text = typeof raw === 'string'
    ? raw
    : raw && typeof raw === 'object' && 'job' in raw
      ? String((raw as { job?: unknown }).job ?? '')
      : raw && typeof raw === 'object' && 'text' in raw
        ? String((raw as { text?: unknown }).text ?? '')
        : String(raw ?? '');
  const title = text.match(/#\s*职位名称\s*\n([^\n]+)/)?.[1]?.trim() ?? '';
  const salary = text.match(/#\s*薪资范围\s*\n([^\n]+)/)?.[1]?.trim() ?? '';
  const description = text.match(/#\s*职位描述\s*\n([\s\S]*)$/)?.[1]?.trim() ?? text;
  return { title: title.slice(0, 240), salary: salary.slice(0, 120), description: description.slice(0, 50_000) };
}

export function bossResumeIndex(profileId: string): number {
  if (profileId.includes('frontend')) return 1;
  if (profileId.includes('fullstack')) return 2;
  return 0;
}

function compactSignal(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function buildBossGreeting(applicant: ApplicantProfileContext['profile'], match: ResumeJobMatch): string {
  const education = applicant.education[0];
  const identity = [education?.school, education?.major].filter(Boolean).join(' · ');
  const signals = [
    ...match.matches.specialization,
    ...match.matches.titleStrong,
    ...match.matches.detailStrong,
    ...match.matches.detailSupport,
  ]
    .map((item) => compactSignal(item.keyword))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 3);
  const introduction = identity ? `我是${identity}方向的${applicant.displayName}` : `我是${applicant.displayName}`;
  const role = match.targetRole || match.profileName;
  const evidence = signals.length ? `，相关实践覆盖 ${signals.join('、')}` : '';
  return `${introduction}，目前主要关注${role}${evidence}。看到这个岗位方向比较匹配，希望有机会进一步沟通，谢谢。`;
}

export async function decideBossJob(client: BossOutreachBridgeClient, raw: unknown): Promise<BossJobDecision> {
  const job = parseLegacyBossJobPayload(raw);
  const [profiles, applicant] = await Promise.all([client.resume.listProfiles(), client.applicant.getProfile()]);
  const ranked = rankResumeProfilesForJob({ title: job.title, description: job.description }, profiles.items);
  const selected = ranked[0];
  if (!selected) throw new Error('Job Harness has no active Resume Profile for BOSS outreach');
  return {
    score: selected.score,
    introduce: buildBossGreeting(applicant.profile, selected),
    resumeIndex: bossResumeIndex(selected.profileId),
    profileId: selected.profileId,
    profileLabel: selected.profileName,
    decision: selected.decision,
    signals: [
      ...selected.matches.specialization,
      ...selected.matches.titleStrong,
      ...selected.matches.detailStrong,
      ...selected.matches.detailSupport,
    ].map((item) => item.keyword).filter((value, index, all) => all.indexOf(value) === index).slice(0, 8),
  };
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

function sendText(res: ServerResponse, status: number, contentType: string, value: string): void {
  res.statusCode = status;
  res.setHeader('content-type', contentType);
  res.setHeader('content-length', Buffer.byteLength(value));
  res.end(value);
}

function setCommonHeaders(res: ServerResponse): void {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('access-control-allow-origin', 'https://www.zhipin.com');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
}

async function readJsonBody(req: IncomingMessage, limit = 128 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > limit) throw new Error('request body too large');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

function safeActionPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { value: String(value ?? '').slice(0, 2000) };
  const source = value as Record<string, unknown>;
  const allow = ['action','scene','screeningSessionId','jobUrl','title','salary','score','threshold','screeningPassed','resumeIndex','reason','chatUrl','addUrl'];
  const result: Record<string, unknown> = {};
  for (const key of allow) {
    const item = source[key];
    if (typeof item === 'string') result[key] = item.slice(0, key === 'jobUrl' || key === 'chatUrl' || key === 'addUrl' ? 2000 : 1000);
    else if (typeof item === 'number' && Number.isFinite(item)) result[key] = item;
    else if (typeof item === 'boolean') result[key] = item;
  }
  return result;
}

async function appendEvent(path: string, event: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, 'utf8');
}

async function readEvents(path: string): Promise<Record<string, unknown>[]> {
  try {
    const content = await readFile(path, 'utf8');
    return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
      try { const value = JSON.parse(line) as unknown; return value && typeof value === 'object' && !Array.isArray(value) ? [value as Record<string, unknown>] : []; }
      catch { return []; }
    });
  } catch { return []; }
}

function screeningSummary(rows: readonly Record<string, unknown>[]) {
  const decisions = rows.filter((row) => row.action === 'job_decision_consumed' && typeof row.screeningSessionId === 'string');
  const sessions = new Map<string, Record<string, unknown>[]>();
  for (const row of decisions) {
    const id = String(row.screeningSessionId);
    const group = sessions.get(id) ?? [];
    group.push(row);
    sessions.set(id, group);
  }
  const summaries = [...sessions.entries()].map(([sessionId, jobs]) => {
    const ordered = [...jobs].sort((a, b) => String(a.loggedAt ?? '').localeCompare(String(b.loggedAt ?? '')));
    const scores = ordered.map((row) => Number(row.score)).filter(Number.isFinite);
    const passed = ordered.filter((row) => row.screeningPassed === true || Number(row.score) >= Number(row.threshold ?? 58)).length;
    return {
      sessionId,
      startedAt: String(ordered[0]?.loggedAt ?? ''),
      latestAt: String(ordered.at(-1)?.loggedAt ?? ''),
      total: ordered.length,
      passed,
      skipped: ordered.length - passed,
      averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      jobs: ordered.slice(-100),
    };
  }).sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  return { ok: true, mode: 'job-harness-auto-resume-only-greet', latest: summaries[0] ?? null, sessions: summaries.slice(0, 20) };
}

export function createBossOutreachBridge(options: BossOutreachBridgeOptions): Server {
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 2500);
  const delayJitterMs = Math.max(0, options.delayJitterMs ?? 400);
  const random = options.random ?? Math.random;
  const recentDecisions = new Map<string, BossJobDecision>();

  return createServer(async (req, res) => {
    try {
      setCommonHeaders(res);
      if (req.method === 'OPTIONS') return sendJson(res, 204, {});
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const [profiles, applicant] = await Promise.all([options.client.resume.listProfiles(), options.client.applicant.getProfile()]);
        return sendJson(res, 200, { ok: true, service: 'job-harness-boss-outreach-bridge', mode: 'auto-resume-only-greet', discovery: Boolean(options.discovery), reporterUrl: `${options.publicBaseUrl.replace(/\/+$/, '')}/boss-discovery-reporter.user.js`, profiles: profiles.items.map((p) => ({ id: p.id, name: p.name })), applicantProfileVersion: applicant.profile.version });
      }
      if (req.method === 'GET' && url.pathname === '/boss-discovery-reporter.user.js') {
        return sendText(res, 200, 'text/javascript; charset=utf-8', renderBossDiscoveryReporter(options.publicBaseUrl));
      }
      if (req.method === 'POST' && url.pathname === '/api/discovery/report') {
        if (!options.discovery) return sendJson(res, 503, { error: 'discovery_not_configured' });
        const report = BossDiscoveryReportSchema.parse(await readJsonBody(req));
        return sendJson(res, 200, await options.discovery.report(report));
      }
      if (req.method === 'GET' && url.pathname === '/api/screening-summary') {
        return sendJson(res, 200, screeningSummary(await readEvents(options.logPath)));
      }

      const match = /^\/p\/([A-Za-z0-9._-]+)\/(client-config|tags|get-introduce|get-job-score|log-action|reply|is-need-resume|is-need-works)$/.exec(url.pathname);
      if (!match) return sendJson(res, 404, { error: 'not_found' });
      const requestedProfileId = match[1]!;
      const action = match[2]!;
      const [profiles, applicant] = await Promise.all([options.client.resume.listProfiles(), options.client.applicant.getProfile()]);
      const requested = profiles.items.find((profile) => profile.id === requestedProfileId) ?? profiles.items[0] ?? null;
      if (!requested) return sendJson(res, 503, { error: 'no_resume_profiles' });
      const fallbackMatch = rankResumeProfilesForJob({ title: requested.targetRole['zh-CN'] ?? requested.targetRole.en ?? requested.id, description: '' }, [requested])[0]!;
      const fallbackGreeting = buildBossGreeting(applicant.profile, fallbackMatch);

      if (req.method === 'GET' && action === 'client-config') {
        return sendJson(res, 200, {
          introduce: fallbackGreeting,
          character: '简洁 直接 礼貌',
          tags: applicant.profile.targetRoles.slice(0, 10),
          frontend: {
            serverHost: `${options.publicBaseUrl.replace(/\/+$/, '')}/p/${requestedProfileId}`,
            resumeIndex: bossResumeIndex(requestedProfileId),
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
        });
      }
      if (req.method === 'GET' && action === 'tags') return sendJson(res, 200, { tags: applicant.profile.targetRoles.slice(0, 10) });
      if (req.method === 'GET' && action === 'get-introduce') return sendJson(res, 200, { introduce: fallbackGreeting });

      if (req.method === 'POST' && action === 'get-job-score') {
        const raw = await readJsonBody(req);
        const job = parseLegacyBossJobPayload(raw);
        const decision = await decideBossJob(options.client, raw);
        recentDecisions.set(job.title, decision);
        const jitter = delayJitterMs ? Math.round((random() * 2 - 1) * delayJitterMs) : 0;
        const delay = Math.max(0, baseDelayMs + jitter);
        await appendEvent(options.logPath, { loggedAt: new Date().toISOString(), action: 'job_scored', requestedProfileId, title: job.title, salary: job.salary, ...decision, delayMs: delay });
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return sendJson(res, 200, decision);
      }

      if (req.method === 'POST' && action === 'log-action') {
        const body = safeActionPayload(await readJsonBody(req));
        const title = typeof body.title === 'string' ? body.title : '';
        const decision = title ? recentDecisions.get(title) : null;
        const discoveryDecision = parseBossDiscoveryDecision(body, decision ? { profileId: decision.profileId, profileLabel: decision.profileLabel } : null);
        if (discoveryDecision && options.discovery) {
          await options.discovery.decision(discoveryDecision);
        }
        await appendEvent(options.logPath, {
          loggedAt: new Date().toISOString(),
          requestedProfileId,
          ...(decision ? { recommendedProfileId: decision.profileId, recommendedProfileLabel: decision.profileLabel } : {}),
          ...body,
        });
        return sendJson(res, 200, { success: true });
      }

      if (req.method === 'POST' && ['reply','is-need-resume','is-need-works'].includes(action)) {
        return sendJson(res, 409, { error: 'only_greet_mode', message: 'Job Harness BOSS bridge 当前只允许岗位评分和首次打招呼；多轮聊天与自动发送简历仍被禁用。' });
      }
      return sendJson(res, 405, { error: 'method_not_allowed' });
    } catch (error) {
      return sendJson(res, 500, { error: 'internal_error', message: error instanceof Error ? error.message : String(error) });
    }
  });
}
