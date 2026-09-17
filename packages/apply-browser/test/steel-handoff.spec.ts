import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SteelBrowserBackend } from '../src';

let server: Server | null = null;
let dir: string | null = null;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  if (dir) await rm(dir, { recursive: true, force: true });
  server = null; dir = null;
});

async function startFakeSteel(onRelease: (id: string) => void): Promise<string> {
  server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/health') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'POST' && /^\/v1\/sessions\/[^/]+\/release$/.test(req.url ?? '')) {
      onRelease(decodeURIComponent((req.url ?? '').split('/')[3]!));
      req.resume();
      res.setHeader('content-type', 'application/json');
      res.end('{}');
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/sessions') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ sessions: [] }));
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake Steel did not bind');
  return `http://127.0.0.1:${address.port}`;
}

describe('Steel retained-session cleanup', () => {
  it('releases expired retained sessions from a private local registry even after a worker restart', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-steel-handoff-'));
    const registryPath = join(dir, 'handoffs.json');
    await writeFile(registryPath, JSON.stringify({
      format: 'JobHarnessSteelHandoffs', version: 1,
      records: [
        { sessionRef: 'expired-session', expiresAt: '2026-09-17T12:00:00.000Z' },
        { sessionRef: 'live-session', expiresAt: '2026-09-17T14:00:00.000Z' },
      ],
    }), { mode: 0o600 });
    const released: string[] = [];
    const baseUrl = await startFakeSteel((id) => released.push(id));
    const backend = new SteelBrowserBackend({ baseUrl, handoffRegistryPath: registryPath });
    expect(await backend.reapExpired('2026-09-17T13:00:00.000Z')).toBe(1);
    expect(released).toEqual(['expired-session']);
    const stored = JSON.parse(await readFile(registryPath, 'utf8')) as { records: Array<{ sessionRef: string }> };
    expect(stored.records.map((record) => record.sessionRef)).toEqual(['live-session']);
  });

  it('fails closed and releases the remote session when a durable handoff is already expired', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-steel-expired-resume-'));
    const registryPath = join(dir, 'handoffs.json');
    const released: string[] = [];
    const baseUrl = await startFakeSteel((id) => released.push(id));
    const backend = new SteelBrowserBackend({ baseUrl, handoffRegistryPath: registryPath });
    await expect(backend.resume({
      backendId: 'steel', sessionRef: 'expired-resume', humanControlUrl: null,
      retainedAt: '2020-01-01T00:00:00.000Z', expiresAt: '2020-01-01T00:01:00.000Z',
    })).rejects.toThrow(/expired/);
    expect(released).toEqual(['expired-resume']);
  });

  it('treats a corrupted durable handoff registry as an operational failure instead of silently forgetting retained sessions', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-steel-corrupt-handoff-'));
    const registryPath = join(dir, 'handoffs.json');
    await writeFile(registryPath, '{not-json', { mode: 0o600 });
    const baseUrl = await startFakeSteel(() => {});
    const backend = new SteelBrowserBackend({ baseUrl, handoffRegistryPath: registryPath });
    await expect(backend.reapExpired('2026-09-17T13:00:00.000Z')).rejects.toThrow(/handoff registry.*unreadable or invalid/);
  });

  it('treats a corrupted persisted browser context as an operational failure instead of starting with empty state', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-steel-corrupt-context-'));
    const contextPath = join(dir, 'context.json');
    await writeFile(contextPath, JSON.stringify({ format: 'JobHarnessSteelContext', version: 99, savedAt: 'bad', sessionContext: {} }), { mode: 0o600 });
    const baseUrl = await startFakeSteel(() => {});
    const backend = new SteelBrowserBackend({ baseUrl, contextPath });
    await expect(backend.acquire()).rejects.toThrow(/persisted context.*unreadable or invalid/);
  });

  it('rejects malformed provider session payloads at the Steel adapter boundary', async () => {
    server = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/v1/sessions') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ sessions: [{ id: 'broken-session', status: 'live' }] }));
        return;
      }
      res.statusCode = 404; res.end();
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fake Steel did not bind');
    const backend = new SteelBrowserBackend({ baseUrl: `http://127.0.0.1:${address.port}` });
    await expect(backend.resume({
      backendId: 'steel', sessionRef: 'broken-session', humanControlUrl: null,
      retainedAt: '2099-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:10:00.000Z',
    })).rejects.toThrow();
  });

  it('bounds Steel HTTP health checks so a half-open provider cannot stall a worker indefinitely', async () => {
    server = createServer((_req, _res) => { /* deliberately never respond */ });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fake Steel did not bind');
    const backend = new SteelBrowserBackend({ baseUrl: `http://127.0.0.1:${address.port}`, requestTimeoutMs: 25 });
    const started = Date.now();
    const health = await backend.health();
    expect(health.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

});
