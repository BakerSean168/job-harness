import { randomUUID } from 'node:crypto';
import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { rankResumeProfilesForJob, type ResumeJobMatch } from '@job-harness/resume-application';
import type { ApplicantProfileContext } from '@job-harness/applicant-contracts';
import type {
  JobDetail,
  JobOutreachEvent,
  JobSearchCampaign,
  RecordJobOutreachEventInput,
  UpsertJobsBatchInput,
  UpsertJobsBatchOutput,
} from '@job-harness/contracts';
import type { ListResumeProfilesOutput, ResumeProfileContext } from '@job-harness/resume-contracts';
import { BossDiscoveryReportSchema, parseBossDiscoveryDecision, renderBossDiscoveryReporter, type BossDiscoveryCoordinator } from './boss-discovery';
import { BossResumeFollowupRequestSchema, decideBossResumeFollowup } from './boss-resume-followup';

export interface BossOutreachBridgeClient {
  readonly applicant: { getProfile(): Promise<ApplicantProfileContext> };
  readonly resume: {
    listProfiles(): Promise<ListResumeProfilesOutput>;
    getProfileContext?(profileId: string): Promise<ResumeProfileContext | null>;
  };
  readonly campaigns?: { get(campaignId: string): Promise<JobSearchCampaign | null> };
  readonly jobs?: {
    upsertJobsBatch(input: UpsertJobsBatchInput): Promise<UpsertJobsBatchOutput>;
    checkDuplicate?(input: { companyName: string; title: string; city?: string | null; listings: UpsertJobsBatchInput['jobs'][number]['listings'] }): Promise<{ duplicate: boolean; job: JobDetail['job'] | null }>;
  };
  readonly workspace?: { getJobDetail(jobId: string): Promise<JobDetail | null> };
  readonly outreach?: { record(input: RecordJobOutreachEventInput): Promise<JobOutreachEvent> };
}

export interface BossOutreachBridgeOptions {
  readonly client: BossOutreachBridgeClient;
  readonly publicBaseUrl: string;
  readonly logPath: string;
  readonly baseDelayMs?: number;
  readonly delayJitterMs?: number;
  readonly random?: () => number;
  readonly discovery?: BossDiscoveryCoordinator | null;
  readonly resumeFollowupUserscript?: string | null;
  readonly greetingWaitMs?: number;
  readonly greetingThreshold?: number;
  readonly campaignId?: string | null;
}

export interface ParsedBossJob {
  readonly title: string;
  readonly salary: string;
  readonly description: string;
  readonly company: string | null;
  readonly city: string | null;
  readonly jobUrl: string | null;
  readonly externalId: string | null;
  readonly screeningSessionId: string | null;
}

export interface BossJobDecision {
  readonly score: number;
  readonly introduce: string;
  readonly resumeIndex: number;
  readonly profileId: string;
  readonly profileLabel: string;
  readonly decision: ResumeJobMatch['decision'];
  readonly signals: readonly string[];
  readonly greetingRequestId?: string | null;
  readonly policyBlocked?: boolean;
  readonly policyReason?: string | null;
  readonly jobId?: string | null;
  readonly listingId?: string | null;
}

export interface BossGreetingRequest {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly requestedProfileId: string;
  readonly job: ParsedBossJob;
  readonly match: {
    readonly score: number;
    readonly profileId: string;
    readonly profileLabel: string;
    readonly resumeIndex: number;
    readonly decision: BossJobDecision['decision'];
    readonly signals: readonly string[];
  };
  readonly candidate: Record<string, unknown>;
  readonly guidance: readonly string[];
}

function canonicalBossJobUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, 'https://www.zhipin.com');
    if (!['www.zhipin.com', 'zhipin.com'].includes(url.hostname.toLowerCase()) || !/^\/job_detail\//i.test(url.pathname)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (key !== 'ka') url.searchParams.delete(key);
    return url.toString();
  } catch { return null; }
}

