import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  BrowserExtensionAgentStatusSchema,
  BrowserExtensionCommandEnvelopeSchema,
  BrowserExtensionCommandResultInputSchema,
  CreateBrowserExtensionPairingOutputSchema,
  InvokeBrowserExtensionCommandInputSchema,
  InvokeScopedBrowserExtensionCommandInputSchema,
  InvokeBrowserExtensionCommandOutputSchema,
  PollBrowserExtensionCommandInputSchema,
  PollBrowserExtensionCommandOutputSchema,
  PairBrowserExtensionAgentInputSchema,
  PairBrowserExtensionAgentOutputSchema,
  RegisterBrowserExtensionAgentInputSchema,
  type BrowserExtensionAgentRegistration,
  type BrowserExtensionAgentStatus,
  type BrowserExtensionCommandEnvelope,
  type BrowserExtensionCommandResultInput,
  type InvokeBrowserExtensionCommandInput,
  type InvokeScopedBrowserExtensionCommandInput,
  type RegisterBrowserExtensionAgentInput,
} from '@job-harness/apply-contracts';
import { BrowserExtensionAuth, BrowserExtensionAuthError } from './browser-extension-auth';

export const BROWSER_EXTENSION_BRIDGE_PREFIX = '/internal/browser-bridge/v1';

interface PendingInvocation {
  readonly agentId: string;
  readonly command: BrowserExtensionCommandEnvelope;
  readonly resolve: (value: { commandId: string; result: unknown }) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

interface AgentState {
  registration: BrowserExtensionAgentRegistration;
  readonly queue: BrowserExtensionCommandEnvelope[];
  readonly inFlight: Map<string, BrowserExtensionCommandEnvelope>;
  readonly waiters: Set<() => void>;
}

export interface BrowserExtensionBridgeOptions {
  readonly now?: () => string;
  readonly idFactory?: () => string;
  readonly agentStaleAfterMs?: number;
  readonly maxQueuedCommandsPerAgent?: number;
}

export class BrowserExtensionBridge {
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly agentStaleAfterMs: number;
  private readonly maxQueuedCommandsPerAgent: number;
  private readonly agents = new Map<string, AgentState>();
  private readonly pending = new Map<string, PendingInvocation>();
  private closed = false;

  constructor(options: BrowserExtensionBridgeOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.agentStaleAfterMs = options.agentStaleAfterMs ?? 45_000;
    this.maxQueuedCommandsPerAgent = options.maxQueuedCommandsPerAgent ?? 8;
  }

  register(raw: RegisterBrowserExtensionAgentInput): BrowserExtensionAgentStatus {
    this.assertOpen();
    const input = RegisterBrowserExtensionAgentInputSchema.parse(raw);
    const at = this.now();
    const existing = this.agents.get(input.agentId);
    const registration: BrowserExtensionAgentRegistration = {
      ...input,
      registeredAt: existing?.registration.registeredAt ?? at,
      lastSeenAt: at,
    };
    const state: AgentState = existing ?? { registration, queue: [], inFlight: new Map(), waiters: new Set() };
    state.registration = registration;
    this.agents.set(input.agentId, state);
    return this.status(input.agentId)!;
  }

  status(agentId: string): BrowserExtensionAgentStatus | null {
    const state = this.agents.get(agentId);
    if (!state) return null;
    const online = new Date(this.now()).getTime() - new Date(state.registration.lastSeenAt).getTime() <= this.agentStaleAfterMs;
    return BrowserExtensionAgentStatusSchema.parse({
      ...state.registration,
      online,
      queuedCommands: state.queue.length,
      inFlightCommands: state.inFlight.size,
    });
  }

  list(): BrowserExtensionAgentStatus[] {
    return [...this.agents.keys()].sort().map((id) => this.status(id)!).filter(Boolean);
  }

