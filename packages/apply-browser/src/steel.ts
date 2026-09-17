import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { z } from 'zod';
import { BrowserSessionHandoffSchema, type BrowserSessionHandoff } from '@job-harness/apply-contracts';
import { PlaywrightBrowserDriver } from './playwright-driver';
import type {
  BrowserBackendDescriptor,
  BrowserBackendPort,
  BrowserSessionPort,
  BrowserSessionRequest,
  BrowserSessionRetentionRequest,
} from './types';

const SteelSessionRecordSchema = z.object({
  id: z.string().trim().min(1),
  websocketUrl: z.string().trim().min(1),
  sessionViewerUrl: z.string().trim().min(1).optional(),
  debugUrl: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
}).passthrough();
type SteelSessionRecord = z.infer<typeof SteelSessionRecordSchema>;

const SteelSessionListSchema = z.object({ sessions: z.array(SteelSessionRecordSchema).default([]) }).passthrough();
const SteelHealthSchema = z.object({ status: z.string().trim().min(1) }).passthrough();
const SteelSessionContextSchema = z.record(z.string(), z.unknown());

const RetainedSessionRecordSchema = z.object({
  sessionRef: z.string().trim().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
}).strict();
type RetainedSessionRecord = z.infer<typeof RetainedSessionRecordSchema>;

const SteelContextFileSchema = z.object({
  format: z.literal('JobHarnessSteelContext'),
  version: z.literal(1),
  savedAt: z.iso.datetime({ offset: true }),
  sessionContext: SteelSessionContextSchema,
}).strict();
const SteelHandoffRegistrySchema = z.object({
  format: z.literal('JobHarnessSteelHandoffs'),
  version: z.literal(1),
  records: z.array(RetainedSessionRecordSchema),
}).strict();

export interface SteelBrowserBackendOptions {
  readonly baseUrl: string;
  readonly viewerBaseUrl?: string | null;
  readonly apiKey?: string | null;
  readonly contextPath?: string | null;
  readonly handoffRegistryPath?: string | null;
  readonly timezone?: string;
  readonly headless?: boolean;
  readonly proxyUrl?: string | null;
  readonly requestTimeoutMs?: number;
}

export class SteelBrowserBackend implements BrowserBackendPort {
  readonly id = 'steel';
  private readonly baseUrl: string;
  private readonly viewerBaseUrl: string | null;
  private readonly apiKey: string | null;
  private readonly contextPath: string | null;
  private readonly handoffRegistryPath: string | null;
  private readonly timezone: string;
  private readonly headless: boolean;
  private readonly proxyUrl: string | null;
  private readonly requestTimeoutMs: number;
  private readonly retained = new Map<string, SteelBrowserSession>();

  constructor(options: SteelBrowserBackendOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.viewerBaseUrl = options.viewerBaseUrl?.replace(/\/+$/, '') || null;
    this.apiKey = options.apiKey?.trim() || null;
    this.contextPath = options.contextPath || null;
    this.handoffRegistryPath = options.handoffRegistryPath
      || (this.contextPath ? join(dirname(this.contextPath), 'steel-handoffs.json') : null);
    this.timezone = options.timezone ?? 'Asia/Shanghai';
    this.headless = options.headless ?? true;
    this.proxyUrl = options.proxyUrl?.trim() || null;
    this.requestTimeoutMs = positiveTimeout(options.requestTimeoutMs ?? 15_000, 'Steel requestTimeoutMs');
  }

  describe(): BrowserBackendDescriptor {
    return {
      id: this.id,
      kind: 'managed-remote',
      persistentSession: Boolean(this.contextPath),
      humanControl: Boolean(this.viewerBaseUrl),
      metadata: { baseUrl: this.baseUrl, timezone: this.timezone, headless: this.headless },
    };
  }

