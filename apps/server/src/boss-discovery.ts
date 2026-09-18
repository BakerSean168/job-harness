import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type {
  BeginDiscoveryInput,
  CompleteDiscoveryInput,
  JobSearchCampaign,
  UpsertJobsBatchInput,
  UpsertJobsBatchOutput,
} from '@job-harness/contracts';

const BossJobUrlSchema = z.string().url().superRefine((value, ctx) => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (!['www.zhipin.com', 'zhipin.com'].includes(host) || !/^\/job_detail\//i.test(url.pathname)) {
    ctx.addIssue({ code: 'custom', message: 'jobUrl must be a BOSS zhipin.com job_detail URL' });
  }
});

export const BossDiscoveryReportSchema = z.object({
  jobUrl: BossJobUrlSchema,
  title: z.string().trim().min(1).max(500),
  companyName: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(200).nullable().optional(),
  salary: z.string().trim().min(1).max(120).nullable().optional(),
  description: z.string().trim().min(1).max(50_000),
  observedAt: z.iso.datetime({ offset: true }).optional(),
  discoverySessionId: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/).optional(),
}).strict();
export type BossDiscoveryReport = z.infer<typeof BossDiscoveryReportSchema>;

export interface BossDiscoveryDecision {
  readonly screeningSessionId: string;
  readonly jobUrl: string;
  readonly title: string;
  readonly salary?: string | null;
  readonly score?: number | null;
  readonly threshold?: number | null;
  readonly screeningPassed?: boolean | null;
  readonly recommendedProfileId?: string | null;
  readonly recommendedProfileLabel?: string | null;
  readonly observedAt?: string | null;
}

export interface BossDiscoveryClient {
  readonly campaigns: { get(campaignId: string): Promise<JobSearchCampaign | null> };
  readonly discovery: {
    begin(input: BeginDiscoveryInput): Promise<{ id: string }>;
    complete(input: CompleteDiscoveryInput): Promise<unknown>;
  };
  readonly jobs: { upsertJobsBatch(input: UpsertJobsBatchInput): Promise<UpsertJobsBatchOutput> };
}

interface SessionState {
  sessionId: string;
  generation: number;
  runId: string;
  startedAt: string;
  lastAt: string;
  candidateCount: number;
  insertedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  seenUrls: Set<string>;
  completed: boolean;
  timer: NodeJS.Timeout | null;
  completing: Promise<void> | null;
}

interface PersistedSessionEvent {
  type: 'started' | 'candidate' | 'completed';
  sessionId: string;
  generation: number;
  runId: string;
  occurredAt: string;
  jobUrl?: string;
  status?: 'inserted' | 'updated' | 'duplicate' | 'rejected';
  candidateCount: number;
  insertedCount: number;
  duplicateCount: number;
  rejectedCount: number;
}

