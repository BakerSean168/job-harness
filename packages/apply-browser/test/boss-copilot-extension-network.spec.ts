import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('BOSS Copilot compatibility extension network shim', () => {
  it('proxies only the Job Harness BOSS bridge through the extension service worker', async () => {
    const source = await readFile(new URL('../../../integrations/boss-copilot/extension/background.js', import.meta.url), 'utf8');
    let listener: ((message: unknown, sender: unknown, sendResponse: (value: unknown) => void) => boolean) | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const context = vm.createContext({
      chrome: { runtime: { onMessage: { addListener(value: typeof listener) { listener = value; } } } },
      fetch: fetchMock,
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      Response,
      Object,
      String,
      Number,
      Error,
      console,
    });
    vm.runInContext(source, context, { filename: 'boss-copilot-background.js' });
    expect(listener).not.toBeNull();

    const allowed = await new Promise<Record<string, unknown>>((resolve) => {
      const keepAlive = listener!(
        {
          type: 'JH_BOSS_COMPAT_HTTP',
          details: {
            method: 'POST',
            url: 'https://oracle.taile92a8e.ts.net:10444/p/ai-agent-app/get-job-score',
            headers: { 'content-type': 'application/json' },
            data: '{"job":"x"}',
            timeout: 5000,
          },
        },
        null,
        (value) => resolve(value as Record<string, unknown>),
      );
      expect(keepAlive).toBe(true);
    });
    expect(allowed).toMatchObject({ ok: true, result: { status: 200, response: '{"ok":true}' } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://oracle.taile92a8e.ts.net:10444/p/ai-agent-app/get-job-score',
      expect.objectContaining({ method: 'POST', credentials: 'omit', cache: 'no-store' }),
    );

    const denied = await new Promise<Record<string, unknown>>((resolve) => {
      listener!(
        {
          type: 'JH_BOSS_COMPAT_HTTP',
          details: { method: 'GET', url: 'https://example.com/steal' },
        },
        null,
        (value) => resolve(value as Record<string, unknown>),
      );
    });
    expect(denied).toMatchObject({ ok: false });
    expect(String(denied.error)).toContain('only allows the Job Harness BOSS bridge');
  });

  it('presents the legacy GM request contract to the copied Copilot script', async () => {
    const source = await readFile(new URL('../../../integrations/boss-copilot/extension/gm-request-shim.js', import.meta.url), 'utf8');
    const context = vm.createContext({
      chrome: {
        runtime: {
          lastError: null,
          sendMessage(_message: unknown, callback: (value: unknown) => void) {
            callback({ ok: true, result: { status: 200, response: '{"tags":["前端开发工程师"]}' } });
          },
        },
      },
      globalThis: {},
      Object,
      Promise,
      Error,
    });
    vm.runInContext(source, context, { filename: 'gm-request-shim.js' });
    const global = context.globalThis as {
      GM?: { xmlHttpRequest(details: unknown): Promise<unknown> };
      GM_xmlhttpRequest?: (details: Record<string, unknown>) => void;
    };
    expect(global.GM).toBeTruthy();
    await expect(global.GM!.xmlHttpRequest({ url: 'https://oracle.taile92a8e.ts.net:10444/p/ai-agent-app/tags' }))
      .resolves.toMatchObject({ status: 200 });
  });
});
