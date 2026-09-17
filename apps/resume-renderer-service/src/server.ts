import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { chromium, type Browser } from 'playwright-core';

const PLAYWRIGHT_CORE_VERSION = '1.55.0';
const PDF_SETTINGS_VERSION = 'pdf-v1';
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface ResumeRendererServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly executablePath?: string;
  readonly authToken?: string | null;
}

export interface RunningResumeRendererServer {
  readonly url: string;
  readonly rendererId: string;
  readonly rendererVersion: string;
  readonly server: Server;
  close(): Promise<void>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.byteLength,
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(buffer);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function authorized(req: IncomingMessage, token: string | null): boolean {
  return !token || req.headers.authorization === `Bearer ${token}`;
}

async function launchBrowser(executablePath: string): Promise<Browser> {
  return chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

export async function startResumeRendererServer(options: ResumeRendererServerOptions = {}): Promise<RunningResumeRendererServer> {
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 3002;
  const executablePath = options.executablePath ?? '/usr/bin/chromium';
  const authToken = options.authToken?.trim() || null;
  let browser = await launchBrowser(executablePath);
  const rendererId = 'chromium-playwright';
  const rendererVersion = `${browser.version()}-pw${PLAYWRIGHT_CORE_VERSION}-${PDF_SETTINGS_VERSION}`.replace(/\s+/g, '-').slice(0, 100);

  async function healthyBrowser(): Promise<Browser> {
    if (browser.isConnected()) return browser;
    browser = await launchBrowser(executablePath);
    return browser;
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://renderer.local');
      if (req.method === 'GET' && url.pathname === '/healthz') {
        json(res, browser.isConnected() ? 200 : 503, { ok: browser.isConnected(), rendererId, rendererVersion });
        return;
      }
      if (req.method !== 'POST' || url.pathname !== '/render/pdf') {
        json(res, 404, { error: 'not_found' });
        return;
      }
      if (!authorized(req, authToken)) {
        json(res, 401, { error: 'unauthorized' });
        return;
      }
      const payload = await readJson(req);
      const html = payload && typeof payload === 'object' && typeof (payload as { html?: unknown }).html === 'string'
        ? (payload as { html: string }).html
        : null;
      if (!html || Buffer.byteLength(html, 'utf8') > MAX_BODY_BYTES) {
        json(res, 400, { error: 'invalid_html' });
        return;
      }

      const activeBrowser = await healthyBrowser();
      const page = await activeBrowser.newPage({ javaScriptEnabled: false });
      try {
        await page.route('**/*', async (route) => {
          const target = route.request().url();
          if (target.startsWith('data:') || target.startsWith('about:')) await route.continue();
          else await route.abort();
        });
        await page.setContent(html, { waitUntil: 'networkidle', timeout: 15_000 });
        await page.emulateMedia({ media: 'print' });
        const pdf = await page.pdf({
          format: 'A4',
          margin: { top: '8mm', right: '15mm', bottom: '8mm', left: '15mm' },
          printBackground: true,
          preferCSSPageSize: false,
        });
        res.writeHead(200, {
          'content-type': 'application/pdf',
          'content-length': pdf.byteLength,
          'cache-control': 'no-store',
          'x-resume-renderer-id': rendererId,
          'x-resume-renderer-version': rendererVersion,
        });
        res.end(pdf);
      } finally {
        await page.close().catch(() => undefined);
      }
    } catch (error) {
      if (!res.headersSent) {
        const code = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 500;
        json(res, code, { error: code === 413 ? 'payload_too_large' : 'render_failed' });
      } else {
        res.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return {
    url: `http://${displayHost}:${port}`,
    rendererId,
    rendererVersion,
    server,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await browser.close().catch(() => undefined);
    },
  };
}