  async poll(agentId: string, waitMs: number): Promise<BrowserExtensionCommandEnvelope | null> {
    this.assertOpen();
    const state = this.requireAgent(agentId);
    this.touch(state);
    let command = this.shiftCommand(state);
    if (command) return command;
    if (waitMs <= 0) return null;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        state.waiters.delete(wake);
        resolve();
      }, waitMs);
      timer.unref();
      const wake = () => {
        clearTimeout(timer);
        state.waiters.delete(wake);
        resolve();
      };
      state.waiters.add(wake);
    });
    this.touch(state);
    command = this.shiftCommand(state);
    return command;
  }

  async invoke(raw: InvokeBrowserExtensionCommandInput): Promise<{ commandId: string; result: unknown }> {
    this.assertOpen();
    const input = InvokeBrowserExtensionCommandInputSchema.parse(raw);
    const state = this.requireOnlineAgent(input.agentId);
    this.assertCommandSupported(state, input.command.type);
    if (state.queue.length + state.inFlight.size >= this.maxQueuedCommandsPerAgent) {
      throw new BrowserExtensionBridgeError('AGENT_BUSY', `Browser extension agent '${input.agentId}' already has too many pending commands`, 409);
    }
    const createdAt = this.now();
    const expiresAt = new Date(new Date(createdAt).getTime() + input.timeoutMs).toISOString();
    const command = BrowserExtensionCommandEnvelopeSchema.parse({
      commandId: this.idFactory(),
      agentId: input.agentId,
      sessionRef: input.sessionRef ?? null,
      command: input.command,
      createdAt,
      expiresAt,
    });
    state.queue.push(command);
    for (const wake of [...state.waiters]) wake();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.commandId);
        const queuedIndex = state.queue.findIndex((candidate) => candidate.commandId === command.commandId);
        if (queuedIndex >= 0) state.queue.splice(queuedIndex, 1);
        state.inFlight.delete(command.commandId);
        reject(new BrowserExtensionBridgeError('COMMAND_TIMEOUT', `Browser extension command '${command.commandId}' timed out`, 504));
      }, input.timeoutMs);
      timer.unref();
      this.pending.set(command.commandId, { agentId: input.agentId, command, resolve, reject, timer });
    });
  }

  complete(agentId: string, raw: BrowserExtensionCommandResultInput): void {
    this.assertOpen();
    const result = BrowserExtensionCommandResultInputSchema.parse(raw);
    const state = this.requireAgent(agentId);
    this.touch(state);
    const command = state.inFlight.get(result.commandId);
    if (!command) {
      throw new BrowserExtensionBridgeError('COMMAND_NOT_FOUND', `Browser extension command '${result.commandId}' is not in flight for '${agentId}'`, 404);
    }
    const pending = this.pending.get(result.commandId);
    state.inFlight.delete(result.commandId);
    if (!pending || pending.agentId !== agentId) {
      throw new BrowserExtensionBridgeError('COMMAND_EXPIRED', `Browser extension command '${result.commandId}' no longer has a waiting caller`, 409);
    }
    clearTimeout(pending.timer);
    this.pending.delete(result.commandId);
    if (result.ok) pending.resolve(InvokeBrowserExtensionCommandOutputSchema.parse({ commandId: result.commandId, result: result.result ?? null }));
    else pending.reject(new BrowserExtensionBridgeError('REMOTE_COMMAND_FAILED', result.error ?? 'Browser extension command failed', 502));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new BrowserExtensionBridgeError('BRIDGE_CLOSED', 'Browser extension bridge closed', 503));
    }
    this.pending.clear();
    for (const state of this.agents.values()) {
      for (const wake of [...state.waiters]) wake();
      state.waiters.clear();
      state.queue.length = 0;
      state.inFlight.clear();
    }
  }

  private shiftCommand(state: AgentState): BrowserExtensionCommandEnvelope | null {
    while (state.queue.length) {
      const command = state.queue.shift()!;
      if (command.expiresAt <= this.now()) {
        const pending = this.pending.get(command.commandId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(command.commandId);
          pending.reject(new BrowserExtensionBridgeError('COMMAND_TIMEOUT', `Browser extension command '${command.commandId}' expired before delivery`, 504));
        }
        continue;
      }
      state.inFlight.set(command.commandId, command);
      return command;
    }
    return null;
  }

  private requireAgent(agentId: string): AgentState {
    const state = this.agents.get(agentId);
    if (!state) throw new BrowserExtensionBridgeError('AGENT_NOT_FOUND', `Browser extension agent '${agentId}' is not registered`, 404);
    return state;
  }

  private requireOnlineAgent(agentId: string): AgentState {
    const state = this.requireAgent(agentId);
    if (!this.status(agentId)?.online) throw new BrowserExtensionBridgeError('AGENT_OFFLINE', `Browser extension agent '${agentId}' is offline`, 503);
    return state;
  }

  private touch(state: AgentState): void {
    state.registration = { ...state.registration, lastSeenAt: this.now() };
  }

  private assertCommandSupported(state: AgentState, type: BrowserExtensionCommandEnvelope['command']['type']): void {
    if (!state.registration.capabilities.driverCommands.includes(type)) {
      throw new BrowserExtensionBridgeError('COMMAND_UNSUPPORTED', `Browser extension agent '${state.registration.agentId}' does not support '${type}'`, 422);
    }
    if (type === 'upload' && !state.registration.capabilities.resumeUpload) {
      throw new BrowserExtensionBridgeError('COMMAND_UNSUPPORTED', `Browser extension agent '${state.registration.agentId}' does not support Resume upload`, 422);
    }
    if (type === 'screenshot' && !state.registration.capabilities.screenshots) {
      throw new BrowserExtensionBridgeError('COMMAND_UNSUPPORTED', `Browser extension agent '${state.registration.agentId}' does not support screenshots`, 422);
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new BrowserExtensionBridgeError('BRIDGE_CLOSED', 'Browser extension bridge is closed', 503);
  }
}

