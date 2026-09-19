import {
  BrowserExtensionAgentStatusSchema,
  InvokeBrowserExtensionCommandOutputSchema,
  type BrowserExtensionDriverCommand,
  type BrowserExtensionExecutionScope,
} from '@job-harness/apply-contracts';
import { BrowserSessionHandoffSchema, type BrowserSessionHandoff } from '@job-harness/apply-contracts';
import type {
  BrowserActionSnapshot,
  BrowserBackendDescriptor,
  BrowserClickExpectation,
  BrowserBackendPort,
  BrowserControlSnapshot,
  BrowserDriverPort,
  BrowserSessionPort,
  BrowserSessionRequest,
  BrowserSessionRetentionRequest,
  BrowserUploadFile,
} from './types';

export interface ExtensionBrowserBackendOptions {
  readonly bridgeUrl: string;
  readonly executorAuthToken: string;
  readonly agentId: string;
  readonly backendId?: string;
  readonly commandTimeoutMs?: number;
}

export class ExtensionBrowserBackend implements BrowserBackendPort {
  readonly id: string;
  private readonly bridgeUrl: string;
  private readonly token: string;
  private readonly agentId: string;
  private readonly commandTimeoutMs: number;

  constructor(options: ExtensionBrowserBackendOptions) {
    this.bridgeUrl = options.bridgeUrl.replace(/\/+$/, '');
    this.token = options.executorAuthToken.trim();
    this.agentId = options.agentId.trim();
    this.id = options.backendId?.trim() || `extension:${this.agentId}`;
    this.commandTimeoutMs = Math.max(1_000, Math.min(60_000, options.commandTimeoutMs ?? 30_000));
    if (!this.token) throw new Error('ExtensionBrowserBackend requires executorAuthToken');
    if (!this.agentId) throw new Error('ExtensionBrowserBackend requires agentId');
  }

  describe(): BrowserBackendDescriptor {
    return {
      id: this.id,
      kind: 'extension',
      persistentSession: true,
      humanControl: true,
      metadata: { agentId: this.agentId, transport: 'job-harness-browser-bridge' },
    };
  }

