import { describe, expect, it, vi } from 'vitest';
import { createOpenAICompatibleBossGreetingProvider } from '../src/boss-greeting-provider';

const request = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  createdAt: '2026-09-29T04:00:00.000Z',
  expiresAt: '2026-09-29T04:00:35.000Z',
  requestedProfileId: 'ai-frontend',
  job: {
    title: '前端开发工程师', salary: '10-14K', description: '负责 Vue3、TypeScript Web 前端开发。', company: '示例科技', city: '深圳',
    jobUrl: 'https://www.zhipin.com/job_detail/abc123.html', externalId: 'abc123', screeningSessionId: 'screen-1',
  },
  match: { score: 76, profileId: 'ai-frontend', profileLabel: '前端开发工程师', resumeIndex: 1, decision: 'strong-match' as const, signals: ['Vue3', 'TypeScript'] },
  candidate: { targetRole: '前端开发工程师', matchedSignals: ['Vue3', 'TypeScript'], projects: [] },
  guidance: ['不得编造候选人未提供的经历。', '默认不要主动提学校、专业或应届身份。'],
};

describe('OpenAI-compatible BOSS greeting provider', () => {
  it('generates a bounded send resolution and fixes provider provenance server-side', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer provider-secret');
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body).toMatchObject({ model: 'deepseek-v4-flash', temperature: 0.2, max_tokens: 220, response_format: { type: 'json_object' } });
      expect(body.messages[0].content).toContain('不得编造候选人未提供的经历');
      expect(body.messages[1].content).toContain('Vue3');
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"send","message":"您好，看到贵司前端开发岗位，我有 Vue3 和 TypeScript 项目实践，希望有机会进一步沟通，谢谢。","source":"model-forged"}' } }] }), { status: 200 });
    });
    const provider = createOpenAICompatibleBossGreetingProvider({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'provider-secret', model: 'deepseek-v4-flash', source: 'deepseek-v4-flash', fetch: fetch as typeof globalThis.fetch });
    await expect(provider.resolve(request, 5_000)).resolves.toEqual({
      action: 'send',
      message: '您好，看到贵司前端开发岗位，我有 Vue3 和 TypeScript 项目实践，希望有机会进一步沟通，谢谢。',
      source: 'deepseek-v4-flash',
    });
  });

  it('supports skip and retries once without response_format when a compatible provider rejects structured mode', async () => {
    const calls: any[] = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')); calls.push(body);
      if (calls.length === 1) return new Response(JSON.stringify({ error: { message: 'response_format unsupported' } }), { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"action":"skip","reason":"岗位要求的核心能力与当前真实经历不匹配"}\n```' } }] }), { status: 200 });
    });
    const provider = createOpenAICompatibleBossGreetingProvider({ baseUrl: 'https://provider.example/v1/', apiKey: 'provider-secret', model: 'fast-model', fetch: fetch as typeof globalThis.fetch });
    await expect(provider.resolve(request, 5_000)).resolves.toEqual({ action: 'skip', reason: '岗位要求的核心能力与当前真实经历不匹配', source: 'openai-compatible:fast-model' });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveProperty('response_format');
    expect(calls[1]).not.toHaveProperty('response_format');
  });

  it('never places the API key in the request body', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain('provider-secret');
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"send","message":"您好，我有 Vue3 与 TypeScript 项目实践，希望进一步沟通，谢谢。"}' } }] }), { status: 200 });
    });
    const provider = createOpenAICompatibleBossGreetingProvider({ baseUrl: 'https://provider.example/v1', apiKey: 'provider-secret', model: 'fast-model', fetch: fetch as typeof globalThis.fetch });
    await provider.resolve(request, 5_000);
  });
});
