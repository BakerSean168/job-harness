import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SteelBrowserBackend } from '@job-harness/apply-browser';

const root = await mkdtemp(join(tmpdir(), 'jh-apply-steel-smoke-'));
const backend = new SteelBrowserBackend({
  baseUrl: process.env.JOB_HARNESS_STEEL_BASE_URL ?? 'http://127.0.0.1:3000',
  viewerBaseUrl: process.env.JOB_HARNESS_STEEL_VIEWER_BASE_URL ?? null,
  apiKey: process.env.STEEL_API_KEY ?? null,
  contextPath: join(root, 'steel-context.json'),
  timezone: process.env.JOB_HARNESS_APPLY_BROWSER_TIMEZONE ?? 'Asia/Shanghai',
  headless: true,
});
let session = null;
try {
  const health = await backend.health();
  if (!health.ok) throw new Error(`Steel backend unhealthy: ${health.detail ?? 'unknown'}`);
  session = await backend.acquire({ reuseLiveSession: false, preferredUrl: 'https://example.com/' });
  const driver = session.driver();
  await driver.navigate('https://example.com/');
  const title = await driver.title();
  if (!/Example Domain/i.test(title)) throw new Error(`Unexpected smoke title: ${title}`);
  await session.persist();
  console.log(JSON.stringify({
    ok: true,
    backend: backend.id,
    sessionId: session.sessionId,
    observedHost: new URL(driver.currentUrl()).hostname,
    title,
    humanControlAvailable: Boolean(session.humanControlUrl),
  }, null, 2));
} finally {
  if (session) await session.release().catch(() => {});
  await rm(root, { recursive: true, force: true });
}