  async health(): Promise<{ ok: boolean; detail: string | null }> {
    try {
      const response = await this.request(`/agents/${encodeURIComponent(this.agentId)}/status`, {}, 10_000);
      if (!response.ok) return { ok: false, detail: `Browser extension bridge HTTP ${response.status}` };
      const status = BrowserExtensionAgentStatusSchema.parse(await response.json());
      return status.online ? { ok: true, detail: null } : { ok: false, detail: `Browser extension agent '${this.agentId}' is offline` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async acquire(request: BrowserSessionRequest = {}): Promise<BrowserSessionPort> {
    const scope = requireExecutionScope(request);
    const result = await this.invoke(scope, null, {
      type: 'session_acquire',
      payload: { preferredUrl: request.preferredUrl ?? null, reuseLiveSession: request.reuseLiveSession ?? false, requireLiveSession: false },
    });
    const record = objectResult(result, 'session_acquire');
    const sessionRef = stringField(record, 'sessionRef');
    const currentUrl = optionalStringField(record, 'currentUrl') ?? request.preferredUrl ?? 'about:blank';
    return new ExtensionBrowserSession(this, scope, sessionRef, currentUrl);
  }

  async resume(handoff: BrowserSessionHandoff, request: BrowserSessionRequest = {}): Promise<BrowserSessionPort> {
    const parsed = BrowserSessionHandoffSchema.parse(handoff);
    if (parsed.backendId !== this.id) throw new Error(`Browser handoff belongs to '${parsed.backendId}', not '${this.id}'`);
    if (parsed.expiresAt <= new Date().toISOString()) throw new Error(`Browser extension handoff expired at ${parsed.expiresAt}`);
    const scope = requireExecutionScope(request);
    const currentUrl = await this.invoke(scope, parsed.sessionRef, { type: 'current_url', payload: {} });
    return new ExtensionBrowserSession(this, scope, parsed.sessionRef, stringResult(currentUrl, 'current_url'));
  }

  async reapExpired(): Promise<number> {
    // The tab/browser is user-owned. A logical handoff expiry must never close it.
    return 0;
  }

  async invoke(scope: BrowserExtensionExecutionScope, sessionRef: string | null, command: BrowserExtensionDriverCommand): Promise<unknown> {
    const response = await this.request('/invoke', {
      method: 'POST',
      body: JSON.stringify({ agentId: this.agentId, sessionRef, command, timeoutMs: this.commandTimeoutMs, scope }),
    }, this.commandTimeoutMs + 5_000);
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body
        ? String((body as { error?: { message?: unknown } }).error?.message ?? `HTTP ${response.status}`)
        : `HTTP ${response.status}`;
      throw new Error(`Browser extension bridge command '${command.type}' failed: ${message}`);
    }
    return InvokeBrowserExtensionCommandOutputSchema.parse(body).result;
  }

  private request(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
    const callerSignal = init.signal ?? null;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    return fetch(`${this.bridgeUrl}${path}`, {
      ...init,
      signal: callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  }
}

class ExtensionBrowserSession implements BrowserSessionPort {
  readonly backendId: string;
  readonly sessionId: string;
  readonly humanControlUrl: string | null = null;
  private readonly driverValue: ExtensionBrowserDriver;

  constructor(private readonly backend: ExtensionBrowserBackend, private readonly scope: BrowserExtensionExecutionScope, sessionRef: string, currentUrl: string) {
    this.backendId = backend.id;
    this.sessionId = sessionRef;
    this.driverValue = new ExtensionBrowserDriver(backend, scope, sessionRef, currentUrl);
  }

  driver(): BrowserDriverPort { return this.driverValue; }
  async persist(): Promise<void> { /* user-owned Chrome persists its own profile */ }

  async retainForHuman(request: BrowserSessionRetentionRequest): Promise<BrowserSessionHandoff> {
    return BrowserSessionHandoffSchema.parse({
      backendId: this.backendId,
      sessionRef: this.sessionId,
      humanControlUrl: null,
      retainedAt: new Date().toISOString(),
      expiresAt: request.expiresAt,
    });
  }

  async release(): Promise<void> {
    // Logical Job Harness ownership ends here. The user-owned tab remains open.
  }
}

class ExtensionBrowserDriver implements BrowserDriverPort {
  private currentUrlValue: string;

  constructor(
    private readonly backend: ExtensionBrowserBackend,
    private readonly scope: BrowserExtensionExecutionScope,
    private readonly sessionRef: string,
    currentUrl: string,
  ) {
    this.currentUrlValue = currentUrl;
  }

  async navigate(url: string): Promise<void> {
    await this.backend.invoke(this.scope, this.sessionRef, { type: 'navigate', payload: { url } });
    await this.refreshUrl();
  }
  currentUrl(): string { return this.currentUrlValue; }
  async refreshCurrentUrl(): Promise<string> {
    await this.refreshUrl();
    return this.currentUrlValue;
  }
  async title(): Promise<string> { return stringResult(await this.backend.invoke(this.scope, this.sessionRef, { type: 'title', payload: {} }), 'title'); }
  async bodyText(limit = 50_000): Promise<string> { return stringResult(await this.backend.invoke(this.scope, this.sessionRef, { type: 'body_text', payload: { limit } }), 'body_text'); }
  async exists(selector: string): Promise<boolean> { return booleanResult(await this.backend.invoke(this.scope, this.sessionRef, { type: 'exists', payload: { selector } }), 'exists'); }
  async text(selector: string): Promise<string | null> { return nullableStringResult(await this.backend.invoke(this.scope, this.sessionRef, { type: 'text', payload: { selector } }), 'text'); }
  async fill(selector: string, value: string): Promise<void> { await this.backend.invoke(this.scope, this.sessionRef, { type: 'fill', payload: { selector, value } }); }
  async select(selector: string, value: string | readonly string[]): Promise<void> {
    await this.backend.invoke(this.scope, this.sessionRef, { type: 'select', payload: { selector, value: typeof value === 'string' ? value : [...value] } });
  }
  async setChecked(selector: string, checked: boolean): Promise<void> { await this.backend.invoke(this.scope, this.sessionRef, { type: 'set_checked', payload: { selector, checked } }); }
  async click(selector: string, expectation: BrowserClickExpectation = {}): Promise<void> {
    await this.backend.invoke(this.scope, this.sessionRef, { type: 'click', payload: { selector, expectedText: expectation.expectedText ?? null } });
    await this.refreshUrl();
  }
  async upload(selector: string, file: BrowserUploadFile): Promise<void> {
    await this.backend.invoke(this.scope, this.sessionRef, {
      type: 'upload',
      payload: { selector, file: { name: file.name, mimeType: file.mimeType, bytesBase64: Buffer.from(file.bytes).toString('base64') } },
    });
  }
  async wait(milliseconds: number): Promise<void> {
    await this.backend.invoke(this.scope, this.sessionRef, { type: 'wait', payload: { milliseconds } });
    await this.refreshUrl();
  }
  async scroll(deltaY: number): Promise<void> {
    await this.backend.invoke(this.scope, this.sessionRef, { type: 'scroll', payload: { deltaY } });
  }
  async screenshot(): Promise<Uint8Array> {
    const raw = stringResult(await this.backend.invoke(this.scope, this.sessionRef, { type: 'screenshot', payload: {} }), 'screenshot');
    return new Uint8Array(Buffer.from(raw, 'base64'));
  }
  async scanControls(): Promise<readonly BrowserControlSnapshot[]> {
    return controlSnapshots(await this.backend.invoke(this.scope, this.sessionRef, { type: 'scan_controls', payload: {} }));
  }
  async scanActions(): Promise<readonly BrowserActionSnapshot[]> {
    return actionSnapshots(await this.backend.invoke(this.scope, this.sessionRef, { type: 'scan_actions', payload: {} }));
  }
  async formStateHash(): Promise<string> {
    const hash = stringResult(await this.backend.invoke(this.scope, this.sessionRef, { type: 'form_state_hash', payload: {} }), 'form_state_hash');
    await this.refreshUrl();
    if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Browser extension returned an invalid form-state hash');
    return hash.toLowerCase();
  }

  private async refreshUrl(): Promise<void> {
    this.currentUrlValue = stringResult(await this.backend.invoke(this.scope, this.sessionRef, { type: 'current_url', payload: {} }), 'current_url');
  }
}

function requireExecutionScope(request: BrowserSessionRequest): BrowserExtensionExecutionScope {
  const scope = request.executionScope;
  if (!scope) throw new Error('Extension browser backend requires a current ExecutionAttempt lease scope');
  return scope;
}

function objectResult(value: unknown, command: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Browser extension '${command}' returned a non-object result`);
  return value as Record<string, unknown>;
}
function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Browser extension result field '${key}' must be a non-empty string`);
  return value;
}
function optionalStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value ? value : null;
}
function stringResult(value: unknown, command: string): string {
  if (typeof value !== 'string') throw new Error(`Browser extension '${command}' returned a non-string result`);
  return value;
}
function nullableStringResult(value: unknown, command: string): string | null {
  if (value === null) return null;
  return stringResult(value, command);
}
function booleanResult(value: unknown, command: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Browser extension '${command}' returned a non-boolean result`);
  return value;
}

function controlSnapshots(value: unknown): BrowserControlSnapshot[] {
  if (!Array.isArray(value)) throw new Error("Browser extension 'scan_controls' returned a non-array result");
  return value.map((item, index) => {
    const record = objectResult(item, `scan_controls[${index}]`);
    const options = Array.isArray(record.options) ? record.options.map((option, optionIndex) => {
      const candidate = objectResult(option, `scan_controls[${index}].options[${optionIndex}]`);
      return { value: stringField(candidate, 'value'), label: typeof candidate.label === 'string' ? candidate.label : '', disabled: Boolean(candidate.disabled) };
    }) : [];
    const kind = typeof record.kind === 'string' && ['text','textarea','email','tel','url','number','date','select','radio','checkbox','file','unknown'].includes(record.kind)
      ? record.kind as BrowserControlSnapshot['kind'] : 'unknown';
    return {
      controlRef: stringField(record, 'controlRef'),
      kind,
      label: typeof record.label === 'string' ? record.label : '',
      name: typeof record.name === 'string' ? record.name : null,
      description: typeof record.description === 'string' ? record.description : null,
      required: Boolean(record.required),
      disabled: Boolean(record.disabled),
      readOnly: Boolean(record.readOnly),
      options,
      semanticHints: Array.isArray(record.semanticHints) ? record.semanticHints.filter((hint): hint is string => typeof hint === 'string') : [],
      accept: typeof record.accept === 'string' ? record.accept : null,
      multiple: Boolean(record.multiple),
      sectionLabel: typeof record.sectionLabel === 'string' ? record.sectionLabel : null,
    };
  });
}

function actionSnapshots(value: unknown): BrowserActionSnapshot[] {
  if (!Array.isArray(value)) throw new Error("Browser extension 'scan_actions' returned a non-array result");
  return value.map((item, index) => {
    const record = objectResult(item, `scan_actions[${index}]`);
    const tag = record.tag === 'a' || record.tag === 'button' ? record.tag : 'other';
    return {
      actionRef: stringField(record, 'actionRef'),
      tag,
      text: typeof record.text === 'string' ? record.text : '',
      href: typeof record.href === 'string' ? record.href : null,
      type: typeof record.type === 'string' ? record.type : null,
      role: typeof record.role === 'string' ? record.role : null,
      disabled: Boolean(record.disabled),
      ariaDisabled: Boolean(record.ariaDisabled),
    };
  });
}
