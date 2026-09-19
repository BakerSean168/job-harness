import { afterEach, describe, expect, it, vi } from 'vitest';
import { BossExtensionValidationBackend } from '../src/extension-backend';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BossExtensionValidationBackend', () => {
  it('uses the bounded boss-discovery validation API and falls back from unrelated live tab to a fresh BOSS tab', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    let acquireCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: href, body });
      if (href.endsWith('/agents/windows-chrome-primary/status')) {
        return json({ online: true, version: '0.2.2' });
      }
      if (href.endsWith('/validation-runs')) {
        return json({ id: 'run-boss-1', targetUrl: 'https://www.zhipin.com/web/geek/job', sessionRef: null }, 201);
      }
      if (href.endsWith('/validation-runs/run-boss-1/invoke')) {
        if (body.command.type === 'session_acquire') {
          acquireCount += 1;
          if (acquireCount === 1) return json({ error: { code: 'VALIDATION_TARGET_MISMATCH', message: 'unrelated active tab' } }, 409);
          return json({
            run: { id: 'run-boss-1', targetUrl: 'https://www.zhipin.com/web/geek/job', sessionRef: 'chrome-tab:boss' },
            result: { sessionRef: 'chrome-tab:boss', currentUrl: 'https://www.zhipin.com/web/geek/job' },
          });
        }
        if (body.command.type === 'current_url') {
          return json({ run: {}, result: 'https://www.zhipin.com/web/geek/job' });
        }
        if (body.command.type === 'exists') return json({ run: {}, result: true });
        if (body.command.type === 'fill' || body.command.type === 'click' || body.command.type === 'scroll') return json({ run: {}, result: null });
        if (body.command.type === 'scan_actions') return json({ run: {}, result: [] });
        throw new Error('Unexpected command ' + body.command.type);
      }
      throw new Error('Unexpected URL ' + href);
    }));

    const backend = new BossExtensionValidationBackend({
      apiUrl: 'http://127.0.0.1:20901',
      authToken: 'secret-token',
      agentId: 'windows-chrome-primary',
    });
    await expect(backend.health()).resolves.toMatchObject({ ok: true, detail: 'Browser Bridge 0.2.2' });
    const session = await backend.acquire({ preferredUrl: 'https://www.zhipin.com/web/geek/job', reuseLiveSession: true });
    expect(session.backendId).toBe('boss-extension:windows-chrome-primary');
    expect(session.sessionId).toBe('chrome-tab:boss');

    const driver = session.driver();
    expect(await driver.exists('.search-form input')).toBe(true);
    await driver.fill('.search-form input', '前端开发工程师');
    await driver.click('.search-btn', { expectedText: '搜索' });
    await driver.scroll(650);
    expect(await driver.scanActions()).toEqual([]);

    const acquisitions = calls
      .filter((call) => call.body?.command?.type === 'session_acquire')
      .map((call) => call.body.command.payload);
    expect(acquisitions).toEqual([
      expect.objectContaining({ reuseLiveSession: true, requireLiveSession: false }),
      expect.objectContaining({ reuseLiveSession: false, requireLiveSession: false }),
    ]);
    expect(calls.find((call) => call.url.endsWith('/validation-runs'))?.body)
      .toMatchObject({ mode: 'boss-discovery', agentId: 'windows-chrome-primary' });
  });
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
