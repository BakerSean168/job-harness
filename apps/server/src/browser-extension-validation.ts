import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import {
  BrowserExtensionDriverCommandSchema,
  InvokeBrowserExtensionCommandInputSchema,
  type BrowserExtensionDriverCommand,
} from '@job-harness/apply-contracts';
import {
  BROWSER_EXTENSION_BRIDGE_PREFIX,
  BrowserExtensionBridge,
  BrowserExtensionBridgeError,
} from './browser-extension-bridge';
import { writeCommonRestError, writeInternalRestError, writeRestError } from './http-errors';

const ValidationRunIdSchema = z.string().trim().min(1).max(200);
const ValidationModeSchema = z.enum(['synthetic-canary', 'site-readonly', 'site-staged-readonly']);
const ReadonlySiteFamilySchema = z.enum(['zhilian', 'liepin']);
type ReadonlySiteFamily = z.infer<typeof ReadonlySiteFamilySchema>;
const CreateValidationRunInputSchema = z.object({
  agentId: z.string().trim().min(1).max(200),
  targetUrl: z.url(),
  mode: ValidationModeSchema.default('synthetic-canary'),
  ttlMs: z.number().int().min(30_000).max(10 * 60_000).default(3 * 60_000),
}).strict();
const InvokeValidationCommandInputSchema = z.object({
  sessionRef: z.string().trim().min(1).max(500).nullable().default(null),
  command: BrowserExtensionDriverCommandSchema,
  timeoutMs: z.number().int().min(1_000).max(60_000).default(30_000),
}).strict();

const SAFE_VALIDATION_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>([
  'session_acquire',
  'current_url',
  'title',
  'body_text',
  'exists',
  'text',
  'fill',
  'select',
  'set_checked',
  'upload',
  'wait',
  'scan_controls',
  'scan_actions',
  'form_state_hash',
]);
const READONLY_SITE_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>([
  'session_acquire', 'current_url', 'title', 'body_text', 'exists', 'text', 'wait', 'scan_controls', 'scan_actions', 'form_state_hash',
]);
const WRITE_VALIDATION_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>(['fill', 'select', 'set_checked', 'upload']);

export interface BrowserExtensionCharacterizationEvidence {
  readonly observedAt: string;
  readonly currentUrl: string;
  readonly title: string;
  readonly formStateHash: string;
  readonly bodyTextLength: number;
  readonly stateSignals: readonly string[];
  readonly actions: readonly {
    readonly tag: string; readonly text: string; readonly href: string | null; readonly type: string | null; readonly role: string | null; readonly disabled: boolean; readonly ariaDisabled: boolean;
  }[];
  readonly controls: readonly {
    readonly kind: string; readonly label: string; readonly name: string | null; readonly description: string | null; readonly required: boolean; readonly disabled: boolean; readonly readOnly: boolean; readonly optionLabels: readonly string[]; readonly semanticHints: readonly string[]; readonly accept: string | null; readonly multiple: boolean; readonly sectionLabel: string | null;
  }[];
}

export interface BrowserExtensionValidationRun {
  readonly id: string;
  readonly agentId: string;
  readonly targetUrl: string;
  readonly mode: z.infer<typeof ValidationModeSchema>;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly sessionRef: string | null;
  readonly commandCount: number;
  readonly writeCount: number;
  readonly characterization: BrowserExtensionCharacterizationEvidence | null;
}

interface MutableValidationRun {
  id: string;
  agentId: string;
  targetUrl: string;
  mode: z.infer<typeof ValidationModeSchema>;
  createdAt: string;
  expiresAt: string;
  sessionRef: string | null;
  commandCount: number;
  writeCount: number;
  characterization: BrowserExtensionCharacterizationEvidence | null;
}

export class BrowserExtensionValidationRegistry {
  private readonly runs = new Map<string, MutableValidationRun>();
  private readonly allowedOrigin: string;
  private readonly now: () => Date;
  private readonly readonlySiteFamilies: ReadonlySet<ReadonlySiteFamily>;

