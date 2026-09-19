import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

let dir: string | null = null;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe('durable Job outreach events', () => {
  it('records BOSS contact separately from an Application and projects it on Job views', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-outreach-'));
    const store = new SqliteCareerStore(join(dir, 'career.db'));
    try {
      const now = '2026-09-19T12:30:00.000Z';
      const career = createCareerApplicationService(store, { now: () => now, idFactory: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })() });
      const inserted = await career.jobs.upsertJobsBatch({
        jobs: [{
          companyName: '示例科技',
          title: '前端开发工程师',
          city: '深圳',
          description: 'Vue3 + TypeScript',
          observedAt: now,
          listings: [{
            sourceKind: 'boss',
            label: 'BOSS直聘',
            url: 'https://www.zhipin.com/job_detail/boss-outreach-1.html',
            externalNamespace: 'boss',
            externalId: 'boss-outreach-1',
            identityKind: 'external-id',
            status: 'active',
          }],
        }],
      });
      const jobId = inserted.items[0]!.jobId!;
      const detailBefore = await career.workspace.getJobDetail(jobId);
      const listingId = detailBefore!.job.listings[0]!.id;

      const first = await career.outreach.record({
        jobId,
        listingId,
        channel: 'boss',
        type: 'greeting_sent',
        occurredAt: now,
        actor: 'system',
        resumeProfileId: null,
        message: '您好，想进一步沟通一下这个前端岗位。',
        externalThreadUrl: 'https://www.zhipin.com/web/geek/chat?id=example',
        metadata: { source: 'boss-copilot-compat' },
        idempotencyKey: 'boss-outreach:job:greeting',
      });
      const retry = await career.outreach.record({
        jobId,
        listingId,
        channel: 'boss',
        type: 'greeting_sent',
        occurredAt: now,
        actor: 'system',
        resumeProfileId: null,
        message: '您好，想进一步沟通一下这个前端岗位。',
        externalThreadUrl: 'https://www.zhipin.com/web/geek/chat?id=example',
        metadata: { source: 'boss-copilot-compat' },
        idempotencyKey: 'boss-outreach:job:greeting',
      });
      expect(retry.id).toBe(first.id);

      const list = await career.outreach.list({ jobId, limit: 20, offset: 0 });
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({ jobId, listingId, channel: 'boss', type: 'greeting_sent' });

      const detail = await career.workspace.getJobDetail(jobId);
      expect(detail?.application).toBeNull();
      expect(detail?.outreach).toHaveLength(1);
      expect(detail?.outreach[0]).toMatchObject({ type: 'greeting_sent', message: '您好，想进一步沟通一下这个前端岗位。' });

      const jobs = await career.workspace.searchJobListItems({ limit: 20, offset: 0 });
      expect(jobs.items[0]).toMatchObject({
        jobId,
        application: null,
        outreachCount: 1,
        latestOutreach: { type: 'greeting_sent' },
      });
    } finally {
      store.close();
    }
  });
});