function bossExternalJobId(jobUrl: string | null): string | null {
  if (!jobUrl) return null;
  const match = /^\/job_detail\/([^/?#]+?)(?:\.html)?$/i.exec(new URL(jobUrl).pathname);
  return match?.[1]?.trim().slice(0, 300) || null;
}

export function parseLegacyBossJobPayload(raw: unknown): ParsedBossJob {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const text = typeof raw === 'string'
    ? raw
    : source && 'job' in source
      ? String(source.job ?? '')
      : source && 'text' in source
        ? String(source.text ?? '')
        : String(raw ?? '');
  const title = text.match(/#\s*职位名称\s*\n([^\n]+)/)?.[1]?.trim() ?? (typeof source?.title === 'string' ? source.title.trim() : '');
  const salary = text.match(/#\s*薪资范围\s*\n([^\n]+)/)?.[1]?.trim() ?? (typeof source?.salary === 'string' ? source.salary.trim() : '');
  const description = text.match(/#\s*职位描述\s*\n([\s\S]*)$/)?.[1]?.trim() ?? (typeof source?.description === 'string' ? source.description.trim() : text);
  const jobUrl = canonicalBossJobUrl(source?.jobUrl);
  const company = typeof source?.company === 'string' ? source.company.replace(/\s+/g, ' ').trim().slice(0, 300) || null : null;
  const city = typeof source?.city === 'string' ? source.city.replace(/\s+/g, ' ').trim().slice(0, 200) || null : null;
  const screeningSessionId = typeof source?.screeningSessionId === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(source.screeningSessionId.trim())
    ? source.screeningSessionId.trim()
    : null;
  return {
    title: title.slice(0, 240),
    salary: salary.slice(0, 120),
    description: description.slice(0, 50_000),
    company,
    city,
    jobUrl,
    externalId: bossExternalJobId(jobUrl),
    screeningSessionId,
  };
}

export function bossResumeIndex(profileId: string): number {
  if (profileId.includes('frontend')) return 1;
  if (profileId.includes('fullstack')) return 2;
  return 0;
}

function compactSignal(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function compactText(value: string | null | undefined, max = 600): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function buildGreetingCandidateContext(
  applicant: ApplicantProfileContext['profile'],
  resume: ResumeProfileContext | null,
  decision: BossJobDecision,
): Record<string, unknown> {
  const resolved = resume?.resolved;
  return {
    displayName: applicant.displayName,
    education: applicant.education.slice(0, 2).map((item) => ({
      school: item.school,
      major: item.major,
      degree: item.degree,
      endMonth: item.endMonth,
    })),
    targetRole: resolved?.positioning ?? decision.profileLabel,
    matchedSignals: decision.signals,
    skills: resolved?.skills.slice(0, 8).map((item) => ({
      label: item.label,
      content: compactText(item.content, 500),
      keywords: item.keywords.slice(0, 12),
    })) ?? [],
    projects: resolved?.projects.slice(0, 4).map((item) => ({
      name: item.name,
      role: item.role,
      description: compactText(item.description, 500),
      stack: compactText(item.stack, 240),
      highlights: item.highlights.slice(0, 4).map((highlight) => compactText(highlight.detail, 360)).filter(Boolean),
    })) ?? [],
    workExperiences: resolved?.workExperiences.slice(0, 3).map((item) => ({
      company: item.company,
      role: item.role,
      bullets: item.bullets.slice(0, 4).map((bullet) => compactText(bullet.content, 360)).filter(Boolean),
    })) ?? [],
    summaries: resolved?.summaries.slice(0, 3).map((item) => compactText(item.detail, 500)).filter(Boolean) ?? [],
  };
}

function normalizeGreetingMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const message = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (message.length < 12 || message.length > 320) return null;
  return message;
}

function graduationLabel(endMonth: string | null | undefined): string | null {
  const match = /^(\d{4})-\d{2}$/.exec(endMonth ?? '');
  return match ? `${match[1]!.slice(-2)}届` : null;
}

function fallbackGreeting(
  applicant: ApplicantProfileContext['profile'],
  decision: BossJobDecision,
  job: ParsedBossJob,
): string {
  const education = applicant.education[0];
  const identity = [education?.school, education?.major, graduationLabel(education?.endMonth), education?.degree]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join('');
  const genericSignal = /^(?:前端开发|全栈开发|后端开发|软件开发|开发工程师|AI Agent|Agent开发|全栈|前端|后端)$/i;
  const signals = decision.signals
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value && !genericSignal.test(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 3);
  const role = job.title.replace(/\s+/g, ' ').trim() || decision.profileLabel;
  const evidence = signals.length >= 2
    ? `项目和实践中涉及 ${signals.slice(0, 2).join('、')}`
    : signals.length === 1
      ? `有 ${signals[0]} 相关项目实践`
      : `有与${decision.profileLabel}方向相关的项目实践`;
  const prefix = identity ? `您好，我是${identity}，` : '您好，';
  const message = `${prefix}${evidence}，看到贵司的${role}岗位后感觉方向比较契合，希望有机会进一步沟通，谢谢。`;
  return normalizeGreetingMessage(message)
    ?? '您好，我关注到贵司这个岗位，我的项目经历与岗位方向有一定匹配，希望有机会进一步沟通，谢谢。';
}

function inferMinimumExperienceYears(text: string): number | null {
  const values: number[] = [];
  const patterns = [
    /(?:至少|不少于)\s*(\d{1,2})\s*年/gi,
    /(\d{1,2})\s*年\s*(?:以上|及以上|及其以上)/gi,
    /(\d{1,2})\s*[-~～至—–]\s*\d{1,2}\s*年(?:[^。；;\n]{0,24})?(?:经验|开发|研发|工作)/gi,
    /(\d{1,2})\s*年(?:[^。；;\n]{0,24})?(?:工作|开发|研发)?经验/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const years = Number(match[1]);
      if (Number.isFinite(years) && years >= 0 && years <= 50) values.push(years);
    }
  }
  return values.length ? Math.max(...values) : null;
}

function blocksEarlyCareerOutreach(campaign: JobSearchCampaign | null, job: ParsedBossJob): { blocked: boolean; minimumYears: number | null } {
  const minimumYears = inferMinimumExperienceYears(job.description);
  if (minimumYears === null) return { blocked: false, minimumYears };
  const earlyCareer = Boolean(
    campaign?.graduationYears.length
    && campaign.experience.some((value) => /(?:应届|实习|在校|无经验|经验不限|1年以内)/.test(value)),
  );
  return { blocked: earlyCareer && minimumYears >= 3, minimumYears };
}

export async function decideBossJob(client: BossOutreachBridgeClient, raw: unknown): Promise<BossJobDecision> {
  const job = parseLegacyBossJobPayload(raw);
  const profiles = await client.resume.listProfiles();
  const ranked = rankResumeProfilesForJob({ title: job.title, description: job.description }, profiles.items);
  const selected = ranked[0];
  if (!selected) throw new Error('Job Harness has no active Resume Profile for BOSS outreach');
  return {
    score: selected.score,
    introduce: '',
    resumeIndex: bossResumeIndex(selected.profileId),
    profileId: selected.profileId,
    profileLabel: selected.profileName,
    decision: selected.decision,
    signals: [
      ...selected.matches.specialization,
      ...selected.matches.titleStrong,
      ...selected.matches.detailStrong,
      ...selected.matches.detailSupport,
    ].map((item) => compactSignal(item.keyword)).filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).slice(0, 8),
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
  const allow = ['action','scene','screeningSessionId','jobUrl','jobId','listingId','title','company','city','salary','score','threshold','screeningPassed','resumeIndex','requestedResumeIndex','selectedResumeIndex','sendMode','reason','chatUrl','addUrl'];
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

type BossGreetingResolution =
  | { readonly action: 'send'; readonly message: string; readonly source: string }
  | { readonly action: 'skip'; readonly reason: string; readonly source: string };

interface PendingBossGreeting {
  readonly request: BossGreetingRequest;
  readonly wait: Promise<BossGreetingResolution | null>;
  readonly resolve: (resolution: BossGreetingResolution) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

const BOSS_GREETING_GUIDANCE = Object.freeze([
  '根据岗位 JD 和候选人真实简历内容临时生成 BOSS 首次招呼语，不使用固定文案模板。',
  '用中文，1-3 句，简洁自然，像真人求职者；通常控制在 50-120 个汉字左右。',
  '优先挑选与当前 JD 最相关的 1-2 个真实经历、项目或技术点，不要机械堆砌匹配关键词。',
  '不得编造候选人未提供的经历、年限、公司、奖项或技能熟练度。',
  '如果 JD 的核心必备要求与候选人真实经历明显不符（例如岗位核心是候选人没有实践的专用技术栈），应选择 skip，而不是勉强生成招呼语。',
  '可以自然提到学校、专业、应届身份；无需重复姓名，结尾自然表达希望进一步沟通。',
  'send 时只提交最终要发送给招聘方的招呼语，不要解释生成过程；skip 时给出简短原因。',
]);

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
  const greetingThreshold = Math.max(0, Math.min(100, options.greetingThreshold ?? 58));
  const greetingWaitMs = Math.max(1_000, Math.min(9 * 60_000, options.greetingWaitMs ?? 15_000));
  const recentDecisions = new Map<string, BossJobDecision>();
  const recentDecisionsByJobId = new Map<string, BossJobDecision>();
  const pendingGreetings = new Map<string, PendingBossGreeting>();
  let campaignPromise: Promise<JobSearchCampaign | null> | null = null;
  const getCampaign = (): Promise<JobSearchCampaign | null> => {
    if (!options.campaignId || !options.client.campaigns) return Promise.resolve(null);
    campaignPromise ??= options.client.campaigns.get(options.campaignId).catch(() => null);
    return campaignPromise;
  };

  const persistBossJob = async (job: ParsedBossJob, decision: BossJobDecision): Promise<{ jobId: string; listingId: string | null } | null> => {
    if (!job.title || !job.company || !job.jobUrl || !job.description) return null;
    const observedAt = new Date().toISOString();
    let jobId: string | null = null;
    if (options.discovery) {
      if (job.screeningSessionId) {
        await options.discovery.decision({
          screeningSessionId: job.screeningSessionId,
          jobUrl: job.jobUrl,
          title: job.title,
          salary: job.salary || null,
          score: decision.score,
          threshold: greetingThreshold,
          screeningPassed: decision.score >= greetingThreshold,
          recommendedProfileId: decision.profileId,
          recommendedProfileLabel: decision.profileLabel,
          observedAt,
        });
      }
      const report = await options.discovery.report({
        jobUrl: job.jobUrl,
        title: job.title,
        companyName: job.company,
        city: job.city,
        salary: job.salary || null,
        description: job.description,
        observedAt,
        ...(job.screeningSessionId ? { discoverySessionId: job.screeningSessionId } : {}),
      });
      jobId = report.jobId;
    }
    if (!jobId && options.client.jobs) {
      const result = await options.client.jobs.upsertJobsBatch({ jobs: [{
        companyName: job.company,
        title: job.title,
        ...(job.city ? { city: job.city } : {}),
        description: job.description,
        observedAt,
        listings: [{
          sourceKind: 'boss',
          label: 'BOSS直聘',
          url: job.jobUrl,
          ...(job.externalId ? { externalNamespace: 'boss', externalId: job.externalId, identityKind: 'external-id' as const } : { identityKind: 'url' as const }),
          status: 'active',
          metadataSnapshot: { source: 'boss-copilot-compat', salary: job.salary || null },
        }],
      }] });
      jobId = result.items[0]?.jobId ?? null;
    }
    if (!jobId) return null;
    const detail = options.client.workspace ? await options.client.workspace.getJobDetail(jobId) : null;
    const listing = detail?.job.listings.find((item) => item.sourceKind === 'boss' && (job.externalId ? item.externalId === job.externalId : item.url === job.jobUrl))
      ?? detail?.job.listings.find((item) => item.sourceKind === 'boss')
      ?? null;
    return { jobId, listingId: listing?.id ?? null };
  };

  const rememberDecision = (job: ParsedBossJob, decision: BossJobDecision): void => {
    recentDecisions.set(job.title, decision);
    if (decision.jobId) recentDecisionsByJobId.set(decision.jobId, decision);
  };

  const persistOutreachAction = async (body: Record<string, unknown>, decision: BossJobDecision | null): Promise<void> => {
    if (!options.client.outreach) return;
    const action = typeof body.action === 'string' ? body.action : '';
    const type = action === 'greet_sent' || action === 'chat_greet_sent' ? 'greeting_sent'
      : action === 'recruiter_replied' ? 'recruiter_replied'
        : action === 'resume_sent' ? 'resume_sent'
          : action === 'job_already_talked' ? 'already_contacted'
            : null;
    if (!type) return;
    const jobId = typeof body.jobId === 'string' ? body.jobId : decision?.jobId ?? null;
    if (!jobId) return;
    const listingId = typeof body.listingId === 'string' ? body.listingId : decision?.listingId ?? null;
    const thread = typeof body.chatUrl === 'string' ? canonicalBossJobUrl(body.chatUrl) ?? (() => {
      try { return new URL(body.chatUrl as string, 'https://www.zhipin.com').toString(); } catch { return null; }
    })() : null;
    const resumeIndex = typeof body.resumeIndex === 'number' ? body.resumeIndex : decision?.resumeIndex ?? null;
    await options.client.outreach.record({
      jobId,
      listingId,
      channel: 'boss',
      type,
      occurredAt: new Date().toISOString(),
      actor: 'system',
      resumeProfileId: decision?.profileId ?? null,
      message: type === 'greeting_sent' ? decision?.introduce ?? null : null,
      externalThreadUrl: thread,
      metadata: {
        source: 'boss-copilot-compat',
        scene: typeof body.scene === 'string' ? body.scene : null,
        resumeIndex,
        score: decision?.score ?? null,
      },
      idempotencyKey: `boss-outreach:${jobId}:${type}`,
    });
  };

  const createPendingGreeting = async (
    requestedProfileId: string,
    job: ParsedBossJob,
    decision: BossJobDecision,
    applicant: ApplicantProfileContext['profile'],
  ): Promise<PendingBossGreeting> => {
    const id = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + greetingWaitMs);
    const resume = options.client.resume.getProfileContext
      ? await options.client.resume.getProfileContext(decision.profileId)
      : null;
    const request: BossGreetingRequest = {
      id,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      requestedProfileId,
      job,
      match: {
        score: decision.score,
        profileId: decision.profileId,
        profileLabel: decision.profileLabel,
        resumeIndex: decision.resumeIndex,
        decision: decision.decision,
        signals: decision.signals,
      },
      candidate: buildGreetingCandidateContext(applicant, resume, decision),
      guidance: BOSS_GREETING_GUIDANCE,
    };

    let resolveWait!: (resolution: BossGreetingResolution | null) => void;
    const wait = new Promise<BossGreetingResolution | null>((resolve) => { resolveWait = resolve; });
    const timer = setTimeout(() => {
      void (async () => {
        pendingGreetings.delete(id);
        const message = fallbackGreeting(applicant, decision, job);
        await appendEvent(options.logPath, {
          loggedAt: new Date().toISOString(),
          action: 'greeting_assist_timeout_fallback',
          greetingRequestId: id,
          requestedProfileId,
          title: job.title,
          salary: job.salary,
          score: decision.score,
          resumeIndex: decision.resumeIndex,
          recommendedProfileId: decision.profileId,
          recommendedProfileLabel: decision.profileLabel,
          fallbackMessage: message,
        }).catch(() => undefined);
        resolveWait({ action: 'send', message, source: 'job-harness-fallback' });
      })();
    }, greetingWaitMs);
    const pending: PendingBossGreeting = { request, wait, resolve: resolveWait, timer };
    pendingGreetings.set(id, pending);
    await appendEvent(options.logPath, {
      loggedAt: createdAt.toISOString(),
      action: 'greeting_requested',
      greetingRequestId: id,
      requestedProfileId,
      title: job.title,
      salary: job.salary,
      score: decision.score,
      resumeIndex: decision.resumeIndex,
      recommendedProfileId: decision.profileId,
      recommendedProfileLabel: decision.profileLabel,
    });
    return pending;
  };

  return createServer(async (req, res) => {
    try {
      setCommonHeaders(res);
      if (req.method === 'OPTIONS') return sendJson(res, 204, {});
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const [profiles, applicant] = await Promise.all([options.client.resume.listProfiles(), options.client.applicant.getProfile()]);
        return sendJson(res, 200, {
          ok: true,
          service: 'job-harness-boss-outreach-bridge',
          mode: 'auto-resume-followup',
          discovery: Boolean(options.discovery),
          reporterUrl: `${options.publicBaseUrl.replace(/\/+$/, '')}/boss-discovery-reporter.user.js`,
          resumeFollowup: Boolean(options.resumeFollowupUserscript),
          resumeFollowupUrl: options.resumeFollowupUserscript ? `${options.publicBaseUrl.replace(/\/+$/, '')}/boss-resume-followup.user.js` : null,
          greetingMode: 'chatgpt-assisted-with-safe-fallback',
          greetingWaitMs,
          greetingFallback: 'job-harness-deterministic',
          pendingGreetings: pendingGreetings.size,
          profiles: profiles.items.map((p) => ({ id: p.id, name: p.name })),
          applicantProfileVersion: applicant.profile.version,
        });
      }
      if (req.method === 'GET' && url.pathname === '/boss-discovery-reporter.user.js') {
        return sendText(res, 200, 'text/javascript; charset=utf-8', renderBossDiscoveryReporter(options.publicBaseUrl));
      }
      if (req.method === 'GET' && url.pathname === '/boss-resume-followup.user.js') {
        if (!options.resumeFollowupUserscript) return sendJson(res, 503, { error: 'resume_followup_userscript_unavailable' });
        return sendText(res, 200, 'text/javascript; charset=utf-8', options.resumeFollowupUserscript);
      }
      if (req.method === 'POST' && url.pathname === '/api/discovery/report') {
        if (!options.discovery) return sendJson(res, 503, { error: 'discovery_not_configured' });
        const report = BossDiscoveryReportSchema.parse(await readJsonBody(req));
        return sendJson(res, 200, await options.discovery.report(report));
      }
      if (req.method === 'GET' && url.pathname === '/api/screening-summary') {
        return sendJson(res, 200, screeningSummary(await readEvents(options.logPath)));
      }
      if (req.method === 'GET' && url.pathname === '/api/greetings/pending') {
        const items = [...pendingGreetings.values()]
          .map((item) => item.request)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        return sendJson(res, 200, { ok: true, mode: 'chatgpt-assisted', total: items.length, items });
      }
      const greetingResolveMatch = /^\/api\/greetings\/([A-Za-z0-9-]+)\/resolve$/.exec(url.pathname);
      if (req.method === 'POST' && greetingResolveMatch) {
        const id = greetingResolveMatch[1]!;
        const pending = pendingGreetings.get(id);
        if (!pending) return sendJson(res, 404, { error: 'greeting_request_not_found', id });
        const body = await readJsonBody(req);
        const source = body && typeof body === 'object' && !Array.isArray(body) && typeof (body as { source?: unknown }).source === 'string'
          ? String((body as { source: string }).source).trim().slice(0, 80)
          : 'chatgpt-web';
        const requestedAction = body && typeof body === 'object' && !Array.isArray(body) && (body as { action?: unknown }).action === 'skip'
          ? 'skip'
          : 'send';
        let resolution: BossGreetingResolution;
        if (requestedAction === 'skip') {
          const reasonRaw = body && typeof body === 'object' && !Array.isArray(body) ? (body as { reason?: unknown }).reason : null;
          const reason = typeof reasonRaw === 'string' ? reasonRaw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) : '';
          if (reason.length < 3) return sendJson(res, 400, { error: 'invalid_skip_reason', message: 'Skip reason must be at least 3 characters.' });
          resolution = { action: 'skip', reason, source };
        } else {
          const message = normalizeGreetingMessage(
            body && typeof body === 'object' && !Array.isArray(body) ? (body as { message?: unknown }).message : null,
          );
          if (!message) return sendJson(res, 400, { error: 'invalid_greeting', message: 'Greeting must be a single 12-320 character message.' });
          resolution = { action: 'send', message, source };
        }
        clearTimeout(pending.timer);
        pendingGreetings.delete(id);
        await appendEvent(options.logPath, {
          loggedAt: new Date().toISOString(),
          action: resolution.action === 'send' ? 'greeting_resolved' : 'greeting_skipped',
          greetingRequestId: id,
          requestedProfileId: pending.request.requestedProfileId,
          title: pending.request.job.title,
          salary: pending.request.job.salary,
          score: pending.request.match.score,
          resumeIndex: pending.request.match.resumeIndex,
          source,
          ...(resolution.action === 'skip' ? { reason: resolution.reason } : {}),
        });
        pending.resolve(resolution);
        return sendJson(res, 200, { ok: true, id, action: resolution.action, source });
      }

      const match = /^\/p\/([A-Za-z0-9._-]+)\/(client-config|tags|get-introduce|observe-job|get-job-score|log-action|reply|is-need-resume|is-need-works)$/.exec(url.pathname);
      if (!match) return sendJson(res, 404, { error: 'not_found' });
      const requestedProfileId = match[1]!;
      const action = match[2]!;
      const [profiles, applicant] = await Promise.all([options.client.resume.listProfiles(), options.client.applicant.getProfile()]);
      const requested = profiles.items.find((profile) => profile.id === requestedProfileId) ?? profiles.items[0] ?? null;
      if (!requested) return sendJson(res, 503, { error: 'no_resume_profiles' });

      if (req.method === 'GET' && action === 'client-config') {
        return sendJson(res, 200, {
          introduce: '',
          character: '由 ChatGPT 根据当前 JD 和真实简历上下文临时生成',
          tags: applicant.profile.targetRoles.slice(0, 10),
          frontend: {
            serverHost: `${options.publicBaseUrl.replace(/\/+$/, '')}/p/${requestedProfileId}`,
            resumeIndex: bossResumeIndex(requestedProfileId),
            thread: greetingThreshold,
            timestampTimeout: 3000,
            onlyGreet: false,
            resumeFollowup: true,
            manualFilterWaitMs: 10000,
            roundRestartDelayMs: 2000,
            maxEmptyRounds: 3,
            detailTimeout: 10000,
            greetTimeout: 12000,
            preloadScrollPixels: 180,
            preloadScrollWaitMs: 450,
            // The legacy Copilot used a very deep preload sweep. On the current
            // BOSS infinite list this can spend close to a minute scrolling before
            // the first score. Keep production bounded to the canary-proven window:
            // enough time for lazy cards to settle without delaying outreach.
            preloadStableRoundsLimit: 8,
            preloadMaxRounds: 30,
            preloadActivateCardEvery: 0,
            preloadActivateCardWaitMs: 250,
          },
        });
      }
      if (req.method === 'GET' && action === 'tags') return sendJson(res, 200, { tags: applicant.profile.targetRoles.slice(0, 10) });
      if (req.method === 'GET' && action === 'get-introduce') return sendJson(res, 200, { introduce: '' });

      if (req.method === 'POST' && action === 'observe-job') {
        const raw = await readJsonBody(req);
        const job = parseLegacyBossJobPayload(raw);
        const scored = await decideBossJob(options.client, raw);
        const persisted = await persistBossJob(job, scored);
        await appendEvent(options.logPath, {
          loggedAt: new Date().toISOString(),
          action: 'job_observed',
          requestedProfileId,
          title: job.title,
          company: job.company,
          city: job.city,
          jobUrl: job.jobUrl,
          jobId: persisted?.jobId ?? null,
          listingId: persisted?.listingId ?? null,
        });
        return sendJson(res, 200, {
          success: true,
          jobId: persisted?.jobId ?? null,
          listingId: persisted?.listingId ?? null,
          profileId: scored.profileId,
          resumeIndex: scored.resumeIndex,
        });
      }

      if (req.method === 'POST' && action === 'get-job-score') {
        const raw = await readJsonBody(req);
        const job = parseLegacyBossJobPayload(raw);
        const scoredBase = await decideBossJob(options.client, raw);
        const persisted = await persistBossJob(job, scoredBase);
        const scored: BossJobDecision = persisted ? { ...scoredBase, ...persisted } : scoredBase;
        const hardRequirement = blocksEarlyCareerOutreach(await getCampaign(), job);
        const jitter = delayJitterMs ? Math.round((random() * 2 - 1) * delayJitterMs) : 0;
        const delay = Math.max(0, baseDelayMs + jitter);
        await appendEvent(options.logPath, {
          loggedAt: new Date().toISOString(),
          action: 'job_scored',
          requestedProfileId,
          title: job.title,
          salary: job.salary,
          score: scored.score,
          resumeIndex: scored.resumeIndex,
          profileId: scored.profileId,
          profileLabel: scored.profileLabel,
          decision: scored.decision,
          signals: scored.signals,
          jobId: scored.jobId ?? null,
          listingId: scored.listingId ?? null,
          company: job.company,
          city: job.city,
          jobUrl: job.jobUrl,
          policyBlocked: hardRequirement.blocked,
          minimumExperienceYears: hardRequirement.minimumYears,
          delayMs: delay,
        });
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

        if (hardRequirement.blocked) {
          const decision: BossJobDecision = {
            ...scored,
            score: Math.min(scored.score, Math.max(0, greetingThreshold - 1)),
            decision: 'low-match',
            policyBlocked: true,
            policyReason: `explicit-minimum-experience-${hardRequirement.minimumYears}-years`,
          };
          rememberDecision(job, decision);
          await appendEvent(options.logPath, {
            loggedAt: new Date().toISOString(),
            action: 'job_hard_requirement_blocked',
            requestedProfileId,
            title: job.title,
            salary: job.salary,
            originalScore: scored.score,
            returnedScore: decision.score,
            minimumExperienceYears: hardRequirement.minimumYears,
            policyReason: decision.policyReason,
          });
          return sendJson(res, 200, decision);
        }

        let decision = scored;
        if (scored.score >= greetingThreshold) {
          const pending = await createPendingGreeting(requestedProfileId, job, scored, applicant.profile);
          const resolution = await pending.wait;
          if (!resolution) throw new Error('BOSS greeting resolution unexpectedly missing after fallback');
          if (resolution.action === 'skip') {
            decision = {
              ...scored,
              score: Math.min(scored.score, Math.max(0, greetingThreshold - 1)),
              decision: 'low-match',
              greetingRequestId: pending.request.id,
              policyBlocked: true,
              policyReason: `chatgpt-skip:${resolution.reason}`,
            };
          } else {
            decision = { ...scored, introduce: resolution.message, greetingRequestId: pending.request.id };
          }
        }
        rememberDecision(job, decision);
        return sendJson(res, 200, decision);
      }

      if (req.method === 'POST' && action === 'log-action') {
        const body = safeActionPayload(await readJsonBody(req));
        const title = typeof body.title === 'string' ? body.title : '';
        const bodyJobId = typeof body.jobId === 'string' ? body.jobId : '';
        const decision = (bodyJobId ? recentDecisionsByJobId.get(bodyJobId) : null) ?? (title ? recentDecisions.get(title) : null) ?? null;
        const discoveryDecision = parseBossDiscoveryDecision(body, decision ? { profileId: decision.profileId, profileLabel: decision.profileLabel } : null);
        if (discoveryDecision && options.discovery && !bodyJobId) {
          await options.discovery.decision(discoveryDecision);
        }
        const loggedAt = new Date().toISOString();
        await appendEvent(options.logPath, {
          loggedAt,
          requestedProfileId,
          ...(decision ? { recommendedProfileId: decision.profileId, recommendedProfileLabel: decision.profileLabel } : {}),
          ...body,
        });
        try {
          await persistOutreachAction(body, decision);
        } catch (error) {
          await appendEvent(options.logPath, {
            loggedAt: new Date().toISOString(),
            action: 'outreach_persistence_failed',
            requestedProfileId,
            jobId: bodyJobId || decision?.jobId || null,
            sourceAction: body.action ?? null,
            reason: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
          });
          return sendJson(res, 503, { success: false, error: 'outreach_persistence_failed' });
        }
        return sendJson(res, 200, { success: true });
      }

      if (req.method === 'POST' && action === 'is-need-resume') {
        const input = BossResumeFollowupRequestSchema.parse(await readJsonBody(req));
        const decision = decideBossResumeFollowup(input, 58);
        await appendEvent(options.logPath, {
          loggedAt: new Date().toISOString(),
          requestedProfileId,
          action: decision.need ? 'resume_followup_authorized' : 'resume_followup_denied',
          title: input.title,
          company: input.company ?? null,
          salary: input.salary ?? null,
          score: input.score,
          resumeIndex: input.resumeIndex,
          reason: decision.reason,
        });
        return sendJson(res, 200, decision);
      }
      if (req.method === 'POST' && ['reply','is-need-works'].includes(action)) {
        return sendJson(res, 409, { error: 'resume_followup_mode', message: 'Job Harness BOSS follow-up 仅允许受 policy 约束的简历发送；LLM 多轮自动聊天和作品集自动发送仍被禁用。' });
      }
      return sendJson(res, 405, { error: 'method_not_allowed' });
    } catch (error) {
      return sendJson(res, 500, { error: 'internal_error', message: error instanceof Error ? error.message : String(error) });
    }
  });
}
