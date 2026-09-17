import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

type BackgroundHarness = {
  executePageDriver(tabId: number, command: unknown): Promise<unknown>;
};

async function loadBackground(sendMessage: (...args: unknown[]) => Promise<unknown>) {
  const source = await readFile(new URL('../../../integrations/browser-extension/background.js', import.meta.url), 'utf8');
  let sendCount = 0;
  let injectionCount = 0;
  const noopListener = { addListener: () => undefined };
  const chrome = {
    runtime: {
      onInstalled: noopListener,
      onStartup: noopListener,
      onMessage: noopListener,
      getManifest: () => ({ version: 'test' }),
    },
    alarms: { onAlarm: noopListener, create: async () => undefined },
    storage: {
      onChanged: noopListener,
      local: { get: async (defaults: unknown) => defaults },
    },
    tabs: {
      get: async () => ({ id: 7, url: 'https://example.test/apply', status: 'complete' }),
      sendMessage: async (...args: unknown[]) => { sendCount += 1; return sendMessage(...args); },
      query: async () => [],
      update: async () => ({}),
      create: async () => ({ id: 7, url: 'https://example.test/apply', status: 'complete' }),
      onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      captureVisibleTab: async () => 'data:image/png;base64,',
    },
    scripting: { executeScript: async () => { injectionCount += 1; } },
  };
  const context = vm.createContext({
    chrome,
    console,
    URL,
    AbortController,
    Date,
    Error,
    Number,
    Object,
    Set,
    String,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  }) as vm.Context & BackgroundHarness;
  vm.runInContext(source, context, { filename: 'background.js' });
  await Promise.resolve();
  return { context, counts: () => ({ sendCount, injectionCount }) };
}

describe('MV3 browser command delivery boundary', () => {
  it('does not replay a page action when the page driver accepted the command and returned an application error', async () => {
    const { context, counts } = await loadBackground(async () => ({ __jobHarnessDriverError: 'write failed after acceptance' }));
    await expect(context.executePageDriver(7, { type: 'fill', payload: { selector: '#name', value: 'A' } })).rejects.toThrow(/write failed after acceptance/);
    expect(counts()).toEqual({ sendCount: 1, injectionCount: 1 });
  });

  it('retries delivery once when sendMessage itself cannot reach the replaced content-script world', async () => {
    let delivery = 0;
    const { context, counts } = await loadBackground(async () => {
      delivery += 1;
      if (delivery === 1) throw new Error('receiving end does not exist');
      return null;
    });
    await expect(context.executePageDriver(7, { type: 'scan_controls', payload: {} })).resolves.toBeNull();
    expect(counts()).toEqual({ sendCount: 2, injectionCount: 2 });
  });
});
