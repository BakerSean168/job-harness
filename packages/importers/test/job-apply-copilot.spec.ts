import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '@job-harness/persistence-sqlite';
import {
  importLegacyJobApplyCopilot,
  parseLegacyApplicationPool,
  parseLegacyApplicationsJsonl,
} from '../src';

const importedAt = '2026-09-16T12:00:00.000Z';

const applicationsJsonl = [
  JSON.stringify({
    at: '2026-09-11T02:00:00.000Z',
    company: '小红书',
    title: 'AI Agent 工程师',
    status: 'applied',
    platform: 'job.xiaohongshu.com',
    canonicalUrl: 'https://job.xiaohongshu.com/social/position/123/apply',
    applicationStatus: '已投递',
  }),
  JSON.stringify({
    at: '2026-09-12T03:00:00.000Z',
    company: '小红书',
    title: 'AI Agent 工程师',
    status: 'applied',
    platform: 'job.xiaohongshu.com',
    canonicalUrl: 'https://job.xiaohongshu.com/social/position/123/apply',
    applicationStatus: '简历筛选中',
  }),
  JSON.stringify({
    at: '2026-09-11T04:00:00.000Z',
    company: '字节跳动',
    title: 'Agent 开发工程师',
    status: 'shortlisted',
    profile: 'ai-agent',
    platform: 'jobs.bytedance.com',
    canonicalUrl: 'https://jobs.bytedance.com/campus/position/456/detail',
  }),
].join('\n');

const poolJson = JSON.stringify({
  schemaVersion: 1,
  verifiedAt: '2026-09-15T00:00:00.000Z',
  ready: [
    {
      id: 'xhs-agent-123',
      company: '小红书',
      title: 'AI Agent 工程师',
      city: '杭州',
      resumeProfile: 'ai-agent',
      channel: 'official-career-page',
      sourceUrl: 'https://job.xiaohongshu.com/social/position/123/apply',
      status: 'applied',
      eligibility: '2026届可投',
      signals: ['Agent', 'TypeScript'],
    },
    {
      id: 'bytedance-agent-456',
      company: '字节跳动',
      title: 'Agent 开发工程师',
      city: '深圳',
      channel: 'official-career-page',
      sourceUrl: 'https://jobs.bytedance.com/campus/position/456/detail',
      status: 'ready',
    },
  ],
  verifyFirst: [],
});

describe('job-apply-copilot importer', () => {
  let dir: string;
  let store: SqliteCareerStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-import-'));
    store = new SqliteCareerStore(join(dir, 'career.db'));
  });

  afterEach(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('imports enriched jobs, resume usage and application screening without direct DB writes', async () => {
    const career = createCareerApplicationService(store, { now: () => importedAt });
    const dataset = {
      applications: parseLegacyApplicationsJsonl(applicationsJsonl),
      pool: parseLegacyApplicationPool(poolJson),
    };
    const resumes = [{
      id: 'ai-agent',
      name: 'AI Agent Resume',
      source: 'resume-harness' as const,
      externalProfileId: 'ai-agent',
      targetRole: 'AI Agent Engineer',
      version: 'v1',
      hash: 'hash-v1',
      artifactUri: 'file:///resume/ai-agent.pdf',
      updatedAt: importedAt,
    }];

    const report = await importLegacyJobApplyCopilot(dataset, career, { importedAt, resumes });
    expect(report.alreadyImported).toBe(false);
    expect(report.jobsRejected).toBe(0);
    expect(report.applicationsRecorded).toBe(1);
    expect(report.applicationSubmissionsRecorded).toBe(1);
    expect(report.applicationsScreening).toBe(1);
    expect(report.resumesSynced).toBe(1);

    const jobs = await career.jobs.searchJobs({ limit: 20, offset: 0 });
    expect(jobs.total).toBe(2);
    expect(jobs.items.find((job) => job.companyName === '小红书')).toMatchObject({ city: '杭州' });

    const applications = await career.applications.listApplications({ limit: 20, offset: 0 });
    expect(applications.total).toBe(1);
    expect(applications.items[0]!.application).toMatchObject({
      currentStage: 'screening',
      resumeProfileId: 'ai-agent',
    });
    const detail = await career.applications.getApplication(applications.items[0]!.application.id);
    expect(detail?.timeline).toHaveLength(2);

    const rerun = await importLegacyJobApplyCopilot(dataset, career, { importedAt, resumes });
    expect(rerun.alreadyImported).toBe(true);
    expect((await career.applications.listApplications({ limit: 20, offset: 0 })).total).toBe(1);
  });
});

describe('legacy alias reconciliation', () => {
  it('merges one strong listing into one Opportunity while preserving two submission facts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'job-harness-alias-import-'));
    const store = new SqliteCareerStore(join(dir, 'career.db'));
    try {
      const career = createCareerApplicationService(store, { now: () => importedAt });
      const dataset = {
        applications: parseLegacyApplicationsJsonl(JSON.stringify({
          at: '2026-09-11T11:59:54.580Z',
          company: '论客科技 / Coremail',
          title: 'AI开发工程师',
          status: 'applied',
          canonicalUrl: 'https://career.nankai.edu.cn/correcruit/content/id/117496.html',
        })),
        pool: parseLegacyApplicationPool(JSON.stringify({
          ready: [{
            id: 'coremail-ai-dev-guangzhou-2026-fresh',
            company: '论客科技（广州）有限公司 / Coremail',
            title: 'AI开发工程师',
            city: '广州',
            sourceUrl: 'https://career.nankai.edu.cn/correcruit/content/id/117496.html',
            status: 'applied',
            appliedAt: '2026-09-11T12:09:37.411Z',
            applicationChannel: 'official-email',
            resumeProfile: 'ai-agent',
          }],
          verifyFirst: [],
        })),
      };
      const resumes = [{
        id: 'ai-agent',
        name: 'AI Agent Resume',
        source: 'resume-harness' as const,
        externalProfileId: 'ai-agent',
        targetRole: 'AI Agent Engineer',
        version: 'v1',
        hash: 'hash-v1',
        artifactUri: 'file:///resume/ai-agent.pdf',
        updatedAt: importedAt,
      }];

      const report = await importLegacyJobApplyCopilot(dataset, career, { importedAt, resumes });
      expect(report.jobsInserted).toBe(1);
      expect(report.applicationsRecorded).toBe(1);
      expect(report.applicationSubmissionsRecorded).toBe(2);

      const jobs = await career.jobs.searchJobs({ limit: 20, offset: 0 });
      expect(jobs.total).toBe(1);
      expect(jobs.items[0]!.listings.length).toBeGreaterThanOrEqual(2);
      const applications = await career.applications.listApplications({ limit: 20, offset: 0 });
      expect(applications.total).toBe(1);
      const detail = await career.applications.getApplication(applications.items[0]!.application.id);
      expect(detail?.application.resumeProfileId).toBe('ai-agent');
      expect(detail?.timeline.filter((event) => ['application_recorded', 'submission_recorded'].includes(event.type))).toHaveLength(2);
    } finally {
      store.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
