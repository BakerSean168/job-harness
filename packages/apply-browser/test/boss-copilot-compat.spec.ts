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
                preloadStableRoundsLimit: 8,
                preloadMaxRounds: 30,
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

  it('acknowledges a chat greeting after the sent-message telemetry call completes', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const actions: string[] = [];
      await page.route('https://www.zhipin.com/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html><body><div id="chat-input" contenteditable="true"></div><button class="btn-send">发送</button></body></html>',
        });
      });
      await page.route('https://oracle.taile92a8e.ts.net:10444/**', async (route) => {
        const request = route.request();
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
        if (new URL(request.url()).pathname.endsWith('/log-action')) {
          const raw = request.postData();
          if (raw) {
            const parsed = JSON.parse(raw) as { action?: unknown };
            if (typeof parsed.action === 'string') actions.push(parsed.action);
          }
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': 'https://www.zhipin.com' },
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('https://www.zhipin.com/web/geek/chat');
      await page.evaluate(() => {
        localStorage.setItem('__zhipin_chat_greet', String(Date.now()));
        window.name = '__zhipin_chat_greet';
        const channel = new BroadcastChannel('__zhipin_broadcast');
        const state = globalThis as typeof globalThis & {
          __bossTestChannel?: BroadcastChannel;
          __bossTestAcks?: Array<{ success?: boolean }>;
        };
        state.__bossTestChannel = channel;
        state.__bossTestAcks = [];
        channel.addEventListener('message', (event) => {
          const message = event.data as {
            from?: string;
            to?: string;
            type?: string;
            data?: { requestId?: string; responseType?: string; success?: boolean };
          };
          if (message.to !== '__zhipin_search') return;
          if (message.type === 'heart-beat' && message.data?.requestId) {
            channel.postMessage({
              from: '__zhipin_search',
              to: '__zhipin_chat_greet',
              type: message.data.responseType ?? 'heart-beat_response',
              data: { success: true, requestId: message.data.requestId },
            });
            return;
          }
          if (message.type !== 'say-hi') return;
          if (message.data?.requestId) {
            channel.postMessage({
              from: '__zhipin_search',
              to: '__zhipin_chat_greet',
              type: message.data.responseType ?? 'say-hi_response',
              data: { introduce: 'hello from Job Harness', resumeIndex: 1, requestId: message.data.requestId },
            });
            return;
          }
          state.__bossTestAcks?.push({ success: message.data?.success });
        });
        document.querySelector('.btn-send')?.addEventListener('click', () => {
          document.body.dataset.greetingClicked = 'true';
        });
      });
      await page.addScriptTag({ content: await readFile(runtimePath, 'utf8') });

      await expect.poll(() => actions.includes('greet_message_sent'), { timeout: 5000 }).toBe(true);
      await expect.poll(
        () => page.evaluate(() => {
          const state = globalThis as typeof globalThis & { __bossTestAcks?: Array<{ success?: boolean }> };
          return state.__bossTestAcks?.some((item) => item.success === true) ?? false;
        }),
        { timeout: 5000 },
      ).toBe(true);
      expect(await page.locator('body').getAttribute('data-greeting-clicked')).toBe('true');
    } finally {
      await browser.close();
    }
  }, 15_000);
});
