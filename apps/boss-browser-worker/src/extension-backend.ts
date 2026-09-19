import type {
  BrowserActionSnapshot,
  BrowserBackendDescriptor,
  BrowserBackendPort,
  BrowserClickExpectation,
  BrowserControlSnapshot,
  BrowserDriverPort,
  BrowserSessionPort,
  BrowserSessionRequest,
  BrowserSessionRetentionRequest,
  BrowserUploadFile,
} from '@job-harness/apply-browser';

interface BossExtensionValidationBackendOptions {
  readonly apiUrl: string;
  readonly authToken: string;
  readonly agentId: string;
  readonly commandTimeoutMs?: number;
}

interface ValidationRun {
  readonly id: string;
  readonly targetUrl: string;
  readonly sessionRef: string | null;
}

export class BossExtensionValidationBackend implements BrowserBackendPort {
  readonly id: string;
  private readonly apiUrl: string;
  private readonly authToken: string;
  private readonly agentId: string;
  private readonly commandTimeoutMs: number;

  constructor(options: BossExtensionValidationBackendOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.authToken = options.authToken.trim();
    this.agentId = options.agentId.trim();
    this.commandTimeoutMs = Math.max(1_000, Math.min(60_000, options.commandTimeoutMs ?? 30_000));
    this.id = 'boss-extension:' + this.agentId;
    if (!this.authToken) throw new Error('BOSS extension backend requires JOB_HARNESS_AUTH_TOKEN');
    if (!this.agentId) throw new Error('BOSS extension backend requires an agentId');
  }

  describe(): BrowserBackendDescriptor {
    return {
      id: this.id,
      kind: 'extension',
      persistentSession: true,
      humanControl: true,
      metadata: { agentId: this.agentId, authority: 'boss-discovery-validation-run' },
    };
  }