function canonicalJobUrl(value: string): string {
  const url = new URL(BossJobUrlSchema.parse(value));
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (!['ka'].includes(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function externalJobId(value: string): string | null {
  const pathname = new URL(value).pathname;
  const match = /^\/job_detail\/([^/?#]+?)(?:\.html)?$/i.exec(pathname);
  const id = match?.[1]?.trim() ?? '';
  return id ? id.slice(0, 300) : null;
}

function safeSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9._:-]{1,200}$/.test(normalized) ? normalized : null;
}

function decisionUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { return canonicalJobUrl(value); } catch { return null; }
}

export function parseBossDiscoveryDecision(
  value: Record<string, unknown>,
  recommendation?: { profileId: string; profileLabel: string } | null,
  now = new Date().toISOString(),
): BossDiscoveryDecision | null {
  if (value.action !== 'job_decision_consumed') return null;
  const screeningSessionId = safeSessionId(value.screeningSessionId);
  const jobUrl = decisionUrl(value.jobUrl);
  const title = typeof value.title === 'string' ? value.title.trim().slice(0, 500) : '';
  if (!screeningSessionId || !jobUrl || !title) return null;
  return {
    screeningSessionId,
    jobUrl,
    title,
    salary: typeof value.salary === 'string' ? value.salary.trim().slice(0, 120) || null : null,
    score: typeof value.score === 'number' && Number.isFinite(value.score) ? value.score : null,
    threshold: typeof value.threshold === 'number' && Number.isFinite(value.threshold) ? value.threshold : null,
    screeningPassed: typeof value.screeningPassed === 'boolean' ? value.screeningPassed : null,
    recommendedProfileId: recommendation?.profileId ?? null,
    recommendedProfileLabel: recommendation?.profileLabel ?? null,
    observedAt: now,
  };
}

export interface BossDiscoveryCoordinatorOptions {
  readonly client: BossDiscoveryClient;
  readonly campaignId: string;
  readonly stateLogPath: string;
  readonly idleCompleteMs?: number;
  readonly now?: () => string;
  readonly logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export class BossDiscoveryCoordinator {
  private readonly client: BossDiscoveryClient;
  private readonly campaignId: string;
  private readonly stateLogPath: string;
  private readonly idleCompleteMs: number;
  private readonly now: () => string;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly reports = new Map<string, BossDiscoveryReport>();
  private readonly decisions = new Map<string, BossDiscoveryDecision>();
  private readonly sessions = new Map<string, SessionState>();
  private campaignValidated = false;

  constructor(options: BossDiscoveryCoordinatorOptions) {
    this.client = options.client;
    this.campaignId = options.campaignId;
    this.stateLogPath = options.stateLogPath;
    this.idleCompleteMs = Math.max(5_000, options.idleCompleteMs ?? 10 * 60_000);
    this.now = options.now ?? (() => new Date().toISOString());
    this.logger = options.logger ?? console;
  }

  async recover(): Promise<void> {
    await this.ensureCampaign();
    let content = '';
    try { content = await readFile(this.stateLogPath, 'utf8'); } catch { return; }
    const states = new Map<string, SessionState>();
    for (const line of content.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      let event: PersistedSessionEvent;
      try { event = JSON.parse(line) as PersistedSessionEvent; } catch { continue; }
      if (!event?.sessionId || !event.runId || !Number.isInteger(event.generation)) continue;
      const key = event.sessionId;
      const current = states.get(key);
      if (!current || event.generation > current.generation) {
        states.set(key, {
          sessionId: event.sessionId,
          generation: event.generation,
          runId: event.runId,
          startedAt: event.occurredAt,
          lastAt: event.occurredAt,
          candidateCount: event.candidateCount ?? 0,
          insertedCount: event.insertedCount ?? 0,
          duplicateCount: event.duplicateCount ?? 0,
          rejectedCount: event.rejectedCount ?? 0,
          seenUrls: new Set(event.jobUrl ? [event.jobUrl] : []),
          completed: event.type === 'completed',
          timer: null,
          completing: null,
        });
      } else if (event.generation === current.generation) {
        current.lastAt = event.occurredAt;
        current.candidateCount = event.candidateCount ?? current.candidateCount;
        current.insertedCount = event.insertedCount ?? current.insertedCount;
        current.duplicateCount = event.duplicateCount ?? current.duplicateCount;
        current.rejectedCount = event.rejectedCount ?? current.rejectedCount;
        if (event.jobUrl) current.seenUrls.add(event.jobUrl);
        if (event.type === 'completed') current.completed = true;
      }
    }
    for (const [sessionId, state] of states) {
      this.sessions.set(sessionId, state);
      if (!state.completed) this.scheduleCompletion(state);
    }
  }

  async report(raw: unknown): Promise<{ accepted: true; correlated: boolean }> {
    const report = BossDiscoveryReportSchema.parse(raw);
    const canonical = canonicalJobUrl(report.jobUrl);
    const normalized = BossDiscoveryReportSchema.parse({ ...report, jobUrl: canonical, observedAt: report.observedAt ?? this.now() });
    this.reports.set(canonical, normalized);
    this.trimCache(this.reports);
    const decision = this.decisions.get(canonical);
    if (decision) {
      await this.ingest(normalized, decision);
      return { accepted: true, correlated: true };
    }
    const observedAt = normalized.observedAt ?? this.now();
    const day = observedAt.slice(0, 10).replace(/-/g, '');
    await this.ingest(normalized, {
      screeningSessionId: normalized.discoverySessionId ?? `boss-browser-daily-${day}`,
      jobUrl: normalized.jobUrl,
      title: normalized.title,
      salary: normalized.salary ?? null,
      score: null,
      threshold: null,
      screeningPassed: null,
      recommendedProfileId: null,
      recommendedProfileLabel: null,
      observedAt,
    });
    return { accepted: true, correlated: false };
  }

  async decision(decision: BossDiscoveryDecision): Promise<{ correlated: boolean }> {
    const canonical = canonicalJobUrl(decision.jobUrl);
    const normalized = { ...decision, jobUrl: canonical, observedAt: decision.observedAt ?? this.now() };
    this.decisions.set(canonical, normalized);
    this.trimCache(this.decisions);
    const report = this.reports.get(canonical);
    if (report) await this.ingest(report, normalized);
    return { correlated: Boolean(report) };
  }

  async completeAll(): Promise<void> {
    for (const state of [...this.sessions.values()]) {
      if (!state.completed) await this.complete(state);
    }
  }

  private async ensureCampaign(): Promise<void> {
    if (this.campaignValidated) return;
    const campaign = await this.client.campaigns.get(this.campaignId);
    if (!campaign || campaign.status !== 'active') throw new Error(`BOSS discovery campaign '${this.campaignId}' is not active`);
    this.campaignValidated = true;
  }

  private async ensureSession(sessionId: string, occurredAt: string): Promise<SessionState> {
    await this.ensureCampaign();
    const existing = this.sessions.get(sessionId);
    if (existing && !existing.completed) return existing;
    const generation = (existing?.generation ?? 0) + 1;
    const run = await this.client.discovery.begin({
      campaignId: this.campaignId,
      executor: 'other',
      contextSnapshot: {
        source: 'boss-browser',
        transport: 'tampermonkey-discovery-reporter',
        screeningSessionId: sessionId,
        generation,
      },
      startedAt: occurredAt,
      idempotencyKey: `boss-browser:${sessionId}:${generation}`,
    });
    const state: SessionState = {
      sessionId, generation, runId: run.id, startedAt: occurredAt, lastAt: occurredAt,
      candidateCount: 0, insertedCount: 0, duplicateCount: 0, rejectedCount: 0,
      seenUrls: new Set(), completed: false, timer: null, completing: null,
    };
    this.sessions.set(sessionId, state);
    await this.persist(state, 'started');
    this.scheduleCompletion(state);
    return state;
  }

  private async ingest(report: BossDiscoveryReport, decision: BossDiscoveryDecision): Promise<void> {
    const state = await this.ensureSession(decision.screeningSessionId, decision.observedAt ?? report.observedAt ?? this.now());
    if (state.seenUrls.has(report.jobUrl)) return;
    const externalId = externalJobId(report.jobUrl);
    const candidate: UpsertJobsBatchInput['jobs'][number] = {
      companyName: report.companyName,
      title: report.title,
      ...(report.city ? { city: report.city } : {}),
      description: report.description,
      observedAt: report.observedAt ?? decision.observedAt ?? this.now(),
      discoveryRunId: state.runId,
      listings: [{
        sourceKind: 'boss',
        label: 'BOSS直聘',
        url: report.jobUrl,
        ...(externalId ? { externalNamespace: 'boss', externalId, identityKind: 'external-id' as const } : { identityKind: 'url' as const }),
        status: 'active',
        metadataSnapshot: {
          source: 'boss-discovery-reporter',
          salary: report.salary ?? decision.salary ?? null,
          score: decision.score ?? null,
          threshold: decision.threshold ?? null,
          screeningPassed: decision.screeningPassed ?? null,
          recommendedProfileId: decision.recommendedProfileId ?? null,
          recommendedProfileLabel: decision.recommendedProfileLabel ?? null,
          screeningSessionId: decision.screeningSessionId,
        },
      }],
    };
    const result = (await this.client.jobs.upsertJobsBatch({ jobs: [candidate] })).items[0];
    if (!result) throw new Error('BOSS discovery upsert returned no item');
    state.seenUrls.add(report.jobUrl);
    state.lastAt = this.now();
    state.candidateCount += 1;
    if (result.status === 'inserted') state.insertedCount += 1;
    else if (result.status === 'rejected') state.rejectedCount += 1;
    else state.duplicateCount += 1;
    await this.persist(state, 'candidate', report.jobUrl, result.status);
    this.scheduleCompletion(state);
    this.reports.delete(report.jobUrl);
    this.decisions.delete(report.jobUrl);
  }

  private scheduleCompletion(state: SessionState): void {
    if (state.timer) clearTimeout(state.timer);
    const elapsed = Math.max(0, Date.now() - Date.parse(state.lastAt));
    const delay = Math.max(1, this.idleCompleteMs - elapsed);
    state.timer = setTimeout(() => {
      void this.complete(state).catch((error) => this.logger.error('BOSS discovery session completion failed', error));
    }, delay);
    state.timer.unref();
  }

  private async complete(state: SessionState): Promise<void> {
    if (state.completed) return;
    if (state.completing) return state.completing;
    state.completing = this.completeOnce(state).finally(() => { state.completing = null; });
    return state.completing;
  }

  private async completeOnce(state: SessionState): Promise<void> {
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    const completedAt = this.now();
    await this.client.discovery.complete({
      runId: state.runId,
      completedAt,
      candidateCount: state.candidateCount,
      insertedCount: state.insertedCount,
      duplicateCount: state.duplicateCount,
      rejectedCount: state.rejectedCount,
    });
    state.lastAt = completedAt;
    await this.persist(state, 'completed');
    state.completed = true;
  }

  private async persist(state: SessionState, type: PersistedSessionEvent['type'], jobUrl?: string, status?: PersistedSessionEvent['status']): Promise<void> {
    await mkdir(dirname(this.stateLogPath), { recursive: true });
    const event: PersistedSessionEvent = {
      type, sessionId: state.sessionId, generation: state.generation, runId: state.runId,
      occurredAt: state.lastAt, candidateCount: state.candidateCount, insertedCount: state.insertedCount,
      duplicateCount: state.duplicateCount, rejectedCount: state.rejectedCount,
      ...(jobUrl ? { jobUrl } : {}), ...(status ? { status } : {}),
    };
    await appendFile(this.stateLogPath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  private trimCache<T>(cache: Map<string, T>): void {
    while (cache.size > 500) cache.delete(cache.keys().next().value!);
  }
}

export function renderBossDiscoveryReporter(publicBaseUrl: string): string {
  const endpoint = `${publicBaseUrl.replace(/\/+$/, '')}/api/discovery/report`;
  const connectHost = new URL(endpoint).hostname;
  return `// ==UserScript==\n// @name         Job Harness BOSS Discovery Reporter\n// @namespace    https://job-harness.local/boss-discovery\n// @version      2026.09.18.1\n// @description  Read-only BOSS job detail reporter for Job Harness DiscoveryRun\n// @match        https://www.zhipin.com/job_detail/*\n// @grant        GM_xmlhttpRequest\n// @grant        GM.xmlHttpRequest\n// @connect      ${connectHost}\n// ==/UserScript==\n\n(function () {\n  'use strict';\n  const ENDPOINT = ${JSON.stringify(endpoint)};\n  const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\\s+/g, ' ').trim() || '';\n  function jsonLd() {\n    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {\n      try {\n        const raw = JSON.parse(node.textContent || 'null');\n        const stack = Array.isArray(raw) ? [...raw] : [raw];\n        while (stack.length) {\n          const value = stack.shift();\n          if (!value || typeof value !== 'object') continue;\n          if (Array.isArray(value)) { stack.push(...value); continue; }\n          if (value['@type'] === 'JobPosting' || (Array.isArray(value['@type']) && value['@type'].includes('JobPosting'))) return value;\n          if (value['@graph']) stack.push(...(Array.isArray(value['@graph']) ? value['@graph'] : [value['@graph']]));\n        }\n      } catch {}\n    }\n    return null;\n  }\n  function plainHtml(value) {\n    const box = document.createElement('div'); box.innerHTML = String(value || ''); return box.textContent?.replace(/\\s+/g, ' ').trim() || '';\n  }\n  function snapshot() {\n    const ld = jsonLd();\n    const companyName = String(ld?.hiringOrganization?.name || '') || text('.company-info .company-name') || text('.company-info h2 a') || text('.sider-company .company-info a') || text('.job-detail-company .name');\n    const city = String(ld?.jobLocation?.address?.addressLocality || ld?.jobLocation?.[0]?.address?.addressLocality || '') || text('.location-address') || text('.job-address .location-address') || text('.job-info .job-area');\n    const title = String(ld?.title || '') || text('.name h1') || text('h1');\n    const description = plainHtml(ld?.description) || text('.job-sec-text');\n    const salary = text('.name .salary') || text('.salary');\n    if (!companyName || !title || !description) return null;\n    return { jobUrl: location.href, title, companyName, city: city || null, salary: salary || null, description, observedAt: new Date().toISOString() };\n  }\n  function post(payload) {\n    const details = { method: 'POST', url: ENDPOINT, headers: { 'Content-Type': 'application/json' }, data: JSON.stringify(payload), timeout: 10000 };\n    if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') return Promise.resolve(GM.xmlHttpRequest(details));\n    if (typeof GM_xmlhttpRequest === 'function') return new Promise((resolve, reject) => GM_xmlhttpRequest({ ...details, onload: resolve, onerror: reject, ontimeout: reject }));\n    return Promise.reject(new Error('Tampermonkey request API unavailable'));\n  }\n  let attempts = 0;\n  const timer = setInterval(() => {\n    attempts += 1;\n    const payload = snapshot();\n    if (!payload && attempts < 40) return;\n    clearInterval(timer);\n    if (payload) void post(payload).catch(() => undefined);\n  }, 250);\n})();\n`;
}
