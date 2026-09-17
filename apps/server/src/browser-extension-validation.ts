import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z, ZodError } from 'zod';
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

const ValidationRunIdSchema = z.string().trim().min(1).max(200);
const CreateValidationRunInputSchema = z.object({
  agentId: z.string().trim().min(1).max(200),
  targetUrl: z.url(),
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
const WRITE_VALIDATION_COMMANDS = new Set<BrowserExtensionDriverCommand['type']>(['fill', 'select', 'set_checked', 'upload']);

export interface BrowserExtensionValidationRun {
  readonly id: string;
  readonly agentId: string;
  readonly targetUrl: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly sessionRef: string | null;
  readonly commandCount: number;
  readonly writeCount: number;
}

interface MutableValidationRun {
  id: string;
  agentId: string;
  targetUrl: string;
  createdAt: string;
  expiresAt: string;
  sessionRef: string | null;
  commandCount: number;
  writeCount: number;
}

export class BrowserExtensionValidationRegistry {
  private readonly runs = new Map<string, MutableValidationRun>();
  private readonly allowedOrigin: string;
  private readonly now: () => Date;

  constructor(
    private readonly bridge: BrowserExtensionBridge,
    options: { allowedOrigin: string; now?: () => Date },
  ) {
    const origin = new URL(options.allowedOrigin).origin;
    if (!/^https?:\/\//i.test(origin)) throw new Error('Browser validation allowed origin must use HTTP(S)');
    this.allowedOrigin = origin;
    this.now = options.now ?? (() => new Date());
  }

  create(raw: unknown): BrowserExtensionValidationRun {
    this.reap();
    const input = CreateValidationRunInputSchema.parse(raw);
    const target = this.validateTarget(input.targetUrl);
    const agent = this.bridge.status(input.agentId);
    if (!agent?.online) throw new BrowserExtensionBridgeError('AGENT_OFFLINE', `Browser extension agent '${input.agentId}' is offline`, 503);
    const createdAt = this.now().toISOString();
    const run: MutableValidationRun = {
      id: randomUUID(),
      agentId: input.agentId,
      targetUrl: target,
      createdAt,
      expiresAt: new Date(this.now().getTime() + input.ttlMs).toISOString(),
      sessionRef: null,
      commandCount: 0,
      writeCount: 0,
    };
    this.runs.set(run.id, run);
    return freezeRun(run);
  }

  get(id: string): BrowserExtensionValidationRun | null {
    this.reap();
    const run = this.runs.get(ValidationRunIdSchema.parse(id));
    return run ? freezeRun(run) : null;
  }

  async invoke(id: string, raw: unknown): Promise<{ run: BrowserExtensionValidationRun; commandId: string; result: unknown }> {
    this.reap();
    const run = this.requireRun(id);
    const input = InvokeValidationCommandInputSchema.parse(raw);
    if (!SAFE_VALIDATION_COMMANDS.has(input.command.type)) {
      throw new BrowserExtensionBridgeError('VALIDATION_COMMAND_DENIED', `Browser validation does not allow '${input.command.type}'`, 403);
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
      if (!preferred || this.validateTarget(preferred) !== run.targetUrl) {
        throw new BrowserExtensionBridgeError('VALIDATION_TARGET_MISMATCH', 'Browser validation session must acquire the frozen canary URL', 409);
      }
      if (input.command.payload.reuseLiveSession) {
        throw new BrowserExtensionBridgeError('VALIDATION_REUSE_DENIED', 'Browser validation must create an isolated Chrome tab', 403);
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
      if (!this.sameTarget(currentUrl, run.targetUrl)) {
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
    if (!this.sameTarget(requireString(current.result, 'current_url'), run.targetUrl)) {
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

  private validateTarget(raw: string): string {
    const url = new URL(raw);
    if (url.origin !== this.allowedOrigin || url.pathname !== '/labs/apply-canary') {
      throw new BrowserExtensionBridgeError('VALIDATION_TARGET_DENIED', 'Browser validation target must be the configured synthetic ATS canary route', 403);
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

  private sameTarget(left: string, right: string): boolean {
    try { return this.validateTarget(left) === this.validateTarget(right); }
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
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: error.issues } });
    return;
  }
  if (error instanceof BrowserExtensionBridgeError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
function freezeRun(run: MutableValidationRun): BrowserExtensionValidationRun {
  return { ...run };
}
function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BrowserExtensionBridgeError('VALIDATION_AGENT_RESULT', `Browser extension ${label} result was invalid`, 502);
  return value as Record<string, unknown>;
}
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BrowserExtensionBridgeError('VALIDATION_AGENT_RESULT', `Browser extension ${label} result was invalid`, 502);
  return value;
}