export class BrowserExtensionBridgeError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'BrowserExtensionBridgeError';
  }
}

export interface BrowserExtensionBridgeApiOptions {
  readonly auth: BrowserExtensionAuth | null;
  readonly authorizeInvoke: (input: InvokeScopedBrowserExtensionCommandInput) => Promise<void>;
}

export function registerBrowserExtensionBridgeApi(app: Express, bridge: BrowserExtensionBridge, options: BrowserExtensionBridgeApiOptions): void {
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/pairings`, route(async (_req, res) => {
    if (!options.auth) throw new BrowserExtensionBridgeError('PAIRING_DISABLED', 'Browser extension pairing is not configured', 503);
    res.status(201).json(CreateBrowserExtensionPairingOutputSchema.parse(options.auth.createPairing()));
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/pair`, route(async (req, res) => {
    if (!options.auth) throw new BrowserExtensionBridgeError('PAIRING_DISABLED', 'Browser extension pairing is not configured', 503);
    const input = PairBrowserExtensionAgentInputSchema.parse(req.body);
    const { pairingCode, ...registration } = input;
    let token;
    try { token = options.auth.exchangePairing(pairingCode, registration.agentId); }
    catch (error) { if (error instanceof BrowserExtensionAuthError) throw new BrowserExtensionBridgeError(error.code, error.message, error.status); throw error; }
    const agent = bridge.register(RegisterBrowserExtensionAgentInputSchema.parse(registration));
    res.status(201).json(PairBrowserExtensionAgentOutputSchema.parse({ ...token, agent }));
  }));
  app.get(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/agents`, (_req, res) => {
    res.json({ items: bridge.list() });
  });
  app.get(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/agents/:agentId/status`, (req, res) => {
    const result = bridge.status(pathId(req.params.agentId));
    if (!result) { res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Browser extension agent was not found' } }); return; }
    res.json(result);
  });
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/agents/register`, route(async (req, res) => {
    res.json(bridge.register(RegisterBrowserExtensionAgentInputSchema.parse(req.body)));
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/agents/:agentId/poll`, route(async (req, res) => {
    const input = PollBrowserExtensionCommandInputSchema.parse(req.body ?? {});
    const command = await bridge.poll(pathId(req.params.agentId), input.waitMs);
    res.json(PollBrowserExtensionCommandOutputSchema.parse({ command }));
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/agents/:agentId/results`, route(async (req, res) => {
    bridge.complete(pathId(req.params.agentId), BrowserExtensionCommandResultInputSchema.parse(req.body));
    res.status(204).end();
  }));
  app.post(`${BROWSER_EXTENSION_BRIDGE_PREFIX}/invoke`, route(async (req, res) => {
    const input = InvokeScopedBrowserExtensionCommandInputSchema.parse(req.body);
    await options.authorizeInvoke(input);
    res.json(await bridge.invoke(InvokeBrowserExtensionCommandInputSchema.parse({
      agentId: input.agentId,
      sessionRef: input.sessionRef,
      command: input.command,
      timeoutMs: input.timeoutMs,
    })));
  }));
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
function route(handler: AsyncHandler) {
  return (req: Request, res: Response) => { void handler(req, res).catch((error) => sendError(res, error)); };
}
function pathId(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id || id.length > 200) throw new BrowserExtensionBridgeError('VALIDATION_ERROR', 'Invalid path identifier', 400);
  return id;
}
function sendError(res: Response, error: unknown): void {
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