  async health(): Promise<{ ok: boolean; detail: string | null }> {
    try {
      const data = SteelHealthSchema.parse(await this.requestJson('/v1/health'));
      return data.status === 'ok' ? { ok: true, detail: null } : { ok: false, detail: `Steel health status '${data.status}'` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async acquire(request: BrowserSessionRequest = {}): Promise<BrowserSessionPort> {
    await this.reapExpired();
    const health = await this.health();
    if (!health.ok) throw new Error(`Steel is unavailable: ${health.detail ?? 'unknown error'}`);
    let session = request.reuseLiveSession ? await this.findLiveSession() : null;
    let created = false;
    if (!session) {
      const savedContext = await this.readSavedContext();
      const body: Record<string, unknown> = { persist: true, headless: this.headless, timezone: this.timezone };
      if (savedContext) body.sessionContext = savedContext;
      if (this.proxyUrl) body.proxyUrl = this.proxyUrl;
      session = SteelSessionRecordSchema.parse(await this.requestJson('/v1/sessions', { method: 'POST', body }));
      created = true;
    }
    return this.connectSession(session, request.preferredUrl ?? null, created);
  }

  async resume(handoff: BrowserSessionHandoff, _request: BrowserSessionRequest = {}): Promise<BrowserSessionPort> {
    const parsed = BrowserSessionHandoffSchema.parse(handoff);
    if (parsed.backendId !== this.id) throw new Error(`Browser handoff belongs to '${parsed.backendId}', not '${this.id}'`);
    const now = new Date().toISOString();
    if (parsed.expiresAt <= now) {
      await this.releaseSessionRef(parsed.sessionRef).catch(() => {});
      await this.removeRetainedRecord(parsed.sessionRef);
      throw new Error(`Steel browser handoff expired at ${parsed.expiresAt}`);
    }
    await this.reapExpired(now);
    const inProcess = this.retained.get(parsed.sessionRef);
    if (inProcess) {
      this.retained.delete(parsed.sessionRef);
      await this.removeRetainedRecord(parsed.sessionRef);
      inProcess.markResumed();
      return inProcess;
    }
    const session = await this.findSessionById(parsed.sessionRef);
    if (!session || !['live', 'idle'].includes(session.status ?? '')) {
      await this.removeRetainedRecord(parsed.sessionRef);
      throw new Error(`Retained Steel session '${parsed.sessionRef}' is no longer live`);
    }
    await this.removeRetainedRecord(parsed.sessionRef);
    return this.connectSession(session, null, false);
  }

  async reapExpired(now = new Date().toISOString()): Promise<number> {
    const records = await this.readRetainedRecords();
    const expired = records.filter((record) => record.expiresAt <= now);
    if (!expired.length) return 0;
    for (const record of expired) {
      const inProcess = this.retained.get(record.sessionRef);
      this.retained.delete(record.sessionRef);
      if (inProcess) await inProcess.forceRelease().catch(() => {});
      else await this.releaseSessionRef(record.sessionRef).catch(() => {});
    }
    await this.writeRetainedRecords(records.filter((record) => record.expiresAt > now));
    return expired.length;
  }

  async retainSession(session: SteelBrowserSession, expiresAt: string): Promise<BrowserSessionHandoff> {
    const retainedAt = new Date().toISOString();
    const handoff = BrowserSessionHandoffSchema.parse({
      backendId: this.id,
      sessionRef: session.sessionId,
      humanControlUrl: session.humanControlUrl && /^https?:\/\//i.test(session.humanControlUrl) ? session.humanControlUrl : null,
      retainedAt,
      expiresAt,
    });
    this.retained.set(session.sessionId, session);
    const records = (await this.readRetainedRecords()).filter((record) => record.sessionRef !== session.sessionId);
    records.push({ sessionRef: session.sessionId, expiresAt });
    await this.writeRetainedRecords(records);
    return handoff;
  }

  async persistSession(session: SteelSessionRecord): Promise<void> {
    if (!this.contextPath) return;
    const raw = SteelSessionContextSchema.parse(await this.requestJson(`/v1/sessions/${encodeURIComponent(session.id)}/context`));
    const normalized = normalizeSessionContextOrigins(raw);
    await mkdir(dirname(this.contextPath), { recursive: true });
    await writePrivateJson(this.contextPath, { format: 'JobHarnessSteelContext', version: 1, savedAt: new Date().toISOString(), sessionContext: normalized });
  }

  async releaseSession(session: SteelSessionRecord): Promise<void> {
    await this.releaseSessionRef(session.id);
    this.retained.delete(session.id);
    await this.removeRetainedRecord(session.id);
  }

  humanControlUrl(session: SteelSessionRecord): string | null {
    if (this.viewerBaseUrl) return `${this.viewerBaseUrl}/ui`;
    const raw = session.sessionViewerUrl ?? session.debugUrl;
    return raw ? normalizeHttpUrl(raw, this.baseUrl) : null;
  }

  private async connectSession(session: SteelSessionRecord, preferredUrl: string | null, created: boolean): Promise<SteelBrowserSession> {
    const browser = await this.connectWithRetry(this.normalizeWebsocketUrl(session.websocketUrl));
    const context = browser.contexts()[0];
    if (!context) throw new Error('Steel exposed no browser context over CDP');
    const page = pickPage(context, preferredUrl) ?? await context.newPage();
    return new SteelBrowserSession(this, session, browser, context, page, created);
  }

  private headers(): Record<string, string> {
    return { accept: 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) };
  }

  private async listSessions(): Promise<SteelSessionRecord[]> {
    return SteelSessionListSchema.parse(await this.requestJson('/v1/sessions')).sessions;
  }

  private async findLiveSession(): Promise<SteelSessionRecord | null> {
    return (await this.listSessions()).find((candidate) => candidate.status === 'live' || candidate.status === 'idle') ?? null;
  }

  private async findSessionById(sessionId: string): Promise<SteelSessionRecord | null> {
    return (await this.listSessions()).find((candidate) => candidate.id === sessionId) ?? null;
  }

  private async releaseSessionRef(sessionId: string): Promise<void> {
    await this.requestJson(`/v1/sessions/${encodeURIComponent(sessionId)}/release`, { method: 'POST', body: {} });
  }

  private async readSavedContext(): Promise<Record<string, unknown> | null> {
    if (!this.contextPath) return null;
    try {
      const parsed = SteelContextFileSchema.parse(JSON.parse(await readFile(this.contextPath, 'utf8')) as unknown);
      return normalizeSessionContextOrigins(parsed.sessionContext);
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw new Error(`Steel persisted context '${this.contextPath}' is unreadable or invalid`, { cause: error });
    }
  }

  private async readRetainedRecords(): Promise<RetainedSessionRecord[]> {
    if (!this.handoffRegistryPath) return [];
    try {
      return SteelHandoffRegistrySchema.parse(JSON.parse(await readFile(this.handoffRegistryPath, 'utf8')) as unknown).records;
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw new Error(`Steel handoff registry '${this.handoffRegistryPath}' is unreadable or invalid`, { cause: error });
    }
  }

  private async writeRetainedRecords(records: readonly RetainedSessionRecord[]): Promise<void> {
    if (!this.handoffRegistryPath) return;
    await mkdir(dirname(this.handoffRegistryPath), { recursive: true });
    await writePrivateJson(this.handoffRegistryPath, { format: 'JobHarnessSteelHandoffs', version: 1, records });
  }

  private async removeRetainedRecord(sessionId: string): Promise<void> {
    if (!this.handoffRegistryPath) return;
    const records = (await this.readRetainedRecords()).filter((record) => record.sessionRef !== sessionId);
    await this.writeRetainedRecords(records);
  }

  private normalizeWebsocketUrl(raw: string): string {
    const url = new URL(raw);
    const base = new URL(this.baseUrl);
    if (['0.0.0.0', 'localhost'].includes(url.hostname)) url.hostname = base.hostname;
    if (!url.port && base.port) url.port = base.port;
    url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    if (this.apiKey && !url.searchParams.has('apiKey')) url.searchParams.set('apiKey', this.apiKey);
    return url.toString();
  }

  private async connectWithRetry(websocketUrl: string, timeoutMs = 12_000): Promise<Browser> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown = null;
    while (Date.now() < deadline) {
      try { return await chromium.connectOverCDP(websocketUrl); }
      catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 300)); }
    }
    throw lastError instanceof Error ? lastError : new Error(`Timed out connecting to Steel CDP: ${websocketUrl}`);
  }

  private async requestJson(pathname: string, options: { method?: string; body?: unknown } = {}): Promise<unknown> {
    const method = options.method ?? 'GET';
    const init: RequestInit = {
      method,
      headers: { ...this.headers(), ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    };
    const response = await fetch(`${this.baseUrl}${pathname}`, init);
    const text = await response.text();
    if (!response.ok) throw new Error(`Steel ${method} ${pathname} failed with HTTP ${response.status}`);
    if (!text) return null;
    try { return JSON.parse(text) as unknown; }
    catch (error) { throw new Error(`Steel ${method} ${pathname} returned invalid JSON`, { cause: error }); }
  }
}

