import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  ResumeArtifactStoragePort,
  ResumePdfRendererDescriptor,
  ResumePdfRendererPort,
} from '@job-harness/resume-application';

function artifactDirectoryKey(revisionId: string): string {
  return createHash('sha256').update(revisionId).digest('hex').slice(0, 32);
}

function ensureExtension(extension: string): string {
  if (!/^[a-z0-9]{1,12}$/i.test(extension)) throw new Error(`Unsupported artifact extension '${extension}'`);
  return extension.toLowerCase();
}

export function createFileSystemResumeArtifactStorage(baseDirectory: string): ResumeArtifactStoragePort {
  const root = resolve(baseDirectory);

  async function safeFileFromUri(storageUri: string): Promise<string> {
    const url = new URL(storageUri);
    if (url.protocol !== 'file:') throw new Error(`Unsupported Resume artifact URI protocol '${url.protocol}'`);
    const candidate = resolve(fileURLToPath(url));
    const canonicalRoot = await realpath(root);
    const canonicalFile = await realpath(candidate);
    if (canonicalFile !== canonicalRoot && !canonicalFile.startsWith(`${canonicalRoot}${sep}`)) {
      throw new Error('Resume artifact URI escapes the configured artifact directory');
    }
    return canonicalFile;
  }

  return {
    async write({ artifactId, revisionId, extension, bytes }) {
      const suffix = ensureExtension(extension);
      // The durable data root is owned by the container runtime uid but uses a host-operator group.
      // Preserve that group via setgid and keep artifacts private to owner/group so host backup can read them.
      await mkdir(root, { recursive: true, mode: 0o2770 });
      await chmod(root, 0o2770);
      const dir = join(root, artifactDirectoryKey(revisionId));
      await mkdir(dir, { recursive: true, mode: 0o2770 });
      await chmod(dir, 0o2770);
      const destination = join(dir, `${artifactId}.${suffix}`);
      const temp = `${destination}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temp, bytes, { mode: 0o660, flag: 'wx' });
      await chmod(temp, 0o660);
      await rename(temp, destination);
      return pathToFileURL(destination).href;
    },
    async read(storageUri) {
      return new Uint8Array(await readFile(await safeFileFromUri(storageUri)));
    },
    async remove(storageUri) {
      try { await rm(await safeFileFromUri(storageUri), { force: true }); } catch { /* best-effort rollback cleanup */ }
    },
  };
}

export interface HttpResumePdfRendererOptions {
  readonly baseUrl: string;
  readonly token?: string | null;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export function createHttpResumePdfRenderer(options: HttpResumePdfRendererOptions): ResumePdfRendererPort {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const headers = () => ({ ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) });

  return {
    async describe(): Promise<ResumePdfRendererDescriptor> {
      const response = await fetchImpl(`${baseUrl}/healthz`, { headers: headers(), signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`Resume PDF renderer health failed with ${response.status}`);
      const payload = await response.json() as Record<string, unknown>;
      if (payload.ok !== true || typeof payload.rendererId !== 'string' || typeof payload.rendererVersion !== 'string') {
        throw new Error('Resume PDF renderer health payload is invalid');
      }
      return { rendererId: payload.rendererId, rendererVersion: payload.rendererVersion };
    },
    async renderPdf(html: string): Promise<Uint8Array> {
      const response = await fetchImpl(`${baseUrl}/render/pdf`, {
        method: 'POST',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: JSON.stringify({ html }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Resume PDF renderer failed with ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
        throw new Error('Resume PDF renderer returned non-PDF bytes');
      }
      return bytes;
    },
  };
}
