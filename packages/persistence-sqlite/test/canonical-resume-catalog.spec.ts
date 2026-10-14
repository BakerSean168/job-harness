import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCareerApplicationService, buildCareerExportSnapshot } from '@job-harness/application';
import { createResumeApplicationService, importResumeCatalog } from '@job-harness/resume-application';
import { ResumeArtifactSchema, ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { SqliteCareerStore, SqliteResumeStore } from '../src';

const t = '2026-10-14T13:55:00.000Z';
const zh = (value: string) => ({ 'zh-CN': value });

describe('canonical resume catalog and legacy evidence', () => {
  it('offers only current Profiles while preserving historical registry/export references', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-canonical-resumes-'));
    const path = join(dir, 'career.db');
    const careerStore = new SqliteCareerStore(path);
    const resumeStore = new SqliteResumeStore(path);
    try {
      const career = createCareerApplicationService(careerStore, { now: () => t });
      await career.resumeRegistry.syncResumeProfiles([{
        id: 'old-frontend', name: 'Old Frontend 2026', source: 'resume-harness',
        externalProfileId: 'old-frontend', targetRole: 'Frontend', version: '2026-09-16',
        hash: 'legacy-hash', artifactUri: 'file:///data/resumes/old-frontend.pdf', updatedAt: t,
      }]);
      expect((await career.resumes.listResumeProfiles({ limit: 10 })).items.map((p) => p.id))
        .toEqual(['old-frontend']);

      const lib = ResumeLibrarySchema.parse({
        id: 'primary', schemaVersion: 2, version: 1,
        basics: { displayName: zh('测试用户'), contact: { phone: null, email: 'candidate@example.test', website: null, github: null, location: null }, photoAssetId: null },
        education: [], skills: [{ id: 'frontend', content: zh('Vue TypeScript') }],
        workExperiences: [], projects: [], certificates: [], summaries: [],
        createdAt: t, updatedAt: t,
      });
      const active = ResumeProfileSchema.parse({
        id: 'canonical-frontend', libraryId: 'primary', version: 1,
        name: zh('前端开发工程师'), targetRole: zh('前端开发工程师'),
        locale: 'zh-CN', templateId: 'classic-v1', positioning: zh('前端开发工程师'),
        output: { documentTitle: zh('卢楼豪 - 前端开发工程师'), description: null, onlineUrl: null, pdfName: zh('卢楼豪-前端开发工程师') },
        layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'],
        educationIds: [], skillIds: ['frontend'], workSelections: [], projectSelections: [],
        certificateIds: [], summaryIds: [], overrides: [],
        createdAt: t, updatedAt: t, archivedAt: null,
      });
      const archived = ResumeProfileSchema.parse({
        ...active, id: 'archived-resume', name: zh('旧简历'), archivedAt: t,
      });
      await importResumeCatalog(resumeStore, { library: lib, profiles: [active, archived] });
      const resume = createResumeApplicationService(resumeStore, { now: () => t });
      const published = await resume.publishRevision({
        profileId: active.id, expectedProfileVersion: 1, expectedLibraryVersion: 1,
      });
      await resumeStore.transaction((tx) => tx.insertArtifact(ResumeArtifactSchema.parse({
        id: 'canonical-pdf', revisionId: published.revision.id,
        kind: 'pdf', mimeType: 'application/pdf', storageUri: 'file:///data/resume-artifacts/canonical.pdf',
        sha256: 'f'.repeat(64), byteSize: 42, rendererId: 'fixture', rendererVersion: '1', createdAt: t,
      })));

      const current = await career.resumes.listResumeProfiles({ limit: 20 });
      expect(current.total).toBe(1);
      expect(current.items[0]).toMatchObject({
        id: active.id, name: '前端开发工程师', source: 'resume-harness',
        externalProfileId: active.id, version: '1',
        hash: 'sha256:' + 'f'.repeat(64), artifactUri: 'file:///data/resume-artifacts/canonical.pdf',
      });
      const context = await career.analytics.getCareerContext({});
      expect(context.resumes.map((p) => p.id)).toEqual([active.id]);
      const usage = await career.workspace.listResumeUsage({ limit: 20 });
      expect(usage.items.map((p) => p.resume.id)).toEqual([active.id]);

      const old = await career.resumes.listResumeProfiles({ limit: 20, includeLegacy: true });
      expect(old.items.map((p) => p.id)).toEqual(['old-frontend']);
      const snapshot = await buildCareerExportSnapshot(career, t);
      expect(snapshot.resumes.map((p) => p.id)).toEqual(['old-frontend']);

      const jobs = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Old Co', title: 'Frontend', city: 'Hangzhou', observedAt: t,
        listings: [{ sourceKind: 'official', url: 'https://example.test/job/1', identityKind: 'url', status: 'active' }],
      }] });
      const job = jobs.items[0]!.jobId!;
      const recorded = await career.applications.recordApplication({
        jobId: job, resumeProfileId: 'old-frontend', appliedAt: t, actor: 'user', idempotencyKey: 'old-application',
      });
      const detail = await career.workspace.getApplicationWorkspaceDetail(recorded.application.id);
      expect(detail?.resume?.id).toBe('old-frontend');
      expect((await career.resumes.listResumeProfiles({ limit: 20 })).items.map((p) => p.id))
        .toEqual([active.id]);
    } finally {
      resumeStore.close();
      careerStore.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
