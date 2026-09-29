import { BossGreetingRequestSchema } from '@job-harness/mcp';
import { z } from 'zod';

export const BossGreetingProviderResolutionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), message: z.string().trim().min(12).max(320), source: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal('skip'), reason: z.string().trim().min(3).max(240), source: z.string().trim().min(1).max(80) }).strict(),
]);

const RawProviderResolutionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), message: z.string().trim().min(12).max(320) }).passthrough(),
  z.object({ action: z.literal('skip'), reason: z.string().trim().min(3).max(240) }).passthrough(),
]);

const OpenAIChatResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.union([
      z.string(),
      z.array(z.object({ type: z.string().optional(), text: z.string().optional() }).passthrough()),
    ]).nullable() }).passthrough(),
  }).passthrough()).min(1),
}).passthrough();

export type BossGreetingProviderResolution = z.infer<typeof BossGreetingProviderResolutionSchema>;
export type BossGreetingProviderRequest = z.infer<typeof BossGreetingRequestSchema>;

export interface BossGreetingProvider {
  readonly providerId: string;
  resolve(request: BossGreetingProviderRequest, timeoutMs: number): Promise<BossGreetingProviderResolution>;
}

export interface OpenAICompatibleBossGreetingProviderOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly source?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Greeting provider base URL must use HTTP(S)');
  if (url.username || url.password) throw new Error('Greeting provider base URL must not contain credentials');
  return url.toString().replace(/\/+$/, '');
}

function compactProviderSource(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function extractMessageContent(value: z.infer<typeof OpenAIChatResponseSchema>): string {
  const content = value.choices[0]!.message.content;
  if (typeof content === 'string') return content.trim();
  return content?.map((item) => item.text ?? '').join('').trim() ?? '';
}

function parseJsonObject(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(normalized) as unknown; } catch {}
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(normalized.slice(start, end + 1)) as unknown;
  throw new Error('Greeting provider did not return a JSON object');
}

function providerPrompt(request: BossGreetingProviderRequest): { system: string; user: string } {
  const system = [
    '你是求职系统的首次招呼语解析器，只能根据提供的 JD、匹配结果和真实简历上下文做决定。',
    '只能输出 JSON 对象，不要 Markdown，不要解释。',
    '合适时输出 {"action":"send","message":"最终中文招呼语"}；核心要求明显不匹配时输出 {"action":"skip","reason":"简短原因"}。',
    ...request.guidance,
  ].join('\n');
  const user = JSON.stringify({
    job: request.job,
    match: request.match,
    candidate: request.candidate,
  });
  return { system, user };
}

function providerErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') return message.replace(/\s+/g, ' ').trim().slice(0, 500);
  }
  if (typeof error === 'string') return error.replace(/\s+/g, ' ').trim().slice(0, 500);
  return null;
}

export function createOpenAICompatibleBossGreetingProvider(options: OpenAICompatibleBossGreetingProviderOptions): BossGreetingProvider {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  if (!apiKey) throw new Error('Greeting provider API key is required');
  if (!model) throw new Error('Greeting provider model is required');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const source = compactProviderSource(options.source?.trim() || `openai-compatible:${model}`);
  if (!source) throw new Error('Greeting provider source is required');
  const temperature = Math.max(0, Math.min(1, options.temperature ?? 0.2));
  const maxTokens = Math.max(96, Math.min(512, Math.trunc(options.maxTokens ?? 220)));

  const call = async (request: BossGreetingProviderRequest, timeoutMs: number, structured = true): Promise<BossGreetingProviderResolution> => {
    const prompt = providerPrompt(request);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
    timer.unref?.();
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(structured ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = providerErrorMessage(payload);
        const error = new Error(`Greeting provider HTTP ${response.status}${message ? `: ${message}` : ''}`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }
      const parsed = OpenAIChatResponseSchema.parse(payload);
      const raw = RawProviderResolutionSchema.parse(parseJsonObject(extractMessageContent(parsed)));
      return raw.action === 'send'
        ? BossGreetingProviderResolutionSchema.parse({ action: 'send', message: raw.message, source })
        : BossGreetingProviderResolutionSchema.parse({ action: 'skip', reason: raw.reason, source });
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    providerId: source,
    async resolve(request, timeoutMs) {
      try {
        return await call(request, timeoutMs, true);
      } catch (error) {
        const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status?: unknown }).status) : null;
        if (status === 400 || status === 404 || status === 422) return call(request, timeoutMs, false);
        throw error;
      }
    },
  };
}
