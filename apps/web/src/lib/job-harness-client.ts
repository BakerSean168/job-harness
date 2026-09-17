import 'server-only';
import { createJobHarnessRestClient } from '@job-harness/client';

function apiBaseUrl(): string {
  return (process.env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:3000/api/v1').replace(/\/+$/, '');
}

function apiAuthToken(): string | null {
  return process.env.JOB_HARNESS_AUTH_TOKEN?.trim() || null;
}

export function getJobHarnessClient() {
  return createJobHarnessRestClient({
    baseUrl: apiBaseUrl(),
    authToken: apiAuthToken(),
  });
}

export async function fetchJobHarnessDataDownload(kind: 'export' | 'backup'): Promise<Response> {
  const headers = new Headers();
  const token = apiAuthToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${apiBaseUrl()}/${kind}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
}

export async function fetchJobHarnessResumeArtifact(artifactId: string): Promise<Response> {
  const headers = new Headers();
  const token = apiAuthToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${apiBaseUrl()}/resume/artifacts/${encodeURIComponent(artifactId)}/content`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
}

function browserExtensionBridgeUrl(path: string): URL {
  const base = new URL(apiBaseUrl());
  base.pathname = base.pathname.replace(/\/api\/v1\/?$/, `/internal/browser-bridge/v1${path}`);
  base.search = '';
  base.hash = '';
  return base;
}

export interface BrowserExtensionAgentView {
  readonly agentId: string;
  readonly name: string;
  readonly version: string;
  readonly browserName: string | null;
  readonly platform: string | null;
  readonly online: boolean;
  readonly lastSeenAt: string;
  readonly queuedCommands: number;
  readonly inFlightCommands: number;
  readonly resumeUpload: boolean;
  readonly screenshots: boolean;
}

export async function getBrowserExtensionAgents(): Promise<BrowserExtensionAgentView[]> {
  const headers = new Headers({ accept: 'application/json' });
  const token = apiAuthToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(browserExtensionBridgeUrl('/agents'), { headers, cache: 'no-store' });
  if (!response.ok) return [];
  const body = await response.json().catch(() => null) as unknown;
  const items = body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)
    ? (body as { items: unknown[] }).items
    : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const capabilities = record.capabilities && typeof record.capabilities === 'object' ? record.capabilities as Record<string, unknown> : {};
    if (typeof record.agentId !== 'string' || typeof record.name !== 'string' || typeof record.version !== 'string' || typeof record.lastSeenAt !== 'string') return [];
    return [{
      agentId: record.agentId,
      name: record.name,
      version: record.version,
      browserName: typeof record.browserName === 'string' ? record.browserName : null,
      platform: typeof record.platform === 'string' ? record.platform : null,
      online: record.online === true,
      lastSeenAt: record.lastSeenAt,
      queuedCommands: typeof record.queuedCommands === 'number' ? record.queuedCommands : 0,
      inFlightCommands: typeof record.inFlightCommands === 'number' ? record.inFlightCommands : 0,
      resumeUpload: capabilities.resumeUpload === true,
      screenshots: capabilities.screenshots === true,
    } satisfies BrowserExtensionAgentView];
  });
}

export interface BrowserExtensionPairingResult {
  readonly code: string;
  readonly expiresAt: string;
}

export async function createBrowserExtensionPairing(): Promise<BrowserExtensionPairingResult> {
  const base = browserExtensionBridgeUrl('/pairings');
  const headers = new Headers({ accept: 'application/json' });
  const token = apiAuthToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(base, { method: 'POST', headers, cache: 'no-store' });
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body
      ? String((body as { error?: { message?: unknown } }).error?.message ?? `HTTP ${response.status}`)
      : `HTTP ${response.status}`;
    throw new Error(`Browser extension pairing failed: ${message}`);
  }
  if (!body || typeof body !== 'object' || typeof (body as { code?: unknown }).code !== 'string' || typeof (body as { expiresAt?: unknown }).expiresAt !== 'string') {
    throw new Error('Browser extension pairing returned an invalid response');
  }
  return { code: (body as { code: string }).code, expiresAt: (body as { expiresAt: string }).expiresAt };
}

export function getBrowserExtensionPublicBridgeUrl(): string | null {
  const value = process.env.JOB_HARNESS_BROWSER_EXTENSION_PUBLIC_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)) ? url.toString().replace(/\/$/, '') : null;
  } catch { return null; }
}