class SteelBrowserSession implements BrowserSessionPort {
  readonly backendId = 'steel';
  readonly sessionId: string;
  readonly humanControlUrl: string | null;
  private readonly driverValue: PlaywrightBrowserDriver;
  private released = false;
  private retainedForHuman = false;

  constructor(
    private readonly backend: SteelBrowserBackend,
    private readonly session: SteelSessionRecord,
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    page: Page,
    readonly created: boolean,
  ) {
    this.sessionId = session.id;
    this.humanControlUrl = backend.humanControlUrl(session);
    this.driverValue = new PlaywrightBrowserDriver(page);
  }

  driver() { return this.driverValue; }
  async persist(): Promise<void> { await this.backend.persistSession(this.session); }

  async retainForHuman(request: BrowserSessionRetentionRequest): Promise<BrowserSessionHandoff> {
    if (this.released) throw new Error(`Steel session '${this.sessionId}' was already released`);
    await this.persist();
    const handoff = await this.backend.retainSession(this, request.expiresAt);
    this.retainedForHuman = true;
    return handoff;
  }

  markResumed(): void { this.retainedForHuman = false; }

  async forceRelease(): Promise<void> {
    if (this.released) return;
    this.released = true;
    this.retainedForHuman = false;
    await this.backend.releaseSession(this.session).catch(() => {});
    void this.browser;
    void this.context;
  }

