import {
  BossGreetingResolveToolInputSchema,
  BossGreetingResolveToolOutputSchema,
  BossGreetingsPendingToolInputSchema,
  BossGreetingsPendingToolOutputSchema,
  BossGreetingRequestSchema,
  type BossGreetingMcpPort,
} from '@job-harness/mcp';
import { z } from 'zod';

const BridgePendingResponseSchema = z.object({
  ok: z.literal(true),
  mode: z.literal('chatgpt-assisted'),
  total: z.number().int().nonnegative(),
  items: z.array(BossGreetingRequestSchema),
}).strict();

const BridgeResolveResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string().uuid(),
  action: z.enum(['send', 'skip']),
  source: z.string().trim().min(1).max(80),
}).strict();

export interface BossGreetingMcpBridgeOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly requestTimeoutMs?: number;
}

function normalizeInternalBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:') throw new Error('BOSS greeting MCP bridge must use private/internal HTTP');
  if (url.username || url.password) throw new Error('BOSS greeting MCP bridge URL must not contain credentials');
  return url.toString().replace(/\/+$/, '');
}

export function createBossGreetingMcpBridge(options: BossGreetingMcpBridgeOptions): BossGreetingMcpPort {
  const baseUrl = normalizeInternalBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const requestTimeoutMs = Math.max(1_000, Math.min(30_000, options.requestTimeoutMs ?? 5_000));

  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          accept: 'application/json',
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
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
    async resolve(input) {
      const parsed = BossGreetingResolveToolInputSchema.parse(input);
      const body = parsed.action === 'send'
        ? { action: 'send', message: parsed.message, source: 'chatgpt-web-mcp' }
        : { action: 'skip', reason: parsed.reason, source: 'chatgpt-web-mcp' };
      const response = BridgeResolveResponseSchema.parse(await request(
        `/api/greetings/${encodeURIComponent(parsed.id)}/resolve`,
        { method: 'POST', body: JSON.stringify(body) },
      ));
      return BossGreetingResolveToolOutputSchema.parse({ ...response, source: 'chatgpt-web-mcp' });
    },
  };
}
