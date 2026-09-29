import {
  BossGreetingResolveToolInputSchema,
  BossGreetingResolveToolOutputSchema,
  BossGreetingResolverReadyToolInputSchema,
  BossGreetingResolverReadyToolOutputSchema,
  BossGreetingClaimToolInputSchema,
  BossGreetingClaimToolOutputSchema,
  BossGreetingsPendingToolInputSchema,
  BossGreetingsPendingToolOutputSchema,
  BossGreetingRequestSchema,
  BossRuntimeStatusToolInputSchema,
  BossRuntimeStatusToolOutputSchema,
  BossRuntimeStartToolInputSchema,
  BossRuntimeStartToolOutputSchema,
  BossRuntimePauseToolInputSchema,
  BossRuntimePauseToolOutputSchema,
  type BossGreetingMcpPort,
  type BossRuntimeMcpPort,
} from '@job-harness/mcp';
import { z } from 'zod';
import {
  RecruitmentRuntimeControlSnapshotSchema,
  RecruitmentRuntimeDescriptorSchema,
  RecruitmentRuntimeEventSchema,
  RecruitmentRuntimeHealthSchema,
} from '@job-harness/recruitment-runtime-contracts';

const BridgePendingResponseSchema = z.object({
  ok: z.literal(true),
  mode: z.literal('chatgpt-assisted'),
  total: z.number().int().nonnegative(),
  items: z.array(BossGreetingRequestSchema),
}).strict();

const BridgeResolverReadyResponseSchema = z.object({
  ok: z.literal(true),
  mode: z.literal('interactive-priority'),
  resolver: z.object({
    owner: z.string().trim().min(3).max(120),
    readyAt: z.iso.datetime({ offset: true }),
    readyUntil: z.iso.datetime({ offset: true }),
  }).strict(),
  interactivePriorityMs: z.number().int().min(1_000).max(30_000),
}).strict();

const BridgeClaimResponseSchema = z.object({
  ok: z.literal(true),
  mode: z.literal('leased-chatgpt-assisted'),
  claim: z.object({
    request: BossGreetingRequestSchema,
    leaseToken: z.string().uuid(),
    owner: z.string().trim().min(3).max(120),
    resolverClass: z.enum(['interactive', 'background']),
    claimedAt: z.iso.datetime({ offset: true }),
    leaseExpiresAt: z.iso.datetime({ offset: true }),
  }).strict().nullable(),
}).strict();

const BridgeResolveResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string().uuid(),
  action: z.enum(['send', 'skip']),
  source: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(240).nullable().optional(),
}).strict();

const BridgeRuntimeEventsResponseSchema = z.object({
  runtimeId: z.string().trim().min(1).max(120),
  total: z.number().int().nonnegative(),
  items: z.array(RecruitmentRuntimeEventSchema),
}).strict();

export interface BossGreetingMcpBridgeOptions {
  readonly baseUrl: string;
  readonly controlToken?: string | null;
  readonly fetch?: typeof globalThis.fetch;
  readonly requestTimeoutMs?: number;
}

function normalizeInternalBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:') throw new Error('BOSS greeting MCP bridge must use private/internal HTTP');
  if (url.username || url.password) throw new Error('BOSS greeting MCP bridge URL must not contain credentials');
  return url.toString().replace(/\/+$/, '');
}