  async health(): Promise<{ ok: boolean; detail: string | null }> {
    try {
      const response = await this.request('/internal/browser-bridge/v1/agents/' + encodeURIComponent(this.agentId) + '/status');
      if (!response.ok) return { ok: false, detail: 'Browser Bridge HTTP ' + response.status };
      const body = await response.json() as { online?: unknown; version?: unknown };
      if (body.online !== true) return { ok: false, detail: 'Browser Bridge agent is offline' };
      return { ok: true, detail: typeof body.version === 'string' ? 'Browser Bridge ' + body.version : null };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async acquire(request: BrowserSessionRequest = {}): Promise<BrowserSessionPort> {
    const preferredUrl = request.preferredUrl?.trim() || 'https://www.zhipin.com/web/geek/job';
    const runResponse = await this.request('/internal/browser-bridge/v1/validation-runs', {
      method: 'POST',
      body: JSON.stringify({
        agentId: this.agentId,
        targetUrl: preferredUrl,
        mode: 'boss-discovery',
        ttlMs: 10 * 60_000,
      }),
    });
    const run = await parseResponse<ValidationRun>(runResponse, 'create BOSS discovery run');
    const reuse = request.reuseLiveSession !== false;
    let acquired: { run: ValidationRun; result: unknown };
    try {
      acquired = await this.invoke(run.id, null, {
        type: 'session_acquire',
        payload: { preferredUrl, reuseLiveSession: reuse, requireLiveSession: false },
      });
    } catch (error) {
      if (!reuse || !isTargetMismatch(error)) throw error;
      acquired = await this.invoke(run.id, null, {
        type: 'session_acquire',
        payload: { preferredUrl, reuseLiveSession: false, requireLiveSession: false },
      });
    }
    const result = record(acquired.result, 'session_acquire');
    const sessionRef = nonEmptyString(result.sessionRef, 'sessionRef');
    const currentUrl = nonEmptyString(result.currentUrl, 'currentUrl');
    return new BossExtensionValidationSession(this, run.id, sessionRef, currentUrl);
  }

  async resume(): Promise<BrowserSessionPort> {
    throw new Error('BOSS extension discovery sessions are user-owned and resumed by acquiring a current BOSS tab');
  }

  async reapExpired(): Promise<number> {
    return 0;
  }

  async invoke(runId: string, sessionRef: string | null, command: Record<string, unknown>): Promise<{ run: ValidationRun; result: unknown }> {
    const response = await this.request(
      '/internal/browser-bridge/v1/validation-runs/' + encodeURIComponent(runId) + '/invoke',
      {
        method: 'POST',
        body: JSON.stringify({ sessionRef, command, timeoutMs: this.commandTimeoutMs }),
      },
      this.commandTimeoutMs + 5_000,
    );
    return parseResponse<{ run: ValidationRun; result: unknown }>(response, 'invoke BOSS discovery command');
  }

  private request(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
    return fetch(this.apiUrl + path, {
      ...init,
      headers: {
        authorization: 'Bearer ' + this.authToken,
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
}

class BossExtensionValidationSession implements BrowserSessionPort {
  readonly backendId: string;
  readonly sessionId: string;
  readonly humanControlUrl: string | null = null;
  private readonly driverValue: BossExtensionValidationDriver;

  constructor(
    private readonly backend: BossExtensionValidationBackend,
    runId: string,
    sessionRef: string,
    currentUrl: string,
  ) {
    this.backendId = backend.id;
    this.sessionId = sessionRef;
    this.driverValue = new BossExtensionValidationDriver(backend, runId, sessionRef, currentUrl);
  }

  driver(): BrowserDriverPort { return this.driverValue; }
  async persist(): Promise<void> { /* user-owned Chrome profile persists itself */ }
  async retainForHuman(request: BrowserSessionRetentionRequest) {
    return {
      backendId: this.backendId,
      sessionRef: this.sessionId,
      humanControlUrl: null,
      retainedAt: new Date().toISOString(),
      expiresAt: request.expiresAt,
    };
  }
  async release(): Promise<void> { /* never close a user-owned Chrome tab */ }
}

class BossExtensionValidationDriver implements BrowserDriverPort {
  private currentUrlValue: string;

  constructor(
    private readonly backend: BossExtensionValidationBackend,
    private readonly runId: string,
    private readonly sessionRef: string,
    currentUrl: string,
  ) {
    this.currentUrlValue = currentUrl;
  }

  currentUrl(): string { return this.currentUrlValue; }
  async refreshCurrentUrl(): Promise<string> {
    this.currentUrlValue = stringResult(await this.command({ type: 'current_url', payload: {} }), 'current_url');
    return this.currentUrlValue;
  }
  async navigate(url: string): Promise<void> {
    await this.command({ type: 'navigate', payload: { url } });
    await this.refreshCurrentUrl();
  }
  async title(): Promise<string> { return stringResult(await this.command({ type: 'title', payload: {} }), 'title'); }
  async bodyText(limit = 50_000): Promise<string> { return stringResult(await this.command({ type: 'body_text', payload: { limit } }), 'body_text'); }
  async exists(selector: string): Promise<boolean> { return booleanResult(await this.command({ type: 'exists', payload: { selector } }), 'exists'); }
  async text(selector: string): Promise<string | null> {
    const value = await this.command({ type: 'text', payload: { selector } });
    return value === null ? null : stringResult(value, 'text');
  }
  async fill(selector: string, value: string): Promise<void> { await this.command({ type: 'fill', payload: { selector, value } }); }
  async select(): Promise<void> { throw new Error('BOSS discovery does not allow select writes'); }
  async setChecked(): Promise<void> { throw new Error('BOSS discovery does not allow checkbox/radio writes'); }
  async click(selector: string, expectation: BrowserClickExpectation = {}): Promise<void> {
    await this.command({ type: 'click', payload: { selector, expectedText: expectation.expectedText ?? null } });
    await this.refreshCurrentUrl();
  }
  async upload(_selector: string, _file: BrowserUploadFile): Promise<void> { throw new Error('BOSS discovery does not allow uploads'); }
  async wait(milliseconds: number): Promise<void> {
    await this.command({ type: 'wait', payload: { milliseconds } });
    await this.refreshCurrentUrl();
  }
  async scroll(deltaY: number): Promise<void> { await this.command({ type: 'scroll', payload: { deltaY } }); }
  async screenshot(): Promise<Uint8Array> { throw new Error('BOSS discovery does not require screenshots'); }
  async scanControls(): Promise<readonly BrowserControlSnapshot[]> {
    const value = await this.command({ type: 'scan_controls', payload: {} });
    if (!Array.isArray(value)) throw new Error('scan_controls returned non-array');
    return value as BrowserControlSnapshot[];
  }
  async scanActions(): Promise<readonly BrowserActionSnapshot[]> {
    const value = await this.command({ type: 'scan_actions', payload: {} });
    if (!Array.isArray(value)) throw new Error('scan_actions returned non-array');
    return value as BrowserActionSnapshot[];
  }
  async formStateHash(): Promise<string> { return stringResult(await this.command({ type: 'form_state_hash', payload: {} }), 'form_state_hash'); }

  private async command(command: Record<string, unknown>): Promise<unknown> {
    return (await this.backend.invoke(this.runId, this.sessionRef, command)).result;
  }
}

async function parseResponse<T>(response: Response, action: string): Promise<T> {
  const text = await response.text();
  const parsed = text ? safeJson(text) : null;
  if (!response.ok) {
    const message = errorMessage(parsed) || ('HTTP ' + response.status);
    const error = new Error(action + ' failed: ' + message) as Error & { status?: number; code?: string };
    error.status = response.status;
    const code = errorCode(parsed);
    if (code) error.code = code;
    throw error;
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 500) }; }
}

function errorMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

function errorCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function isTargetMismatch(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'VALIDATION_TARGET_MISMATCH');
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' returned invalid data');
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' must be a non-empty string');
  return value;
}

function stringResult(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(label + ' returned a non-string result');
  return value;
}

function booleanResult(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(label + ' returned a non-boolean result');
  return value;
}
