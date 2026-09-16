import { describe, expect, it } from 'vitest';
import { createJobHarnessRestClient } from '../src';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Saved Views REST client', () => {
  it('encodes workspace filters and validates CRUD responses', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const now = '2026-09-16T12:00:00.000Z';
    const client = createJobHarnessRestClient({
      baseUrl: 'http://job-harness/api/v1',
      fetch: async (input, init) => {
        calls.push({ url: String(input), ...(init ? { init } : {}) });
        const url = String(input);
        if (url.includes('/saved-views?')) return jsonResponse({ items: [], total: 0 });
        if (init?.method === 'DELETE') return jsonResponse({ deleted: true });
        return jsonResponse({
          id: 'view-1', workspace: 'jobs', name: 'Agent', definition: { title: 'Agent' }, createdAt: now, updatedAt: now,
        });
      },
    });

    await client.savedViews.list({ workspace: 'jobs', limit: 25, offset: 50 });
    const listUrl = new URL(calls[0]!.url);
    expect(listUrl.pathname).toBe('/api/v1/saved-views');
    expect(listUrl.searchParams.get('workspace')).toBe('jobs');
    expect(listUrl.searchParams.get('limit')).toBe('25');
    expect(listUrl.searchParams.get('offset')).toBe('50');

    const saved = await client.savedViews.upsert({ id: 'view-1', workspace: 'jobs', name: 'Agent', definition: { title: 'Agent' } });
    expect(saved).toMatchObject({ id: 'view-1', workspace: 'jobs' });
    expect(calls[1]!.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({ id: 'view-1', workspace: 'jobs', name: 'Agent', definition: { title: 'Agent' } });

    expect(await client.savedViews.delete('view-1')).toEqual({ deleted: true });
    expect(calls[2]!.init?.method).toBe('DELETE');
    expect(calls[2]!.url.endsWith('/saved-views/view-1')).toBe(true);
  });
});
