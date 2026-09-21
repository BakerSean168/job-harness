import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '@job-harness/persistence-sqlite';
import { syncGetJobsRuntimeCache, type GetJobsRuntimeClient } from '../src/get-jobs-runtime';

let dir: string | null = null;
let store: SqliteCareerStore | null = null;

afterEach(async () => {
  store?.close();
  store = null;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe('get_jobs canonical collect-only sync', () => {
  it('imports delivered metadata without creating Application truth or external effects', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-get-jobs-sync-'));
    store = new SqliteCareerStore(join(dir, 'career.db'));
    let id = 0;
    const career = createCareerApplicationService(store, {
      now: () => '2026-09-21T10:00:00.000Z',
      idFactory: () => `id-${++id}`,
    });

    const run = await career.discovery.beginDiscoveryRun({
      campaignId: null,
      executor: 'other',
      contextSnapshot: { site: 'zhilian', mode: 'collect-only-test' },
      startedAt: '2026-09-21T09:00:00.000Z',
      idempotencyKey: 'collect-only-test',
    });

    const runtime = {
      async list(_site: string, input: { offset?: number }) {
        if ((input.offset ?? 0) > 0) return { total: 1, items: [] };
        return {
          total: 1,
          items: [{
            id: 1,
            job_id: 'upstream-synthetic-id',
            job_title: '前端开发工程师',
            job_link: 'https://www.zhaopin.com/jobdetail/CC100J200.htm?srccode=401901&data_identity=session',
            salary: '12-18K',
            location: '杭州',
            experience: '应届生',
            degree: '本科',
            company_name: '测试科技有限公司',
            company_tag: '软件',
            delivered: 1,
            created_at: '2026-09-21T08:59:00',
          }],
        };
      },
    } as unknown as GetJobsRuntimeClient;

    expect((await career.applications.listApplications({ limit: 10, offset: 0 })).total).toBe(0);
    expect((await career.outreach.list({ limit: 10, offset: 0 })).total).toBe(0);

    const synced = await syncGetJobsRuntimeCache(runtime, career.jobs, {
      site: 'zhilian',
      discoveryRunId: run.id,
      pageSize: 100,
      maxPages: 2,
      observedAt: '2026-09-21T09:01:00.000Z',
    });
    expect(synced).toMatchObject({
      upstreamTotal: 1,
      scanned: 1,
      normalized: 1,
      normalizationRejected: 0,
      inserted: 1,
      updated: 0,
      duplicate: 0,
      persistenceRejected: 0,
    });

    expect((await career.applications.listApplications({ limit: 10, offset: 0 })).total).toBe(0);
    expect((await career.outreach.list({ limit: 10, offset: 0 })).total).toBe(0);

    const jobs = await career.jobs.searchJobs({ limit: 10, offset: 0 });
    expect(jobs.total).toBe(1);
    expect(jobs.items[0]?.listings[0]).toMatchObject({
      sourceKind: 'zhilian',
      externalNamespace: 'zhilian',
      externalId: 'CC100J200',
      metadataSnapshot: { upstreamDelivered: true, collectOnlyOverlay: true },
    });
  });
});
