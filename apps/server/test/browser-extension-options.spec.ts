import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface PermissionHarness {
  request: (url: string) => Promise<boolean>;
  checked: string[][];
  requested: string[][];
  status: { textContent: string };
}

async function createPermissionHarness(input: { alreadyGranted?: boolean; requestGranted?: boolean } = {}): Promise<PermissionHarness> {
  const source = await readFile(new URL('../../../integrations/browser-extension/options.js', import.meta.url), 'utf8');
  const checked: string[][] = [];
  const requested: string[][] = [];
  const status = { textContent: '' };
  const elements = new Map<string, Record<string, unknown>>([['status', status]]);
  const element = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, { type: 'text', value: '', checked: false, addEventListener: () => {} });
    }
    return elements.get(id)!;
  };
  const context = {
    URL,
    document: { getElementById: element },
    chrome: {
      storage: { local: { get: async (defaults: object) => defaults } },
      permissions: {
        contains: async ({ origins }: { origins: string[] }) => {
          checked.push([...origins]);
          return input.alreadyGranted ?? false;
        },
        request: async ({ origins }: { origins: string[] }) => {
          requested.push([...origins]);
          return input.requestGranted ?? true;
        },
      },
    },
  };
  // Exercise the real MV3 options script, not a reimplementation of its logic.
  const request = runInNewContext(source + '\nrequestSitePermissions', context) as PermissionHarness['request'];
  // options.js calls async load() on startup; let its initial status paint finish
  // before exercising user-triggered permission requests.
  await new Promise<void>((resolve) => setImmediate(resolve));
  return { request, checked, requested, status };
}

describe('Browser Bridge options permission handling', () => {
  it.each(['127.0.0.1', 'localhost'])('removes port and path from local Bridge origin %s', async (host) => {
    const harness = await createPermissionHarness();
    await expect(harness.request('http://' + host + ':20901/internal/browser-bridge/v1')).resolves.toBe(true);
    expect(harness.checked).toEqual([['http://' + host + '/*']]);
    expect(harness.requested).toEqual([['http://' + host + '/*']]);
  });

  it('reuses an already-granted local permission without prompting', async () => {
    const harness = await createPermissionHarness({ alreadyGranted: true });
    await expect(harness.request('http://127.0.0.1:20901/internal/browser-bridge/v1')).resolves.toBe(true);
    expect(harness.requested).toEqual([]);
  });

  it('retains explicit optional HTTPS permission request for the generic browser extension', async () => {
    const harness = await createPermissionHarness();
    await expect(harness.request('https://oracle.example.test:20901/internal/browser-bridge/v1')).resolves.toBe(true);
    expect(harness.checked).toEqual([['https://*/*']]);
    expect(harness.requested).toEqual([['https://*/*']]);
  });

  it('rejects nonlocal HTTP Bridge URLs instead of asking for unrelated HTTPS permissions', async () => {
    const harness = await createPermissionHarness();
    await expect(harness.request('http://example.test/internal/browser-bridge/v1')).resolves.toBe(false);
    expect(harness.checked).toEqual([]);
    expect(harness.requested).toEqual([]);
    expect(harness.status.textContent).toContain('HTTPS');
  });

  it('preserves a declined local permission request', async () => {
    const harness = await createPermissionHarness({ requestGranted: false });
    await expect(harness.request('http://127.0.0.1:20901/internal/browser-bridge/v1')).resolves.toBe(false);
    expect(harness.requested).toEqual([['http://127.0.0.1/*']]);
  });

  it('fails closed for malformed Bridge URLs without granting permissions', async () => {
    const harness = await createPermissionHarness();
    await expect(harness.request('not-a-url')).resolves.toBe(false);
    expect(harness.checked).toEqual([]);
    expect(harness.requested).toEqual([]);
    expect(harness.status.textContent).toBe('Bridge URL 无效。');
  });
});
