import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalCdpBrowserBackend } from '../src/local-cdp';

let server: Server | null = null;
afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

describe('Local CDP browser backend health', () => {
  it('bounds the health request so a half-open local endpoint cannot stall the worker', async () => {
    server = createServer((_req, _res) => { /* deliberately never respond */ });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fixture server did not bind');
    const backend = new LocalCdpBrowserBackend({ endpoint: `http://127.0.0.1:${address.port}`, requestTimeoutMs: 25 });
    const started = Date.now();
    const health = await backend.health();
    expect(health.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
