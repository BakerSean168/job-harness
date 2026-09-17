import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { PlaywrightBrowserDriver } from './playwright-driver';
import type { BrowserBackendDescriptor, BrowserBackendPort, BrowserSessionPort, BrowserSessionRequest } from './types';

interface SteelSessionRecord {
  readonly id: string;
  readonly websocketUrl: string;
  readonly sessionViewerUrl?: string;
  readonly debugUrl?: string;
  readonly status?: string;
}

export interface SteelBrowserBackendOptions {
  readonly baseUrl: string;
  readonly viewerBaseUrl?: string | null;
  readonly apiKey?: string | null;
  readonly contextPath?: string | null;
  readonly timezone?: string;
  readonly headless?: boolean;
  readonly proxyUrl?: string | null;
}

export class SteelBrowserBackend implements BrowserBackendPort {
  readonly id = 'steel';
  private readonly baseUrl: string;
  private readonly viewerBaseUrl: string | null;
  private readonly apiKey: string | null;
  private readonly contextPath: string | null;
  private readonly timezone: string;
  private readonly headless: boolean;
  private readonly proxyUrl: string | null;

  constructor(options: SteelBrowserBackendOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.viewerBaseUrl = options.viewerBaseUrl?.replace(/\/+$/, '') || null;
    this.apiKey = options.apiKey?.trim() || null;
    this.contextPath = options.contextPath || null;
    this.timezone = options.timezone ?? 'Asia/Shanghai';
    this.headless = options.headless ?? true;
    this.proxyUrl = options.proxyUrl?.trim() || null;
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
      const response = await fetch(`${this.baseUrl}/v1/health`, { headers: this.headers() });
      if (!response.ok) return { ok: false, detail: `Steel HTTP ${response.status}` };
      const data = await response.json().catch(() => null) as { status?: string } | null;
      return data?.status === 'ok' ? { ok: true, detail: null } : { ok: false, detail: `Steel health ${JSON.stringify(data)}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async acquire(request: BrowserSessionRequest = {}): Promise<BrowserSessionPort> {
    const health = await this.health();
    if (!health.ok) throw new Error(`Steel is unavailable: ${health.detail ?? 'unknown error'}`);
    let session = request.reuseLiveSession ? await this.findLiveSession() : null;
    let created = false;
    if (!session) {
      const savedContext = await this.readSavedContext();
      const body: Record<string, unknown> = { persist: true, headless: this.headless, timezone: this.timezone };
      if (savedContext) body.sessionContext = savedContext;
      if (this.proxyUrl) body.proxyUrl = this.proxyUrl;
      session = await this.requestJson<SteelSessionRecord>('/v1/sessions', { method: 'POST', body });
      created = true;
    }
    const browser = await this.connectWithRetry(this.normalizeWebsocketUrl(session.websocketUrl));
    const context = browser.contexts()[0];
    if (!context) throw new Error('Steel exposed no browser context over CDP');
    const page = pickPage(context, request.preferredUrl) ?? await context.newPage();
    return new SteelBrowserSession(this, session, browser, context, page, created);
  }

  private headers(): Record<string, string> {
    return { accept: 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) };
  }

  private async findLiveSession(): Promise<SteelSessionRecord | null> {
    const data = await this.requestJson<{ sessions?: SteelSessionRecord[] }>('/v1/sessions');
    return data.sessions?.find((candidate) => candidate.status === 'live' || candidate.status === 'idle') ?? null;
  }

  async persistSession(session: SteelSessionRecord): Promise<void> {
    if (!this.contextPath) return;
    const raw = await this.requestJson<Record<string, unknown>>(`/v1/sessions/${encodeURIComponent(session.id)}/context`);
    const normalized = normalizeSessionContextOrigins(raw);
    await mkdir(dirname(this.contextPath), { recursive: true });
    await writeFile(this.contextPath, `${JSON.stringify({ format: 'JobHarnessSteelContext', version: 1, savedAt: new Date().toISOString(), sessionContext: normalized }, null, 2)}\n`, { mode: 0o600 });
  }

  async releaseSession(session: SteelSessionRecord): Promise<void> {
    await this.requestJson(`/v1/sessions/${encodeURIComponent(session.id)}/release`, { method: 'POST', body: {} });
  }

  humanControlUrl(session: SteelSessionRecord): string | null {
    if (this.viewerBaseUrl) return `${this.viewerBaseUrl}/ui`;
    const raw = session.sessionViewerUrl ?? session.debugUrl;
    return raw ? normalizeHttpUrl(raw, this.baseUrl) : null;
  }

  private async readSavedContext(): Promise<Record<string, unknown> | null> {
    if (!this.contextPath) return null;
    try {
      const parsed = JSON.parse(await readFile(this.contextPath, 'utf8')) as { sessionContext?: Record<string, unknown> };
      return parsed.sessionContext ? normalizeSessionContextOrigins(parsed.sessionContext) : null;
    } catch { return null; }
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

  private async requestJson<T = unknown>(pathname: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers: { ...this.headers(), ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    };
    const response = await fetch(`${this.baseUrl}${pathname}`, init);
    const text = await response.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!response.ok) throw new Error(`Steel ${options.method ?? 'GET'} ${pathname} failed: HTTP ${response.status} ${String(text).slice(0, 500)}`);
    return data as T;
  }
}

class SteelBrowserSession implements BrowserSessionPort {
  readonly backendId = 'steel';
  readonly sessionId: string;
  readonly humanControlUrl: string | null;
  private readonly driverValue: PlaywrightBrowserDriver;
  private released = false;

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
  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await this.persist().catch(() => {});
    await this.backend.releaseSession(this.session).catch(() => {});
    void this.browser;
    void this.context;
  }
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
