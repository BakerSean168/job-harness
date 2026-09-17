import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_EXTENSION_DRIVER_COMMANDS } from '../../../packages/apply-contracts/src/index.ts';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../../server/src';

vi.mock('server-only', () => ({}));

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
const originalApiUrl = process.env.JOB_HARNESS_API_URL;
const originalToken = process.env.JOB_HARNESS_AUTH_TOKEN;
const originalPublicUrl = process.env.JOB_HARNESS_BROWSER_EXTENSION_PUBLIC_URL;

afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
  if (originalApiUrl === undefined) delete process.env.JOB_HARNESS_API_URL; else process.env.JOB_HARNESS_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.JOB_HARNESS_AUTH_TOKEN; else process.env.JOB_HARNESS_AUTH_TOKEN = originalToken;
  if (originalPublicUrl === undefined) delete process.env.JOB_HARNESS_BROWSER_EXTENSION_PUBLIC_URL; else process.env.JOB_HARNESS_BROWSER_EXTENSION_PUBLIC_URL = originalPublicUrl;
  vi.resetModules();
});

describe('Web browser-extension pairing action', () => {
  it('creates a short-lived one-time code server-side without exposing the signing key or Agent Token', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-web-extension-pairing-'));
    running = await startJobHarnessServer({
      databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0,
      authToken: 'pairing-global-secret', executorAuthToken: 'pairing-worker-secret',
      browserExtensionSigningKey: 'fixture-browser-extension-signing-key-0123456789', submissionReconcileIntervalMs: null,
    });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'pairing-global-secret';
    process.env.JOB_HARNESS_BROWSER_EXTENSION_PUBLIC_URL = 'https://oracle.example.ts.net:20901/internal/browser-bridge/v1';

    const { createBrowserExtensionPairingAction } = await import('../src/app/settings/actions');
    const { getBrowserExtensionAgents, getBrowserExtensionPublicBridgeUrl } = await import('../src/lib/job-harness-client');
    const state = await createBrowserExtensionPairingAction();
    expect(state).toMatchObject({ ok: true, code: expect.stringMatching(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/), expiresAt: expect.any(String), error: null });
    expect(JSON.stringify(state)).not.toContain('signing-key');
    expect(JSON.stringify(state)).not.toContain('jhbe1.');
    expect(getBrowserExtensionPublicBridgeUrl()).toBe('https://oracle.example.ts.net:20901/internal/browser-bridge/v1');

    const bridgeUrl = `${running.url}/internal/browser-bridge/v1`;
    const paired = await fetch(`${bridgeUrl}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      pairingCode: state.code,
      agentId: 'windows-chrome-web-test', name: 'Windows Chrome', version: '0.1.0', browserName: 'Chrome', platform: 'Windows',
      capabilities: { humanControl: true, persistentSession: true, resumeUpload: false, screenshots: false, driverCommands: BROWSER_EXTENSION_DRIVER_COMMANDS.filter((type) => type !== 'upload' && type !== 'screenshot') },
    }) });
    expect(paired.status).toBe(201);
    const body = await paired.json() as { agentToken: string };
    expect(body.agentToken).toMatch(/^jhbe1\./);
    await expect(getBrowserExtensionAgents()).resolves.toEqual([
      expect.objectContaining({ agentId: 'windows-chrome-web-test', name: 'Windows Chrome', online: true, resumeUpload: false, screenshots: false }),
    ]);

    const reuse = await fetch(`${bridgeUrl}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      pairingCode: state.code,
      agentId: 'windows-chrome-web-test', name: 'Windows Chrome', version: '0.1.0', browserName: 'Chrome', platform: 'Windows',
      capabilities: { humanControl: true, persistentSession: true, resumeUpload: false, screenshots: false, driverCommands: ['current_url'] },
    }) });
    expect(reuse.status).toBe(401);
  });
});
