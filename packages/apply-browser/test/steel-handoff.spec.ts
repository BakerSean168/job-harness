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
});
