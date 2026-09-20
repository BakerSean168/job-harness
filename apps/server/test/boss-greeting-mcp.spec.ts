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

  it('controls the coarse BOSS Site Runtime through the private bridge with a scoped bearer', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const control = { task: null, desiredState: 'paused', updatedAt: '2026-09-20T06:00:00.000Z', reason: null };
    const descriptor = {
      runtimeId: 'boss-czc-good-job', runtimeVersion: 'e07bf4cb663d+jh-overlay-v1', site: 'boss', implementation: 'upstream-direct',
      upstream: { project: 'czc-good-job', repository: 'https://github.com/czc6666/czc-good-job.git', commit: 'e07bf4cb663d9531864ca22eb6195b77e064c3b5', license: 'MIT' },
      capabilities: ['discovery', 'inspect-job', 'outreach-greeting', 'recruiter-inbox', 'resume-followup'], browserProfile: 'dedicated', controlGranularity: 'business-task',
    };
    const health = {
      runtimeId: 'boss-czc-good-job', site: 'boss', state: 'ready', browserConnected: true, activeTaskId: null,
      lastEventAt: '2026-09-20T06:00:00.000Z', detail: 'runtime-control-poll-active', checkedAt: '2026-09-20T06:00:01.000Z',
    };
    const started = {
      task: {
        id: 'boss-runtime-task-1', runtimeId: 'boss-czc-good-job', site: 'boss', kind: 'campaign-discovery', campaignId: 'campaign-1', jobId: null, listingId: null,
        resumeProfileId: null, resumeArtifactId: null, targetUrl: 'https://www.zhipin.com/web/geek/job',
        policy: { collect: true, greeting: true, recruiterInbox: true, resumeFollowup: true, formFill: false, resumeUpload: false, finalSubmit: false, maxExternalEffects: 20 },
        createdAt: '2026-09-20T06:00:00.000Z', expiresAt: null, idempotencyKey: 'runtime-run-1',
      },
      desiredState: 'running', updatedAt: '2026-09-20T06:00:00.000Z', reason: null,
    };
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init });
      if (url.endsWith('/api/runtime/descriptor')) return new Response(JSON.stringify(descriptor), { status: 200 });
      if (url.endsWith('/api/runtime/health')) return new Response(JSON.stringify(health), { status: 200 });
      if (url.endsWith('/api/runtime/control')) return new Response(JSON.stringify(control), { status: 200 });
      if (url.includes('/api/runtime/events?limit=')) return new Response(JSON.stringify({ runtimeId: 'boss-czc-good-job', total: 0, items: [] }), { status: 200 });
      if (url.endsWith('/api/runtime/tasks/start')) return new Response(JSON.stringify(started), { status: 200 });
      if (url.endsWith('/api/runtime/tasks/boss-runtime-task-1/pause')) return new Response(JSON.stringify({ ...started, desiredState: 'paused', reason: 'test-pause' }), { status: 200 });
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    });
    const bridge = createBossGreetingMcpBridge({ baseUrl: 'http://boss-bridge:18788', controlToken: 'runtime-secret', fetch: fetch as typeof globalThis.fetch });

    await expect(bridge.status({ eventsLimit: 5 })).resolves.toMatchObject({ descriptor: { runtimeId: 'boss-czc-good-job' }, health, control, events: [] });
    await expect(bridge.start({ mode: 'manual', idempotencyKey: 'runtime-run-1' })).resolves.toMatchObject({ desiredState: 'running', task: { id: 'boss-runtime-task-1' } });
    await expect(bridge.pause({ taskId: 'boss-runtime-task-1', reason: 'test-pause' })).resolves.toMatchObject({ desiredState: 'paused', reason: 'test-pause' });
    const privileged = calls.filter((call) => call.url.includes('/api/runtime/tasks/'));
    expect(privileged).toHaveLength(2);
    for (const call of privileged) expect(new Headers(call.init?.headers).get('authorization')).toBe('Bearer runtime-secret');
    const reads = calls.filter((call) => call.url.includes('/api/runtime/descriptor') || call.url.includes('/api/runtime/health') || call.url.includes('/api/runtime/control') || call.url.includes('/api/runtime/events'));
    for (const call of reads) expect(new Headers(call.init?.headers).get('authorization')).toBeNull();
  });

  it('accepts private Compose DNS but refuses HTTPS or credential-bearing bridge URLs', () => {
    expect(() => createBossGreetingMcpBridge({ baseUrl: 'http://boss-bridge:18788' })).not.toThrow();
    expect(() => createBossGreetingMcpBridge({ baseUrl: 'https://oracle.example:10444' })).toThrow(/internal HTTP/);
    expect(() => createBossGreetingMcpBridge({ baseUrl: 'http://user:secret@boss-bridge:18788' })).toThrow(/credentials/);
  });
});
