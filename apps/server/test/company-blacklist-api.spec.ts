import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
afterEach(async () => { if (running) await running.close(); if (dir) await rm(dir, { force: true, recursive: true }); running = null; dir = null; });

describe('company blacklist REST', () => {
  it('supports authenticated list, create, disable and delete', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-company-blacklist-api-'));
    running = await startJobHarnessServer({
      databasePath: join(dir, 'career.db'), host: '127.0.0.1', port: 0, authToken: 'test-block',
    });
    const path = running.apiUrl + '/company-blacklist';
    const headers = { authorization: 'Bearer test-block', 'content-type': 'application/json' };
    expect((await fetch(path)).status).toBe(401);
    expect((await fetch(path + '/check', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyName: '外企德科数字技术有限公司' }),
    })).status).toBe(401);
    const preflight = async (companyName: string) => {
      const response = await fetch(path + '/check', {
        method: 'POST', headers, body: JSON.stringify({ companyName }),
      });
      expect(response.status).toBe(200);
      return response.json();
    };
    expect(await preflight('外企德科数字技术有限公司')).toEqual({
      companyName: '外企德科数字技术有限公司', blocked: false, rule: null,
    });
    const invalid = await fetch(path + '/check', {
      method: 'POST', headers, body: JSON.stringify({ companyName: ' ' }),
    });
    expect(invalid.status).toBe(400);
    const empty = await fetch(path, { headers });
    expect(await empty.json()).toEqual({ items: [] });
    const create = await fetch(path, { method: 'POST', headers, body: JSON.stringify({
      pattern: '外企德科', matchMode: 'contains', category: 'hr_agency', note: 'No more listings',
    }) });
    expect(create.status).toBe(200);
    const rule = await create.json() as { id: string };
    expect(rule.id).toBeTruthy();
    expect(await preflight('外企德科数字技术有限公司')).toMatchObject({
      companyName: '外企德科数字技术有限公司', blocked: true, rule: {
        id: rule.id, pattern: '外企德科', matchMode: 'contains', active: true,
      },
    });
    expect(await preflight('浙江外企德科人力资源服务有限公司')).toMatchObject({ blocked: true });
    expect(await preflight('星德科包装技术(杭州)有限公司')).toEqual({
      companyName: '星德科包装技术(杭州)有限公司', blocked: false, rule: null,
    });
    const disabled = await fetch(path, { method: 'POST', headers, body: JSON.stringify({
      id: rule.id, pattern: '外企德科', matchMode: 'contains', category: 'hr_agency', active: false,
    }) });
    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toMatchObject({ active: false, id: rule.id });
    expect(await preflight('外企德科数字技术有限公司')).toMatchObject({ blocked: false, rule: null });
    const deleted = await fetch(path + '/' + rule.id, { method: 'DELETE', headers });
    expect(await deleted.json()).toEqual({ deleted: true });
  });
});
