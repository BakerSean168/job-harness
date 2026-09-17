import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExtensionBrowserBackend } from '@job-harness/apply-browser';
import { BROWSER_EXTENSION_DRIVER_COMMANDS } from '@job-harness/apply-contracts';
import { BrowserExtensionBridge } from '../src/browser-extension-bridge';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
});

describe('in-memory browser-extension bridge', () => {
  it('delivers one typed command to a registered agent and resolves only after the matching result', async () => {
    const bridge = new BrowserExtensionBridge();
    bridge.register({
      agentId: 'windows-chrome', name: 'Windows Chrome', version: '1', browserName: 'Chrome', platform: 'Windows',
      capabilities: { humanControl: true, persistentSession: true, resumeUpload: false, screenshots: false, driverCommands: ['current_url'] },
    });
    const invocation = bridge.invoke({ agentId: 'windows-chrome', sessionRef: 'tab:7', command: { type: 'current_url', payload: {} }, timeoutMs: 5_000 });
    const command = await bridge.poll('windows-chrome', 0);
    expect(command).toMatchObject({ agentId: 'windows-chrome', sessionRef: 'tab:7', command: { type: 'current_url' } });
    bridge.complete('windows-chrome', { commandId: command!.commandId, ok: true, result: 'https://jobs.example.test/apply' });
    await expect(invocation).resolves.toMatchObject({ result: 'https://jobs.example.test/apply' });
    expect(bridge.status('windows-chrome')).toMatchObject({ online: true, queuedCommands: 0, inFlightCommands: 0 });
    bridge.close();
  });
});

describe('browser-extension transport auth and BrowserBackendPort', () => {
  it('keeps extension/worker bearers separate and refuses browser commands without a live ExecutionAttempt lease', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-browser-extension-'));
    running = await startJobHarnessServer({
      databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0,
      authToken: 'global-secret', executorAuthToken: 'worker-secret', browserExtensionSigningKey: 'fixture-browser-extension-signing-key-0123456789',
      submissionReconcileIntervalMs: null,
    });
    const bridgeUrl = `${running.url}/internal/browser-bridge/v1`;
    const agentId = 'windows-chrome-primary';
    const pairing = await fetch(`${bridgeUrl}/pairings`, { method: 'POST', headers: { authorization: 'Bearer global-secret' } });
    expect(pairing.status).toBe(201);
    const pairingBody = await pairing.json() as { code: string };
    const paired = await fetch(`${bridgeUrl}/pair`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        pairingCode: pairingBody.code,
        agentId, name: 'Windows Chrome', version: '0.1.0', browserName: 'Chrome', platform: 'Windows',
        capabilities: {
          humanControl: true, persistentSession: true, resumeUpload: false, screenshots: false,
          driverCommands: BROWSER_EXTENSION_DRIVER_COMMANDS.filter((command) => command !== 'upload' && command !== 'screenshot'),
        },
      }),
    });
    expect(paired.status).toBe(201);
    const pairedBody = await paired.json() as { agentToken: string };
    const agentHeaders = { authorization: `Bearer ${pairedBody.agentToken}`, 'content-type': 'application/json' };
    const workerHeaders = { authorization: 'Bearer worker-secret', 'content-type': 'application/json' };

    const forbiddenWorkerRegister = await fetch(`${bridgeUrl}/agents/register`, { method: 'POST', headers: workerHeaders, body: '{}' });
    expect(forbiddenWorkerRegister.status).toBe(401);
    const forbiddenAgentStatus = await fetch(`${bridgeUrl}/agents/${agentId}/status`, { headers: { authorization: `Bearer ${pairedBody.agentToken}` } });
    expect(forbiddenAgentStatus.status).toBe(401);

    const backend = new ExtensionBrowserBackend({ bridgeUrl, executorAuthToken: 'worker-secret', agentId, backendId: 'extension-user-chrome', commandTimeoutMs: 5_000 });
    await expect(backend.health()).resolves.toEqual({ ok: true, detail: null });
    await expect(backend.acquire({ preferredUrl: 'https://jobs.example.test/start' })).rejects.toThrow(/requires a current ExecutionAttempt lease scope/);

    const forged = await fetch(`${bridgeUrl}/invoke`, {
      method: 'POST', headers: workerHeaders, body: JSON.stringify({
        agentId, sessionRef: null,
        command: { type: 'session_acquire', payload: { preferredUrl: 'https://jobs.example.test/start', reuseLiveSession: false } },
        timeoutMs: 5_000,
        scope: { attemptId: 'missing-attempt', executorId: 'worker', leaseToken: `lease-${'x'.repeat(48)}` },
      }),
    });
    expect(forged.status).toBe(409);
    await expect(forged.json()).resolves.toMatchObject({ error: { code: 'LEASE_LOST' } });
  });
});