  constructor(
    private readonly bridge: BrowserExtensionBridge,
    options: { allowedOrigin: string; readonlySiteFamilies?: readonly ReadonlySiteFamily[]; now?: () => Date },
  ) {
    const origin = new URL(options.allowedOrigin).origin;
    if (!/^https?:\/\//i.test(origin)) throw new Error('Browser validation allowed origin must use HTTP(S)');
    this.allowedOrigin = origin;
    this.readonlySiteFamilies = new Set((options.readonlySiteFamilies ?? []).map((value) => ReadonlySiteFamilySchema.parse(value)));
    this.now = options.now ?? (() => new Date());
  }

  create(raw: unknown): BrowserExtensionValidationRun {
    this.reap();
    const input = CreateValidationRunInputSchema.parse(raw);
    const target = this.validateTarget(input.targetUrl, input.mode);
    const agent = this.bridge.status(input.agentId);
    if (!agent?.online) throw new BrowserExtensionBridgeError('AGENT_OFFLINE', `Browser extension agent '${input.agentId}' is offline`, 503);
    const createdAt = this.now().toISOString();
    const run: MutableValidationRun = {
      id: randomUUID(),
      agentId: input.agentId,
      targetUrl: target,
      mode: input.mode,
      createdAt,
      expiresAt: new Date(this.now().getTime() + input.ttlMs).toISOString(),
      sessionRef: null,
      commandCount: 0,
      writeCount: 0,
      characterization: null,
    };
    this.runs.set(run.id, run);
    return freezeRun(run);
  }

  get(id: string): BrowserExtensionValidationRun | null {
    this.reap();
    const run = this.runs.get(ValidationRunIdSchema.parse(id));
    return run ? freezeRun(run) : null;
  }

  list(): BrowserExtensionValidationRun[] {
    this.reap();
    return [...this.runs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .map(freezeRun);
  }

  async invoke(id: string, raw: unknown): Promise<{ run: BrowserExtensionValidationRun; commandId: string; result: unknown }> {
    this.reap();
    const run = this.requireRun(id);
    const input = InvokeValidationCommandInputSchema.parse(raw);
    const allowedCommands = run.mode === 'site-readonly' || run.mode === 'site-staged-readonly' ? READONLY_SITE_COMMANDS : SAFE_VALIDATION_COMMANDS;
    if (!allowedCommands.has(input.command.type)) {
      throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', `Browser validation mode '${run.mode}' does not allow '${input.command.type}'`, 403);
    }
    if (input.command.type === 'upload') {
      const file = input.command.payload.file;
      if (input.command.payload.selector !== '#resume' || file.mimeType !== 'application/pdf' || !/\.pdf$/i.test(file.name) || file.bytesBase64.length < 4) {
        throw new BrowserExtensionBridgeError('VALIDATION_UPLOAD_DENIED', 'Browser validation upload is restricted to one PDF on the synthetic #resume control', 403);
      }
    }

    if (input.command.type === 'session_acquire') {
      if (run.sessionRef) throw new BrowserExtensionBridgeError('VALIDATION_SESSION_EXISTS', 'Browser validation run already owns a session', 409);
      const preferred = input.command.payload.preferredUrl;
      if (!preferred || this.validateTarget(preferred, run.mode) !== run.targetUrl) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', 'Browser validation session must acquire the frozen canary URL', 409);
      }
      const staged = run.mode === 'site-staged-readonly';
      if (!staged && input.command.payload.reuseLiveSession) {
        throw new BrowserExtensionBridgeError('VALIDATION_REUSE_DENIED', 'This browser validation mode must create an isolated Chrome tab', 403);
      }
      if (staged && (!input.command.payload.reuseLiveSession || input.command.payload.requireLiveSession !== true)) {
        throw new BrowserExtensionBridgeError('VALIDATION_LIVE_SESSION_REQUIRED', 'Staged read-only characterization must reuse an already-open Chrome tab and may not create or navigate one', 403);
      }
      const output = await this.bridge.invoke(InvokeBrowserExtensionCommandInputSchema.parse({
        agentId: run.agentId,
        sessionRef: null,
        command: input.command,
        timeoutMs: input.timeoutMs,
      }));
      const result = requireRecord(output.result, 'session_acquire');
      const sessionRef = requireString(result.sessionRef, 'sessionRef');
      const currentUrl = requireString(result.currentUrl, 'currentUrl');
      if (!this.sameTarget(currentUrl, run.targetUrl, run.mode)) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', 'Browser validation Chrome tab opened an unexpected URL', 409);
      }
      run.sessionRef = sessionRef;
      run.commandCount += 1;
      return { run: freezeRun(run), commandId: output.commandId, result: output.result };
    }

    if (!run.sessionRef || input.sessionRef !== run.sessionRef) {
      throw new BrowserExtensionBridgeError('VALIDATION_SESSION_MISMATCH', 'Browser validation command is not bound to the acquired Chrome tab', 409);
    }

    // The user owns this browser and can manually navigate the tab at any time.
    // Re-check the URL immediately before every command so a validation write can
    // never escape the frozen synthetic ATS page.
    const current = await this.bridge.invoke({
      agentId: run.agentId,
      sessionRef: run.sessionRef,
      command: { type: 'current_url', payload: {} },
      timeoutMs: Math.min(input.timeoutMs, 10_000),
    });
    if (!this.sameTarget(requireString(current.result, 'current_url'), run.targetUrl, run.mode)) {
      throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DRIFT', 'Browser validation tab navigated away from the frozen canary URL', 409);
    }

    const output = await this.bridge.invoke(InvokeBrowserExtensionCommandInputSchema.parse({
      agentId: run.agentId,
      sessionRef: run.sessionRef,
      command: input.command,
      timeoutMs: input.timeoutMs,
    }));
    run.commandCount += 1;
    if (WRITE_VALIDATION_COMMANDS.has(input.command.type)) run.writeCount += 1;
    return { run: freezeRun(run), commandId: output.commandId, result: output.result };
  }

