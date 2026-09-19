import { describe, expect, it, vi } from 'vitest';
import { createBossGreetingMcpBridge } from '../src/boss-greeting-mcp';

const request = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  createdAt: '2026-09-19T13:00:00.000Z',
  expiresAt: '2026-09-19T13:03:00.000Z',
  requestedProfileId: 'ai-frontend',
  job: {
    title: '前端开发工程师',
    salary: '12-18K',
    description: '负责 React/TypeScript Web 前端开发。',
    company: '示例科技',
    city: '深圳',
    jobUrl: 'https://www.zhipin.com/job_detail/abc123.html',
    externalId: 'abc123',
    screeningSessionId: 'screen-1',
  },
  match: {
    score: 82,
    profileId: 'ai-frontend',
    profileLabel: '前端开发工程师',
    resumeIndex: 1,
    decision: 'strong-match' as const,
    signals: ['React', 'TypeScript'],
  },
  candidate: { education: [{ school: '四川农业大学' }], projects: [] },
  guidance: ['只使用真实简历事实。'],
};

describe('BOSS greeting MCP loopback bridge', () => {
  it('lists bounded pending requests from the loopback compatibility runtime', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      mode: 'chatgpt-assisted',
      total: 2,
      items: [request, { ...request, id: '123e4567-e89b-42d3-a456-426614174001' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const bridge = createBossGreetingMcpBridge({ baseUrl: 'http://127.0.0.1:18788', fetch: fetch as typeof globalThis.fetch });

    await expect(bridge.listPending({ limit: 1 })).resolves.toEqual({
      mode: 'chatgpt-assisted',
      total: 2,
      items: [request],
    });
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:18788/api/greetings/pending', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('resolves send with a fixed ChatGPT MCP provenance marker', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body).toEqual({ action: 'send', message: '您好，我有 React 与 TypeScript 项目经验，希望进一步沟通。', source: 'chatgpt-web-mcp' });
      return new Response(JSON.stringify({ ok: true, id: request.id, action: 'send', source: 'chatgpt-web-mcp' }), { status: 200 });
    });
    const bridge = createBossGreetingMcpBridge({ baseUrl: 'http://localhost:18788', fetch: fetch as typeof globalThis.fetch });

    await expect(bridge.resolve({
      id: request.id,
      action: 'send',
      message: '您好，我有 React 与 TypeScript 项目经验，希望进一步沟通。',
    })).resolves.toEqual({ ok: true, id: request.id, action: 'send', source: 'chatgpt-web-mcp' });
  });

  it('accepts private Compose DNS but refuses HTTPS or credential-bearing bridge URLs', () => {
    expect(() => createBossGreetingMcpBridge({ baseUrl: 'http://boss-bridge:18788' })).not.toThrow();
    expect(() => createBossGreetingMcpBridge({ baseUrl: 'https://oracle.example:10444' })).toThrow(/internal HTTP/);
    expect(() => createBossGreetingMcpBridge({ baseUrl: 'http://user:secret@boss-bridge:18788' })).toThrow(/credentials/);
  });
});
