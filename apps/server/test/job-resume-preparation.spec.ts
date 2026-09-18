import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { createResumeApplicationService, createResumeArtifactService, importResumeCatalog } from '@job-harness/resume-application';
import { ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { SqliteCareerStore, SqliteResumeStore } from '@job-harness/persistence-sqlite';
import { createJobResumePreparationService } from '../src/job-resume';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });
const at = '2026-09-18T06:20:00.000Z';
const zh = (value: string) => ({ 'zh-CN': value });

function profile(id: string, role: string) {
  return ResumeProfileSchema.parse({
    id, libraryId: 'primary', version: 1, name: zh(role), targetRole: zh(role), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh(role),
    output: { documentTitle: zh(role), description: null, onlineUrl: null, pdfName: zh(`${id}.pdf`) },
    layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: [], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [],
    createdAt: at, updatedAt: at, archivedAt: null,
  });
}

describe('Job -> Resume recommendation -> frozen SubmissionIntent', () => {
  it('selects ForgeFlow for Agent Harness work and binds the exact current Revision/PDF', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-job-resume-'));
    const databasePath = join(dir, 'career.db');
    const careerStore = new SqliteCareerStore(databasePath);
    const resumeStore = new SqliteResumeStore(databasePath);
    try {
      const library = ResumeLibrarySchema.parse({
        id: 'primary', schemaVersion: 2, version: 1,
        basics: { displayName: zh('测试用户'), contact: { phone: null, email: 'candidate@example.test', website: null, github: null, location: null }, photoAssetId: null },
        education: [], skills: [], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
      });
      await importResumeCatalog(resumeStore, { library, profiles: [
        profile('ai-agent-app', 'AI Agent / 大模型应用开发工程师'),
        profile('ai-agent-dongxu', 'AI Agent / Multi-Agent 应用开发工程师'),
        profile('ai-agent-forgeflow', 'AI Agent / 大模型应用开发工程师（ForgeFlow 版）'),
        profile('ai-frontend', '前端开发工程师'),
        profile('ai-fullstack', '全栈开发工程师'),
      ] });
      const career = createCareerApplicationService(careerStore, {
        now: () => at,
        resumeEvidence: {
          async getProfile(id) { return (await resumeStore.getProfile(id)) ? { id } : null; },
          async getRevision(id) { const revision = await resumeStore.getRevision(id); return revision ? { id: revision.id, profileId: revision.profileId } : null; },
          async getArtifact(id) { const artifact = await resumeStore.getArtifact(id); return artifact ? { id: artifact.id, revisionId: artifact.revisionId } : null; },
        },
      });
      const resume = createResumeApplicationService(resumeStore, { now: () => at });
      const files = new Map<string, Uint8Array>();
      const artifacts = createResumeArtifactService(resumeStore, {
        now: () => at,
        htmlRenderer: { rendererId: 'fixture-html', rendererVersion: '1', renderHtml: (revision) => `<html>${revision.profileId}</html>` },
        pdfRenderer: { async describe() { return { rendererId: 'fixture-pdf', rendererVersion: '1' }; }, async renderPdf(html) { return new TextEncoder().encode(`%PDF-1.4\n${html}`); } },
        storage: {
          async write({ artifactId, bytes }) { const uri = `memory://${artifactId}`; files.set(uri, bytes); return uri; },
          async read(uri) { const value = files.get(uri); if (!value) throw new Error(`missing ${uri}`); return value; },
          async remove(uri) { files.delete(uri); },
        },
      });
      const service = createJobResumePreparationService(career, resume, artifacts);
      const jobs = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Harness Co', title: 'Agent开发工程师', city: '上海',
        description: '负责 Agent Harness、Orchestration、Tool Calling、Memory、Planning、MCP、多智能体 Supervisor 系统。',
        listings: [{ sourceKind: 'official', url: 'https://jobs.example.test/agent/1', identityKind: 'url', status: 'active' }], observedAt: at,
      }] });
      const jobId = jobs.items[0]!.jobId!;

      const ranked = await service.recommend(jobId);
      expect(ranked.recommendedProfileId).toBe('ai-agent-forgeflow');
      expect(ranked.items[0]).toMatchObject({ profileId: 'ai-agent-forgeflow', decision: 'strong-match', executable: false, latestRevisionId: null, latestPdfArtifactId: null });
      expect(ranked.items[0]!.positiveSignals.map((item) => item.keyword)).toContain('Agent Harness');

      const prepared = await service.prepare(jobId, { idempotencyKey: 'auto-prepare-harness-1' });
      expect(prepared.selection).toMatchObject({ profileId: 'ai-agent-forgeflow', executable: true, latestRevisionId: expect.any(String), latestPdfArtifactId: expect.any(String) });
      expect(prepared.intent).toMatchObject({
        jobId, status: 'planned', channel: 'official', executor: 'browser-extension', resumeProfileId: 'ai-agent-forgeflow',
        resumeRevisionId: prepared.selection.latestRevisionId, resumeArtifactId: prepared.selection.latestPdfArtifactId,
      });
      const revision = await resume.getRevisionDetail(prepared.intent.resumeRevisionId!);
      expect(revision?.artifacts).toContainEqual(expect.objectContaining({ id: prepared.intent.resumeArtifactId, kind: 'pdf', mimeType: 'application/pdf' }));

      const retry = await service.prepare(jobId, { idempotencyKey: 'auto-prepare-harness-1' });
      expect(retry.intent.id).toBe(prepared.intent.id);
      expect(retry.intent.resumeArtifactId).toBe(prepared.intent.resumeArtifactId);
    } finally {
      resumeStore.close();
      careerStore.close();
    }
  });
});
