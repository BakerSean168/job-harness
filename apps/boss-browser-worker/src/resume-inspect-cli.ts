import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BossOutreachExtensionClient } from './outreach-extension';

const apiUrl = httpUrl(process.env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:20901', 'JOB_HARNESS_API_URL');
const authToken = process.env.JOB_HARNESS_AUTH_TOKEN?.trim() || '';
const agentId = process.env.JOB_HARNESS_BROWSER_EXTENSION_AGENT_ID?.trim() || 'windows-chrome-primary';
const targetUrl = process.env.JOB_HARNESS_BOSS_RESUME_MANAGEMENT_URL?.trim() || 'https://www.zhipin.com/web/geek/recommend';
const screenshotPath = process.env.JOB_HARNESS_BOSS_RESUME_SCREENSHOT_PATH?.trim() || null;

const client = new BossOutreachExtensionClient({
  apiUrl,
  authToken,
  agentId,
  commandTimeoutMs: 30_000,
});

const result = await client.inspectResumeManagement(targetUrl, { screenshot: Boolean(screenshotPath) });
const { screenshotBase64, ...summary } = result;
if (screenshotPath && screenshotBase64) {
  await mkdir(dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, Buffer.from(screenshotBase64, 'base64'), { mode: 0o600 });
}
console.log(JSON.stringify({ ...summary, screenshotPath: screenshotPath && screenshotBase64 ? screenshotPath : null }, null, 2));

function httpUrl(raw: string, name: string): string {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(name + ' must be http(s)');
  return url.toString().replace(/\/$/, '');
}
