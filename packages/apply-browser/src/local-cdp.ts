import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { PlaywrightBrowserDriver } from './playwright-driver';
import type { BrowserBackendDescriptor, BrowserBackendPort, BrowserSessionPort, BrowserSessionRequest } from './types';

export interface LocalCdpBrowserBackendOptions {
  readonly endpoint?: string;
}

export class LocalCdpBrowserBackend implements BrowserBackendPort {
  readonly id = 'local-cdp';
  private readonly endpoint: string;

  constructor(options: LocalCdpBrowserBackendOptions = {}) {
    this.endpoint = options.endpoint ?? 'http://127.0.0.1:9222';
  }

  describe(): BrowserBackendDescriptor {
    return { id: this.id, kind: 'local-cdp', persistentSession: true, humanControl: true, metadata: { endpoint: this.endpoint } };
  }

  async health(): Promise<{ ok: boolean; detail: string | null }> {
    try {
      const response = await fetch(`${this.endpoint.replace(/\/+$/, '')}/json/version`);
      return response.ok ? { ok: true, detail: null } : { ok: false, detail: `CDP HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async acquire(request: BrowserSessionRequest = {}): Promise<BrowserSessionPort> {
    const browser = await chromium.connectOverCDP(this.endpoint);
    const context = browser.contexts()[0];
    if (!context) throw new Error('Local Chrome exposed no browser context over CDP');
    const page = pickPage(context, request.preferredUrl) ?? await context.newPage();
    return new LocalCdpBrowserSession(browser, context, page, this.endpoint);
  }
}

class LocalCdpBrowserSession implements BrowserSessionPort {
  readonly backendId = 'local-cdp';
  readonly sessionId: string;
  readonly humanControlUrl: string | null = 'local-window';
  private readonly browser: Browser;
  private readonly context: BrowserContext;
  private readonly page: Page;
  private readonly driverValue: PlaywrightBrowserDriver;

  constructor(browser: Browser, context: BrowserContext, page: Page, endpoint: string) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.sessionId = `local-cdp:${endpoint}`;
    this.driverValue = new PlaywrightBrowserDriver(page);
  }

  driver() { return this.driverValue; }
  async persist(): Promise<void> { /* user-owned Chrome persists its own profile */ }
  async release(): Promise<void> {
    // Do not close a user-owned Chrome. Dropping this wrapper detaches logical ownership only.
    void this.browser;
    void this.context;
    void this.page;
  }
}

function pickPage(context: BrowserContext, preferredUrl?: string | null): Page | null {
  const pages = context.pages();
  if (preferredUrl) {
    try {
      const host = new URL(preferredUrl).hostname;
      const match = pages.find((page) => {
        try { return new URL(page.url()).hostname === host; } catch { return false; }
      });
      if (match) return match;
    } catch { /* use first usable page */ }
  }
  return pages.find((page) => page.url() !== 'about:blank') ?? pages[0] ?? null;
}
