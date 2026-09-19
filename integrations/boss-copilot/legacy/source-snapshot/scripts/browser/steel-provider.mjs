import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

export class SteelProvider {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || process.env.JAC_STEEL_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    this.viewerBaseUrl = String(options.viewerBaseUrl || process.env.JAC_STEEL_VIEWER_BASE_URL || '').replace(/\/+$/, '');
    this.apiKey = options.apiKey || process.env.STEEL_API_KEY || '';
    this.contextPath = options.contextPath || process.env.JAC_STEEL_CONTEXT_PATH || path.join(root, '.local', 'browser', 'steel-boss-context.json');
    this.reuseLiveSession = options.reuseLiveSession ?? false;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.session = null;
    this.createdSession = false;
    this.lastSavedState = null;
  }

  async start() {
    await this.assertHealthy();
    if (this.reuseLiveSession) this.session = await this.findLiveSession();
    if (!this.session) {
      const sessionContext = this.readSavedContext();
      const body = {
        persist: true,
        headless: String(process.env.JAC_STEEL_HEADLESS || 'true').toLowerCase() !== 'false',
        timezone: process.env.JAC_BROWSER_TIMEZONE || 'Asia/Shanghai',
      };
      if (sessionContext) body.sessionContext = sessionContext;
      const proxyUrl = process.env.JAC_STEEL_PROXY_URL;
      if (proxyUrl) body.proxyUrl = proxyUrl;
      this.session = await this.requestJson('/v1/sessions', { method: 'POST', body });
      this.createdSession = true;
    }

    const websocketUrl = this.normalizeWebsocketUrl(this.session.websocketUrl);
    this.browser = await this.connectOverCdpWithRetry(websocketUrl);
    this.context = this.browser.contexts()[0];
    if (!this.context) throw new Error('Steel exposed no browser context over CDP.');
    this.page = this.context.pages().find((candidate) => candidate.url().includes('zhipin.com'))
      || this.context.pages()[0]
      || await this.context.newPage();
    return this.describe();
  }

  async assertHealthy() {
    const response = await fetch(`${this.baseUrl}/v1/health`, { headers: this.headers() });
    if (!response.ok) throw new Error(`Steel health check failed: HTTP ${response.status}`);
    const data = await response.json().catch(() => null);
    if (data?.status !== 'ok') throw new Error(`Steel health check returned ${JSON.stringify(data)}`);
  }

  async findLiveSession() {
    const data = await this.requestJson('/v1/sessions');
    return Array.isArray(data?.sessions)
      ? data.sessions.find((item) => ['live', 'idle'].includes(item?.status)) || null
      : null;
  }

  describe() {
    return {
      provider: 'steel',
      baseUrl: this.baseUrl,
      sessionId: this.session?.id || null,
      reusedSession: Boolean(this.session && !this.createdSession),
      humanControlUrl: this.getHumanControlUrl(),
      contextPath: this.contextPath,
    };
  }

  getHumanControlUrl() {
    if (this.viewerBaseUrl) return `${this.viewerBaseUrl}/ui`;
    const raw = this.session?.sessionViewerUrl || this.session?.debugUrl || '';
    return this.normalizeHttpUrl(raw);
  }

  async getPage() {
    if (!this.page) await this.start();
    return this.page;
  }

  async getContext() {
    if (!this.context) await this.start();
    return this.context;
  }

  readSavedContext() {
    if (!fs.existsSync(this.contextPath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.contextPath, 'utf8'));
      return parsed?.sessionContext && typeof parsed.sessionContext === 'object'
        ? this.normalizeSessionContextOrigins(parsed.sessionContext)
        : null;
    } catch {
      return null;
    }
  }

  async saveState() {
    if (!this.session?.id) return null;
    const rawSessionContext = await this.requestJson(`/v1/sessions/${encodeURIComponent(this.session.id)}/context`);
    const sessionContext = this.normalizeSessionContextOrigins(rawSessionContext);
    fs.mkdirSync(path.dirname(this.contextPath), { recursive: true });
    const payload = {
      format: 'JobApplicationCopilotSteelContext',
      version: 1,
      savedAt: new Date().toISOString(),
      sessionId: this.session.id,
      sessionContext,
    };
    fs.writeFileSync(this.contextPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    this.lastSavedState = payload;
    return payload;
  }

  async stop(options = {}) {
    const persist = options.persist ?? true;
    const release = options.release ?? false;
    if (persist && this.session?.id && !this.lastSavedState) await this.saveState();
    if (release && this.session?.id) {
      await this.requestJson(`/v1/sessions/${encodeURIComponent(this.session.id)}/release`, {
        method: 'POST',
        body: {},
      });
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    if (release) this.session = null;
  }

  normalizeSessionContextOrigins(context) {
    if (!context || typeof context !== 'object') return context;
    const normalized = { ...context };
    for (const bucket of ['localStorage', 'sessionStorage', 'indexedDB']) {
      const values = context[bucket];
      if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
      normalized[bucket] = Object.fromEntries(Object.entries(values).map(([key, value]) => [
        this.normalizeStorageOrigin(key),
        value,
      ]));
    }
    return normalized;
  }

  normalizeStorageOrigin(value) {
    const key = String(value || '').trim();
    if (!key) return key;
    if (/^https?:\/\//i.test(key)) return new URL(key).origin;
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(key)) return `http://${key}`;
    return `https://${key}`;
  }

  normalizeWebsocketUrl(raw) {
    if (!raw) throw new Error('Steel session did not return websocketUrl.');
    const url = new URL(raw);
    const base = new URL(this.baseUrl);
    if (['0.0.0.0', 'localhost'].includes(url.hostname)) url.hostname = base.hostname;
    if (!url.port && base.port) url.port = base.port;
    if (base.protocol === 'https:') url.protocol = 'wss:';
    if (base.protocol === 'http:') url.protocol = 'ws:';
    if (this.apiKey && !url.searchParams.has('apiKey')) url.searchParams.set('apiKey', this.apiKey);
    return url.toString();
  }

  normalizeHttpUrl(raw) {
    if (!raw) return '';
    const url = new URL(raw);
    const base = new URL(this.baseUrl);
    if (['0.0.0.0', 'localhost'].includes(url.hostname)) url.hostname = base.hostname;
    if (!url.port && base.port) url.port = base.port;
    if (base.protocol === 'https:') url.protocol = 'https:';
    if (base.protocol === 'http:') url.protocol = 'http:';
    return url.toString();
  }

  headers() {
    return {
      accept: 'application/json',
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  async connectOverCdpWithRetry(websocketUrl, timeoutMs = 12000) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        return await chromium.connectOverCDP(websocketUrl);
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    throw lastError || new Error(`Timed out connecting to Steel CDP: ${websocketUrl}`);
  }

  async requestJson(pathname, options = {}) {
    const headers = {
      ...this.headers(),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      throw new Error(`Steel ${options.method || 'GET'} ${pathname} failed: HTTP ${response.status} ${String(text).slice(0, 500)}`);
    }
    return data;
  }
}
