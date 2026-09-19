import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chromium } from 'playwright';

const runtimePath = fileURLToPath(new URL('../../../integrations/boss-copilot/extension/boss-copilot.js', import.meta.url));

describe('BOSS Copilot compatibility runtime', () => {
  it('boots the mature userscript without Tampermonkey and reaches the Job Harness bridge through fetch fallback', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const requests: string[] = [];
      await page.route('https://www.zhipin.com/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html><body><div class="search-form"><input /></div><button class="search-btn">搜索</button><div class="rec-job-list"></div></body></html>',
        });
      });
      await page.route('https://oracle.taile92a8e.ts.net:10444/**', async (route) => {
        const request = route.request();
        requests.push(request.url());
        if (request.method() === 'OPTIONS') {
          await route.fulfill({
            status: 204,
            headers: {
              'access-control-allow-origin': 'https://www.zhipin.com',
              'access-control-allow-headers': 'content-type',
              'access-control-allow-methods': 'GET,POST,OPTIONS',
            },
          });
          return;
        }
        const url = new URL(request.url());
        const payload = url.pathname.endsWith('/client-config')
          ? {
              introduce: 'hello',
              tags: ['前端开发工程师'],
              frontend: {
                serverHost: 'https://oracle.taile92a8e.ts.net:10444/p/ai-agent-app',
                resumeIndex: 0,
                thread: 58,
                timestampTimeout: 3000,
                onlyGreet: false,
                resumeFollowup: true,
                manualFilterWaitMs: 10000,
                roundRestartDelayMs: 2000,
                maxEmptyRounds: 3,
                detailTimeout: 10000,
                greetTimeout: 12000,
                preloadScrollPixels: 180,
                preloadScrollWaitMs: 450,
                preloadStableRoundsLimit: 24,
                preloadMaxRounds: 300,
                preloadActivateCardEvery: 0,
                preloadActivateCardWaitMs: 250,
              },
            }
          : url.pathname.endsWith('/tags')
            ? { tags: ['前端开发工程师'] }
            : url.pathname.endsWith('/get-introduce')
              ? { introduce: 'hello' }
              : { success: true };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': 'https://www.zhipin.com' },
          body: JSON.stringify(payload),
        });
      });

      await page.goto('https://www.zhipin.com/web/geek/job');
      expect(await page.evaluate(() => typeof (globalThis as { GM_xmlhttpRequest?: unknown }).GM_xmlhttpRequest)).toBe('undefined');
      await page.addScriptTag({ content: await readFile(runtimePath, 'utf8') });

      const startButton = page.getByText('开始', { exact: true });
      expect(await startButton.count()).toBe(1);
      await startButton.click();

      await expect.poll(() => requests.some((url) => url.endsWith('/p/ai-agent-app/client-config')), { timeout: 5000 }).toBe(true);
      await expect.poll(async () => page.getByText('获取前端配置成功', { exact: true }).count(), { timeout: 5000 }).toBe(1);
    } finally {
      await browser.close();
    }
  }, 15_000);
});
