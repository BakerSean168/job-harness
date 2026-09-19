import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

type BackgroundHarness = {
  executePageDriver(tabId: number, command: unknown): Promise<unknown>;
  executeEnvelope(config: Record<string, unknown>, envelope: Record<string, unknown>): Promise<void>;
  acquireSession(payload: Record<string, unknown>): Promise<unknown>;
  register(config: Record<string, unknown>): Promise<void>;
};

async function loadBackground(
  sendMessage: (...args: unknown[]) => Promise<unknown>,
  fetchImpl: typeof globalThis.fetch = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  queryTabs: (query: Record<string, unknown>) => Promise<Array<{ id?: number; url?: string; status?: string }>> = async () => [],
) {
  const source = await readFile(new URL('../../../integrations/browser-extension/background.js', import.meta.url), 'utf8');
  let sendCount = 0;
  let injectionCount = 0;
  let createCount = 0;
  const storageWrites: Array<Record<string, unknown>> = [];
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
      local: { get: async (defaults: unknown) => defaults, set: async (value: Record<string, unknown>) => { storageWrites.push(value); } },
    },
    tabs: {
      get: async () => ({ id: 7, url: 'https://example.test/apply', status: 'complete' }),
      sendMessage: async (...args: unknown[]) => { sendCount += 1; return sendMessage(...args); },
      query: async (query: Record<string, unknown>) => queryTabs(query),
      update: async () => ({}),
      create: async () => { createCount += 1; return { id: 7, url: 'https://example.test/apply', status: 'complete' }; },
      onUpdated: { addListener: () => undefined, removeListener: () => undefined },
      captureVisibleTab: async () => 'data:image/png;base64,',
    },
    scripting: { executeScript: async () => { injectionCount += 1; } },
  };
  const context = vm.createContext({
    chrome,
    console,
    URL,
    navigator: { platform: 'Win32' },
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
    fetch: fetchImpl,
  }) as vm.Context & BackgroundHarness;
  vm.runInContext(source, context, { filename: 'background.js' });
  await Promise.resolve();
  return { context, counts: () => ({ sendCount, injectionCount, createCount, storageWrites }) };
}

describe('MV3 browser command delivery boundary', () => {
  it('does not replay a page action when the page driver accepted the command and returned an application error', async () => {
    const { context, counts } = await loadBackground(async () => ({ __jobHarnessDriverError: 'write failed after acceptance' }));
    await expect(context.executePageDriver(7, { type: 'fill', payload: { selector: '#name', value: 'A' } })).rejects.toThrow(/write failed after acceptance/);
    expect(counts()).toMatchObject({ sendCount: 1, injectionCount: 1 });
  });

  it('retries delivery once when sendMessage itself cannot reach the replaced content-script world', async () => {
    let delivery = 0;
    const { context, counts } = await loadBackground(async () => {
      delivery += 1;
      if (delivery === 1) throw new Error('receiving end does not exist');
      return null;
    });
    await expect(context.executePageDriver(7, { type: 'scan_controls', payload: {} })).resolves.toBeNull();
    expect(counts()).toMatchObject({ sendCount: 2, injectionCount: 2 });
  });

  it('selects the exact staged job path among multiple tabs on the same recruiting host and ignores tracking queries', async () => {
    const target = 'https://www.liepin.com/job/1985379181.shtml';
    const tabs = [
      { id: 11, url: 'https://www.liepin.com/job/111111.shtml?from=search', status: 'complete' },
      { id: 22, url: `${target}?from=search&track=abc`, status: 'complete' },
    ];
    const { context, counts } = await loadBackground(async () => null, undefined, async () => tabs);
    await expect(context.acquireSession({ preferredUrl: `${target}?source=canonical`, reuseLiveSession: true, requireLiveSession: true }))
      .resolves.toEqual({ sessionRef: 'chrome-tab:22', currentUrl: `${target}?from=search&track=abc` });
    expect(counts().createCount).toBe(0);
  });

  it('does not fall back to a different same-host or active tab for an exact staged handoff', async () => {
    const tabs = [{ id: 11, url: 'https://www.liepin.com/job/111111.shtml', status: 'complete' }];
    const { context, counts } = await loadBackground(async () => null, undefined, async () => tabs);
    await expect(context.acquireSession({ preferredUrl: 'https://www.liepin.com/job/1985379181.shtml', reuseLiveSession: true, requireLiveSession: true }))
      .rejects.toThrow(/exact requested target/);
    expect(counts().createCount).toBe(0);
  });

  it('never creates a tab when a staged characterization requires a reusable live session', async () => {
    const { context, counts } = await loadBackground(async () => null);
    await expect(context.acquireSession({ preferredUrl: 'https://www.zhaopin.com/jobdetail/CC1.htm', reuseLiveSession: true, requireLiveSession: true }))
      .rejects.toThrow(/No reusable live Chrome tab/);
    expect(counts().createCount).toBe(0);
  });

  it('learns the authenticated Job Harness Web URL from registration without requesting Career/Resume API authority', async () => {
    const { context, counts } = await loadBackground(
      async () => null,
      async (url) => {
        expect(String(url)).toContain('/agents/register');
        return new Response(JSON.stringify({ agentId: 'windows-chrome-primary', webUrl: 'https://job-harness.example.test/' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );
    await context.register({
      bridgeUrl: 'https://bridge.example.test',
      agentId: 'windows-chrome-primary',
      agentName: 'Windows Chrome',
      agentToken: 'agent-token',
      resumeUpload: true,
      screenshots: false,
      webUrl: '',
    });
    expect(counts().storageWrites).toEqual([{ webUrl: 'https://job-harness.example.test' }]);
  });

  it('retries only idempotent result acknowledgement when the first result response is lost', async () => {
    let resultPosts = 0;
    const { context, counts } = await loadBackground(
      async () => [],
      async () => {
        resultPosts += 1;
        if (resultPosts === 1) throw new Error('response lost after server accepted result');
        return new Response(null, { status: 204 });
      },
    );
    await expect(context.executeEnvelope(
      { bridgeUrl: 'https://bridge.example.test', agentId: 'windows-chrome-primary', agentToken: 'agent-token', resumeUpload: false, screenshots: false },
      {
        commandId: 'command-1', agentId: 'windows-chrome-primary', sessionRef: 'chrome-tab:7',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        command: { type: 'scan_controls', payload: {} },
      },
    )).resolves.toBeUndefined();
    expect(counts().sendCount).toBe(1);
    expect(resultPosts).toBe(2);
  });

});