export function createBossGreetingMcpBridge(options: BossGreetingMcpBridgeOptions): BossGreetingMcpPort & BossRuntimeMcpPort {
  const baseUrl = normalizeInternalBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const controlToken = options.controlToken?.trim() || null;
  const requestTimeoutMs = Math.max(1_000, Math.min(30_000, options.requestTimeoutMs ?? 5_000));

  const request = async (path: string, init?: RequestInit, privileged = false): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          accept: 'application/json',
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
          ...(privileged && controlToken ? { authorization: `Bearer ${controlToken}` } : {}),
          ...init?.headers,
        },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : `http_${response.status}`;
        throw new Error(`BOSS greeting bridge request failed: ${detail}`);
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    async listPending(input) {
      const parsed = BossGreetingsPendingToolInputSchema.parse(input);
      const response = BridgePendingResponseSchema.parse(await request('/api/greetings/pending'));
      return BossGreetingsPendingToolOutputSchema.parse({
        mode: response.mode,
        total: response.total,
        items: response.items.slice(0, parsed.limit),
      });
    },
    async ready(input) {
      if (!controlToken) throw new Error('BOSS greeting resolver-ready token is not configured');
      const parsed = BossGreetingResolverReadyToolInputSchema.parse(input);
      const response = BridgeResolverReadyResponseSchema.parse(await request('/api/greetings/resolver-ready', {
        method: 'POST',
        body: JSON.stringify({ owner: parsed.owner, readyMs: parsed.readySeconds * 1_000 }),
      }, true));
      return BossGreetingResolverReadyToolOutputSchema.parse({
        mode: response.mode,
        resolver: response.resolver,
        interactivePriorityMs: response.interactivePriorityMs,
      });
    },
    async claim(input) {
      if (!controlToken) throw new Error('BOSS greeting claim token is not configured');
      const parsed = BossGreetingClaimToolInputSchema.parse(input);
      const response = BridgeClaimResponseSchema.parse(await request('/api/greetings/claim', {
        method: 'POST',
        body: JSON.stringify({ owner: parsed.owner, resolverClass: 'interactive', leaseMs: parsed.leaseSeconds * 1_000 }),
      }, true));
      return BossGreetingClaimToolOutputSchema.parse({ mode: response.mode, claim: response.claim });
    },
    async resolve(input) {
      const parsed = BossGreetingResolveToolInputSchema.parse(input);
      const body = parsed.action === 'send'
        ? { action: 'send', message: parsed.message, leaseToken: parsed.leaseToken, source: 'chatgpt-web-mcp' }
        : { action: 'skip', reason: parsed.reason, leaseToken: parsed.leaseToken, source: 'chatgpt-web-mcp' };
      const response = BridgeResolveResponseSchema.parse(await request(
        `/api/greetings/${encodeURIComponent(parsed.id)}/resolve`,
        { method: 'POST', body: JSON.stringify(body) },
      ));
      return BossGreetingResolveToolOutputSchema.parse({
        ...response,
        source: response.source === 'job-harness-policy' ? 'job-harness-policy' : 'chatgpt-web-mcp',
      });
    },
    async status(input) {
      const parsed = BossRuntimeStatusToolInputSchema.parse(input);
      const [descriptor, health, control, events] = await Promise.all([
        request('/api/runtime/descriptor').then((value) => RecruitmentRuntimeDescriptorSchema.parse(value)),
        request('/api/runtime/health').then((value) => RecruitmentRuntimeHealthSchema.parse(value)),
        request('/api/runtime/control').then((value) => RecruitmentRuntimeControlSnapshotSchema.parse(value)),
        request(`/api/runtime/events?limit=${parsed.eventsLimit}`).then((value) => BridgeRuntimeEventsResponseSchema.parse(value)),
      ]);
      return BossRuntimeStatusToolOutputSchema.parse({ descriptor, health, control, events: events.items });
    },
    async start(input) {
      if (!controlToken) throw new Error('BOSS Site Runtime control token is not configured');
      const parsed = BossRuntimeStartToolInputSchema.parse(input);
      const response = await request('/api/runtime/tasks/start', {
        method: 'POST',
        body: JSON.stringify(parsed),
      }, true);
      return BossRuntimeStartToolOutputSchema.parse(response);
    },
    async pause(input) {
      if (!controlToken) throw new Error('BOSS Site Runtime control token is not configured');
      const parsed = BossRuntimePauseToolInputSchema.parse(input);
      const response = await request(`/api/runtime/tasks/${encodeURIComponent(parsed.taskId)}/pause`, {
        method: 'POST',
        body: JSON.stringify({ reason: parsed.reason }),
      }, true);
      return BossRuntimePauseToolOutputSchema.parse(response);
    },
  };
}