  async characterize(id: string): Promise<{ run: BrowserExtensionValidationRun; evidence: BrowserExtensionCharacterizationEvidence }> {
    this.reap();
    const run = this.requireRun(id);
    if (run.mode !== 'site-readonly' && run.mode !== 'site-staged-readonly') {
      throw new BrowserExtensionBridgeError('VALIDATION_MODE_REQUIRED', 'Characterization requires a read-only site validation run', 409);
    }
    if (!run.sessionRef) {
      const staged = run.mode === 'site-staged-readonly';
      await this.invoke(id, {
        sessionRef: null,
        command: { type: 'session_acquire', payload: { preferredUrl: run.targetUrl, reuseLiveSession: staged, requireLiveSession: staged } },
        timeoutMs: 30_000,
      });
    }
    const sessionRef = run.sessionRef!;
    await this.invoke(id, { sessionRef, command: { type: 'wait', payload: { milliseconds: 1200 } }, timeoutMs: 10_000 });
    const current = await this.invoke(id, { sessionRef, command: { type: 'current_url', payload: {} }, timeoutMs: 10_000 });
    const title = await this.invoke(id, { sessionRef, command: { type: 'title', payload: {} }, timeoutMs: 10_000 });
    const body = await this.invoke(id, { sessionRef, command: { type: 'body_text', payload: { limit: 50_000 } }, timeoutMs: 15_000 });
    const actions = await this.invoke(id, { sessionRef, command: { type: 'scan_actions', payload: {} }, timeoutMs: 15_000 });
    const controls = await this.invoke(id, { sessionRef, command: { type: 'scan_controls', payload: {} }, timeoutMs: 15_000 });
    const formHash = await this.invoke(id, { sessionRef, command: { type: 'form_state_hash', payload: {} }, timeoutMs: 15_000 });
    const bodyText = requireString(body.result, 'body_text');
    const evidence: BrowserExtensionCharacterizationEvidence = {
      observedAt: this.now().toISOString(),
      currentUrl: requireString(current.result, 'current_url'),
      title: requireString(title.result, 'title').slice(0, 500),
      formStateHash: requireString(formHash.result, 'form_state_hash').slice(0, 200),
      bodyTextLength: bodyText.length,
      stateSignals: characterizedStateSignals(bodyText),
      actions: sanitizeCharacterizationActions(actions.result),
      controls: sanitizeCharacterizationControls(controls.result),
    };
    run.characterization = evidence;
    return { run: freezeRun(run), evidence };
  }

  private validateTarget(raw: string, mode: z.infer<typeof ValidationModeSchema>): string {
    const url = new URL(raw);
    if (mode === 'synthetic-canary') {
      if (url.origin !== this.allowedOrigin || url.pathname !== '/labs/apply-canary') {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Browser validation synthetic target must be the configured ATS canary route', 403);
      }
      const runId = url.searchParams.get('run')?.trim() ?? '';
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(runId) || url.searchParams.has('format')) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Browser validation target requires one safe canary run id', 403);
      }
      if ([...url.searchParams.keys()].some((key) => key !== 'run')) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Browser validation target contains unsupported query parameters', 403);
      }
      url.hash = '';
      return url.toString();
    }

    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Read-only site validation requires an HTTPS recruiting-site URL without credentials', 403);
    }
    const host = url.hostname.toLowerCase();
    const zhilian = this.readonlySiteFamilies.has('zhilian')
      && (host === 'zhaopin.com' || host === 'www.zhaopin.com')
      && /^\/jobdetail\/[^/]+\.htm$/i.test(url.pathname);
    const liepin = this.readonlySiteFamilies.has('liepin')
      && (host === 'liepin.com' || host === 'www.liepin.com')
      && /^\/job\/\d+\.shtml$/i.test(url.pathname);
    if (!zhilian && !liepin) {
      throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Read-only site validation target is outside the configured characterized recruiting-site families', 403);
    }
    url.hash = '';
    return url.toString();
  }

  private sameTarget(left: string, right: string, mode: z.infer<typeof ValidationModeSchema>): boolean {
    try { return this.validateTarget(left, mode) === this.validateTarget(right, mode); }
    catch { return false; }
  }

  private requireRun(id: string): MutableValidationRun {
    const run = this.runs.get(ValidationRunIdSchema.parse(id));
    if (!run) throw new BrowserExtensionBridgeError('VALIDATION_RUN_NOT_FOUND', 'Browser validation run was not found or expired', 404);
    return run;
  }

  private reap(): void {
    const now = this.now().toISOString();
    for (const [id, run] of this.runs) if (run.expiresAt <= now) this.runs.delete(id);
  }
}