  async release(): Promise<void> {
    if (this.retainedForHuman) return;
    if (this.released) return;
    await this.persist().catch(() => {});
    await this.forceRelease();
  }
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

function positiveTimeout(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number`);
  return Math.floor(value);
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function pickPage(context: BrowserContext, preferredUrl?: string | null): Page | null {
  const pages = context.pages();
  if (preferredUrl) {
    try {
      const host = new URL(preferredUrl).hostname;
      const matched = pages.find((page) => { try { return new URL(page.url()).hostname === host; } catch { return false; } });
      if (matched) return matched;
    } catch { /* ignore malformed preferred URL */ }
  }
  return pages.find((page) => page.url() !== 'about:blank') ?? pages[0] ?? null;
}

function normalizeSessionContextOrigins(context: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...context };
  for (const bucket of ['localStorage', 'sessionStorage', 'indexedDB']) {
    const values = context[bucket];
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    normalized[bucket] = Object.fromEntries(Object.entries(values as Record<string, unknown>).map(([key, value]) => [normalizeStorageOrigin(key), value]));
  }
  return normalized;
}

function normalizeStorageOrigin(value: string): string {
  const key = value.trim();
  if (!key) return key;
  if (/^https?:\/\//i.test(key)) return new URL(key).origin;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(key)) return `http://${key}`;
  return `https://${key}`;
}

function normalizeHttpUrl(raw: string, baseUrl: string): string {
  const url = new URL(raw);
  const base = new URL(baseUrl);
  if (['0.0.0.0', 'localhost'].includes(url.hostname)) url.hostname = base.hostname;
  if (!url.port && base.port) url.port = base.port;
  url.protocol = base.protocol === 'https:' ? 'https:' : 'http:';
  return url.toString();
}

export const steelContextInternals = { normalizeSessionContextOrigins, normalizeStorageOrigin, normalizeHttpUrl };
