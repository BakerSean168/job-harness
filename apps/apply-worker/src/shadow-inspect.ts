import { SteelBrowserBackend } from '@job-harness/apply-browser';
import { GenericAtsSiteAdapter } from '@job-harness/apply-adapters';

async function main(): Promise<void> {
  const target = process.env.JOB_HARNESS_SHADOW_URL?.trim();
  if (!target) throw new Error('JOB_HARNESS_SHADOW_URL is required');
  const parsed = new URL(target);
  if (parsed.protocol !== 'https:') throw new Error('Shadow inspection accepts HTTPS targets only');
  if (isLocalHost(parsed.hostname)) throw new Error(`Refusing local/private shadow target host '${parsed.hostname}'`);

  const backend = new SteelBrowserBackend({
    baseUrl: process.env.JOB_HARNESS_STEEL_BASE_URL ?? 'http://127.0.0.1:3000',
    headless: true,
    contextPath: null,
    viewerBaseUrl: null,
  });
  const health = await backend.health();
  if (!health.ok) throw new Error(`Steel is unavailable: ${health.detail ?? 'unknown'}`);
  const session = await backend.acquire({ reuseLiveSession: false });
  try {
    const browser = session.driver();
    await browser.navigate(target);
    const title = await browser.title();
    const body = await browser.bodyText(80_000);
    const phrases = ['立即申请','申请职位','立即投递','投递简历','投递','申请'];
    const actionHints = phrases.filter((phrase) => body.includes(phrase));
    const actionSelectors: Array<{ selector: string; text: string | null }> = [];
    for (const selector of ['button:has-text("立即申请")','button:has-text("申请职位")','button:has-text("立即投递")','button:has-text("投递简历")','a:has-text("立即申请")','.apply-btn','[class*="apply"] button']) {
      if (await browser.exists(selector).catch(() => false)) actionSelectors.push({ selector, text: await browser.text(selector).catch(() => null) });
    }
    const adapter = new GenericAtsSiteAdapter();
    const form = await adapter.inspect(browser, { url: browser.currentUrl(), title, observedAt: new Date().toISOString() });
    console.log(JSON.stringify({
      ok: true,
      mode: 'read-only-shadow-inspect',
      targetHost: parsed.hostname,
      observedUrl: browser.currentUrl(),
      title,
      actionHints,
      actionSelectors,
      fieldCount: form.fields.length,
      fields: form.fields.map((field) => ({
        type: field.type,
        label: field.label.slice(0, 200),
        required: field.required,
        sectionId: field.sectionId,
        sensitivityHint: field.sensitivityHint,
        optionCount: field.options.length,
      })),
    }, null, 2));
  } finally {
    await session.release();
  }
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match172 = /^172\.(\d+)\./.exec(host);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
  return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
}

void main();
