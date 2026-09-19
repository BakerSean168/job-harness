import { chromium } from 'playwright';

export class LocalCdpProvider {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.JAC_LOCAL_CHROME_CDP_URL || 'http://127.0.0.1:9222';
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async start() {
    this.browser = await chromium.connectOverCDP(this.endpoint);
    this.context = this.browser.contexts()[0];
    if (!this.context) throw new Error('Local Chrome exposed no browser context over CDP.');
    this.page = this.context.pages().find((candidate) => candidate.url().includes('zhipin.com'))
      || this.context.pages()[0]
      || await this.context.newPage();
    return this.describe();
  }

  describe() {
    return {
      provider: 'local-cdp',
      endpoint: this.endpoint,
      humanControl: 'local-window',
      sessionId: null,
    };
  }

  async getPage() {
    if (!this.page) await this.start();
    return this.page;
  }

  async getContext() {
    if (!this.context) await this.start();
    return this.context;
  }

  async saveState() {
    return { persistedBy: 'chrome-user-data-dir' };
  }

  async stop() {
    // Intentionally do not call browser.close(): this provider attaches to a user-owned Chrome.
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
