import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SteelProvider } from './browser/steel-provider.mjs';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jac-steel-context-'));
const contextPath = path.join(tempRoot, 'steel-context.json');
const marker = `jac-${Date.now().toString(36)}`;

let first;
let second;
try {
  first = new SteelProvider({ contextPath, reuseLiveSession: true });
  const firstMeta = await first.start();
  const page = await first.getPage();
  const context = await first.getContext();
  await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await context.addCookies([{ name: 'jac_smoke', value: marker, domain: 'example.com', path: '/' }]);
  await page.evaluate((value) => {
    localStorage.setItem('jac_smoke', value);
    sessionStorage.setItem('jac_smoke_session', value);
  }, marker);

  const saved = await first.saveState();
  assert.ok(saved?.sessionContext, 'Steel should return a sessionContext snapshot');
  assert.ok(fs.existsSync(contextPath), 'Steel context snapshot should be written to disk');
  await first.stop({ persist: true, release: true });
  first = null;

  second = new SteelProvider({ contextPath, reuseLiveSession: false });
  const secondMeta = await second.start();
  const restoredPage = await second.getPage();
  await restoredPage.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const values = await restoredPage.evaluate(() => ({
    localStorage: localStorage.getItem('jac_smoke'),
    sessionStorage: sessionStorage.getItem('jac_smoke_session'),
    cookie: document.cookie,
  }));

  assert.equal(values.localStorage, marker, 'localStorage must survive across Steel sessions');
  assert.equal(values.sessionStorage, marker, 'sessionStorage must survive across Steel sessions');
  assert.match(values.cookie, new RegExp(`(?:^|;\\s*)jac_smoke=${marker}(?:;|$)`), 'cookie must survive across Steel sessions');

  console.log(JSON.stringify({
    ok: true,
    marker,
    firstSessionId: firstMeta.sessionId,
    secondSessionId: secondMeta.sessionId,
    restored: values,
  }, null, 2));
} finally {
  if (first) await first.stop({ persist: false, release: true }).catch(() => {});
  if (second) await second.stop({ persist: false, release: true }).catch(() => {});
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
