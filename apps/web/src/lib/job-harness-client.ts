import 'server-only';
import { createJobHarnessRestClient } from '@job-harness/client';

function apiBaseUrl(): string {
  return (process.env.JOB_HARNESS_API_URL?.trim() || 'http://127.0.0.1:3000/api/v1').replace(/\/+$/, '');
}

function apiAuthToken(): string | null {
  return process.env.JOB_HARNESS_AUTH_TOKEN?.trim() || null;
}


async function fetchWithHeaderTimeout(input: Parameters<typeof fetch>[0], init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Job Harness upstream response timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const callerSignal = init.signal ?? null;
    return await fetch(input, {
      ...init,
      signal: callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
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
  return fetchWithHeaderTimeout(`${apiBaseUrl()}/${kind}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
}

export async function fetchJobHarnessResumeArtifact(artifactId: string): Promise<Response> {
  const headers = new Headers();
  const token = apiAuthToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetchWithHeaderTimeout(`${apiBaseUrl()}/resume/artifacts/${encodeURIComponent(artifactId)}/content`, {
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
  const response = await fetchWithHeaderTimeout(browserExtensionBridgeUrl('/agents'), { headers, cache: 'no-store' });
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
  const response = await fetchWithHeaderTimeout(base, { method: 'POST', headers, cache: 'no-store' });
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


export interface AtsCharacterizationEvidence {
  readonly observedAt: string;
  readonly currentUrl: string;
  readonly title: string;
  readonly formStateHash: string;
  readonly bodyTextLength: number;
  readonly stateSignals: readonly string[];
  readonly actions: readonly { readonly tag: string; readonly text: string; readonly href: string | null; readonly type: string | null; readonly role: string | null; readonly disabled: boolean; readonly ariaDisabled: boolean }[];
  readonly controls: readonly { readonly kind: string; readonly label: string; readonly name: string | null; readonly description: string | null; readonly required: boolean; readonly disabled: boolean; readonly readOnly: boolean; readonly optionLabels: readonly string[]; readonly semanticHints: readonly string[]; readonly accept: string | null; readonly multiple: boolean; readonly sectionLabel: string | null }[];
}
export interface AtsCharacterizationResult { readonly runId: string; readonly evidence: AtsCharacterizationEvidence; }

function browserExtensionHeaders(): Headers {
  const headers = new Headers({ accept: 'application/json', 'content-type': 'application/json' });
  const token = apiAuthToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}
function upstreamMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const value = (body as { error?: unknown }).error;
    if (value && typeof value === 'object' && 'message' in value) return String((value as { message?: unknown }).message ?? `HTTP ${status}`);
    if (typeof value === 'string') return value;
  }
  return `HTTP ${status}`;
}

export async function characterizeBrowserExtensionSite(input: { agentId: string; targetUrl: string; mode?: 'site-readonly' | 'site-staged-readonly' }): Promise<AtsCharacterizationResult> {
  const headers = browserExtensionHeaders();
  const createResponse = await fetchWithHeaderTimeout(browserExtensionBridgeUrl('/validation-runs'), {
    method: 'POST', headers, cache: 'no-store',
    body: JSON.stringify({ agentId: input.agentId, targetUrl: input.targetUrl, mode: input.mode ?? 'site-readonly', ttlMs: 600_000 }),
  }, 30_000);
  const created = await createResponse.json().catch(() => null) as unknown;
  if (!createResponse.ok) throw new Error(`ATS characterization start failed: ${upstreamMessage(created, createResponse.status)}`);
  if (!created || typeof created !== 'object' || typeof (created as { id?: unknown }).id !== 'string') throw new Error('ATS characterization start returned an invalid run');
  const runId = (created as { id: string }).id;
  const characterizeResponse = await fetchWithHeaderTimeout(browserExtensionBridgeUrl(`/validation-runs/${encodeURIComponent(runId)}/characterize`), {
    method: 'POST', headers, cache: 'no-store', body: '{}',
  }, 90_000);
  const characterized = await characterizeResponse.json().catch(() => null) as unknown;
  if (!characterizeResponse.ok) throw new Error(`ATS characterization failed: ${upstreamMessage(characterized, characterizeResponse.status)}`);
  if (!characterized || typeof characterized !== 'object' || !('evidence' in characterized)) throw new Error('ATS characterization returned no evidence');
  return { runId, evidence: (characterized as { evidence: AtsCharacterizationEvidence }).evidence };
}


export interface SiteResumeSyncResult {
  readonly runId: string;
  readonly artifactId: string;
  readonly artifactSha256: string;
  readonly writeCount: number;
  readonly currentUrl: string;
  readonly title: string;
  readonly stateSignals: readonly string[];
}

export async function syncResumeArtifactToRecruitingSite(input: {
  agentId: string;
  targetUrl: string;
  artifactId: string;
  fileName: string;
}): Promise<SiteResumeSyncResult> {
  const headers = browserExtensionHeaders();
  const createResponse = await fetchWithHeaderTimeout(browserExtensionBridgeUrl('/validation-runs'), {
    method: 'POST', headers, cache: 'no-store',
    body: JSON.stringify({ agentId: input.agentId, targetUrl: input.targetUrl, mode: 'site-resume-sync', ttlMs: 600_000 }),
  }, 30_000);
  const created = await createResponse.json().catch(() => null) as any;
  if (!createResponse.ok) throw new Error(`Site Resume Sync start failed: ${upstreamMessage(created, createResponse.status)}`);
  if (!created || typeof created.id !== 'string') throw new Error('Site Resume Sync start returned an invalid run');
  const runId = created.id as string;
  const syncResponse = await fetchWithHeaderTimeout(browserExtensionBridgeUrl(`/validation-runs/${encodeURIComponent(runId)}/sync-resume`), {
    method: 'POST', headers, cache: 'no-store',
    body: JSON.stringify({ artifactId: input.artifactId, fileName: input.fileName }),
  }, 90_000);
  const synced = await syncResponse.json().catch(() => null) as any;
  if (!syncResponse.ok) throw new Error(`Site Resume Sync failed: ${upstreamMessage(synced, syncResponse.status)}`);
  if (!synced?.run || !synced?.evidence || typeof synced.artifactSha256 !== 'string') throw new Error('Site Resume Sync returned invalid evidence');
  return {
    runId,
    artifactId: String(synced.artifactId),
    artifactSha256: synced.artifactSha256,
    writeCount: Number(synced.run.writeCount ?? 0),
    currentUrl: String(synced.evidence.currentUrl ?? ''),
    title: String(synced.evidence.title ?? ''),
    stateSignals: Array.isArray(synced.evidence.stateSignals) ? synced.evidence.stateSignals.map(String) : [],
  };
}