export function registerBrowserExtensionValidationApi(
  app: Express,
  registry: BrowserExtensionValidationRegistry | null,
): void {
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.status(201).json(registry.create(req.body));
  }));
  app.get(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs`, validationRoute(async (_req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.json({ items: registry.list() });
  }));
  app.get(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs/:runId`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    const run = registry.get(pathId(req.params.runId));
    if (!run) throw new BrowserExtensionBridgeError('VALIDATION_RUN_NOT_FOUND', 'Browser validation run was not found or expired', 404);
    res.json(run);
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs/:runId/invoke`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.json(await registry.invoke(pathId(req.params.runId), req.body));
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/validation-runs/:runId/characterize`, validationRoute(async (req, res) => {
    if (!registry) throw new BrowserExtensionBridgeError('VALIDATION_DISABLED', 'Browser validation is not configured', 503);
    res.json(await registry.characterize(pathId(req.params.runId)));
  }));
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
function validationRoute(handler: AsyncHandler) {
  return (req: Request, res: Response) => { void handler(req, res).catch((error) => sendValidationError(res, error)); };
}
function pathId(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return ValidationRunIdSchema.parse(raw);
}
function sendValidationError(res: Response, error: unknown): void {
  if (writeCommonRestError(res, error)) return;
  if (error instanceof BrowserExtensionBridgeError) {
    writeRestError(res, error.status, error.code, error.message);
    return;
  }
  writeInternalRestError(res);
}
function freezeRun(run: MutableValidationRun): BrowserExtensionValidationRun {
  return { ...run };
}
function characterizedStateSignals(bodyText: string): string[] {
  const signals = ['立即投递','投简历','继续沟通','已投递','已申请','选择简历','我的简历','在线简历','默认简历','附件简历','上传简历','聊一聊'];
  return signals.filter((signal) => bodyText.includes(signal));
}
function sanitizedHref(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value); return `${url.origin}${url.pathname}`.slice(0, 1000); } catch { return null; }
}
function sanitizeCharacterizationActions(value: unknown): BrowserExtensionCharacterizationEvidence['actions'] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 250).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return [{
      tag: typeof record.tag === 'string' ? record.tag.slice(0, 30) : 'other',
      text: typeof record.text === 'string' ? record.text.replace(/\s+/g, ' ').trim().slice(0, 300) : '',
      href: sanitizedHref(record.href),
      type: typeof record.type === 'string' ? record.type.slice(0, 80) : null,
      role: typeof record.role === 'string' ? record.role.slice(0, 80) : null,
      disabled: record.disabled === true,
      ariaDisabled: record.ariaDisabled === true,
    }];
  });
}
function sanitizeCharacterizationControls(value: unknown): BrowserExtensionCharacterizationEvidence['controls'] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 250).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const optionLabels = Array.isArray(record.options) ? record.options.slice(0, 50).flatMap((option) => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) return [];
      const label = (option as Record<string, unknown>).label;
      return typeof label === 'string' && label.trim() ? [label.replace(/\s+/g, ' ').trim().slice(0, 200)] : [];
    }) : [];
    return [{
      kind: typeof record.kind === 'string' ? record.kind.slice(0, 50) : 'unknown',
      label: typeof record.label === 'string' ? record.label.replace(/\s+/g, ' ').trim().slice(0, 300) : '',
      name: typeof record.name === 'string' ? record.name.slice(0, 200) : null,
      description: typeof record.description === 'string' ? record.description.replace(/\s+/g, ' ').trim().slice(0, 500) : null,
      required: record.required === true, disabled: record.disabled === true, readOnly: record.readOnly === true,
      optionLabels,
      semanticHints: Array.isArray(record.semanticHints) ? record.semanticHints.filter((hint): hint is string => typeof hint === 'string').slice(0, 20).map((hint) => hint.slice(0, 200)) : [],
      accept: typeof record.accept === 'string' ? record.accept.slice(0, 300) : null,
      multiple: record.multiple === true,
      sectionLabel: typeof record.sectionLabel === 'string' ? record.sectionLabel.replace(/\s+/g, ' ').trim().slice(0, 300) : null,
    }];
  });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BrowserExtensionBridgeError('VALIDATION_AGENT_RESULT', `Browser extension ${label} result was invalid`, 502);
  return value as Record<string, unknown>;
}
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BrowserExtensionBridgeError('VALIDATION_AGENT_RESULT', `Browser extension ${label} result was invalid`, 502);
  return value;
}
