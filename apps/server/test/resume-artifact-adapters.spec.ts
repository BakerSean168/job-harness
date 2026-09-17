import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileSystemResumeArtifactStorage, createHttpResumePdfRenderer } from '../src/resume-artifacts';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe('Resume artifact infrastructure adapters', () => {
  it('writes, reads and removes immutable artifact bytes under the configured root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jh-artifacts-'));
    dirs.push(root);
    const storage = createFileSystemResumeArtifactStorage(root);
    const bytes = new TextEncoder().encode('<html>resume</html>');
    const uri = await storage.write({ artifactId: 'artifact-1', revisionId: 'revision-1', extension: 'html', bytes });
    expect(uri.startsWith('file:')).toBe(true);
    expect(new TextDecoder().decode(await storage.read(uri))).toBe('<html>resume</html>');
    await storage.remove(uri);
    await expect(storage.read(uri)).rejects.toThrow();
  });

  it('validates renderer health and PDF magic while injecting the private bearer', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization') });
      if (String(input).endsWith('/healthz')) {
        return new Response(JSON.stringify({ ok: true, rendererId: 'chromium-playwright', rendererVersion: '140-pw1.55-pdf-v1' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(new TextEncoder().encode('%PDF-fake-pdf'), { status: 200, headers: { 'content-type': 'application/pdf' } });
    };
    const renderer = createHttpResumePdfRenderer({ baseUrl: 'http://renderer:3002/', token: 'private-renderer-token', fetch: fetchImpl });
    expect(await renderer.describe()).toEqual({ rendererId: 'chromium-playwright', rendererVersion: '140-pw1.55-pdf-v1' });
    expect(new TextDecoder().decode(await renderer.renderPdf('<html/>'))).toBe('%PDF-fake-pdf');
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.authorization === 'Bearer private-renderer-token')).toBe(true);
  });
});
