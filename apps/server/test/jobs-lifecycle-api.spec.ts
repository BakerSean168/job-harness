import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { runCampaignLifecycleSweep, SqliteCareerStore } from '@job-harness/persistence-sqlite';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let dir: string | null = null;
let running: RunningJobHarnessServer | null = null;
afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
});

describe('Job lifecycle REST query contract', () => {
  it('passes includeCampaignArchived through API parsing to scoped SQLite results', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-lifecycle-rest-'));
    const databasePath = join(dir, 'career.db');
    const store = new SqliteCareerStore(databasePath);
    const career = createCareerApplicationService(store, { now: () => '2026-10-01T00:00:00Z' });
    try {
      await career.campaigns.upsertCampaign({
        id: 'grad', name: 'Graduate', targetRoles: ['Frontend'],
        cities: ['Hangzhou'], graduationYears: [2026], experience: [],
        keywords: [], exclusions: [], sources: ['official'], resumeProfileIds: [], status: 'active',
      });
      const run = await career.discovery.beginDiscoveryRun({
        campaignId: 'grad', executor: 'manual', contextSnapshot: {},
        startedAt: '2026-10-01T00:00:00Z', idempotencyKey: 'grad-run',
      });
      await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Deadline Test', title: 'Frontend Developer', city: 'Hangzhou',
        observedAt: '2026-10-01T00:00:00Z', discoveryRunId: run.id,
        listings: [{
          sourceKind: 'official', identityKind: 'url', url: 'https://example.com/jobs/grad',
          status: 'active', applicationDeadline: {
            precision: 'date', date: '2026-10-01', timeZone: 'Asia/Shanghai',
            sourceText: 'Deadline Oct 1', sourceUrl: 'https://example.com/jobs/grad',
            observedAt: '2026-10-01T00:00:00Z',
          },
        }],
      }] });
    } finally {
      store.close();
    }
    running = await startJobHarnessServer({
      databasePath, host: '127.0.0.1', port: 0, authToken: 'lifecycle-secret',
      lifecycleSweepCampaignIds: [],
    });
    const headers = { authorization: 'Bearer lifecycle-secret' };
    const url = running.apiUrl + '/jobs?campaignId=grad';
    const before = await fetch(url, { headers });
    expect(before.status).toBe(200);
    expect(await before.json()).toMatchObject({ total: 1, items: [{ archivedForView: false }] });

    const report = runCampaignLifecycleSweep({
      databasePath, campaignId: 'grad', asOf: '2026-10-15T00:00:00Z', apply: true,
    });
    expect(report.archived).toBe(1);

    const defaultList = await fetch(url, { headers });
    expect(defaultList.status).toBe(200);
    expect(await defaultList.json()).toMatchObject({ total: 0, items: [] });

    const all = await fetch(url + '&includeCampaignArchived=true', { headers });
    expect(all.status).toBe(200);
    expect(await all.json()).toMatchObject({
      total: 1, items: [{ archivedForView: true, availability: { applyability: 'deadline_passed' } }],
    });

    const invalid = await fetch(url + '&includeCampaignArchived=maybe', { headers });
    expect(invalid.status).toBe(400);
  });
});
