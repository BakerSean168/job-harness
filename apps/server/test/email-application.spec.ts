import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApplicantApplicationService } from '@job-harness/applicant-application';
import { createCareerApplicationService, CareerConflictError } from '@job-harness/application';
import { createResumeApplicationService, createResumeArtifactService, importResumeCatalog } from '@job-harness/resume-application';
import { ApplicantProfileSchema, ApplicationAnswerSetSchema } from '@job-harness/applicant-contracts';
import { ResumeArtifactSchema, ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { SqliteApplicantStore, SqliteCareerStore, SqliteEmailApplicationPackageStore, SqliteResumeStore } from '@job-harness/persistence-sqlite';
import { createEmailApplicationService } from '../src/email-application';
import { createJobResumePreparationService } from '../src/job-resume';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });
const at = '2026-09-18T07:20:00.000Z';
const zh = (value: string) => ({ 'zh-CN': value });

describe('immutable email application package', () => {
  it('freezes email copy + exact PDF, requires matching draft hash, and reconciles one provider send into one ApplicationSubmission', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-email-application-'));
    const databasePath = join(dir, 'career.db');
    const careerStore = new SqliteCareerStore(databasePath);
    const resumeStore = new SqliteResumeStore(databasePath);
    const applicantStore = new SqliteApplicantStore(databasePath);
    const emailStore = new SqliteEmailApplicationPackageStore(databasePath);
    try {
      const library = ResumeLibrarySchema.parse({
        id: 'primary', schemaVersion: 2, version: 1,
        basics: { displayName: zh('测试候选人'), contact: { phone: zh('13800000000'), email: 'candidate@example.test', website: null, github: null, location: null }, photoAssetId: null },
        education: [], skills: [{ id: 'agent', label: null, content: zh('Agent Harness MCP Orchestration'), keywords: ['Agent Harness','MCP','Orchestration'] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
      });
      const profile = ResumeProfileSchema.parse({
        id: 'ai-agent-forgeflow', libraryId: 'primary', version: 1, name: zh('ForgeFlow Agent 简历'), targetRole: zh('AI Agent / 大模型应用开发工程师'), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh('AI Agent / 大模型应用开发工程师（ForgeFlow 版）'),
        output: { documentTitle: zh('AI Agent 简历'), description: null, onlineUrl: null, pdfName: zh('测试候选人-AI-Agent-ForgeFlow版.pdf') }, layout: { header: 'without-photo', pageSize: 'A4' },
        sectionOrder: ['skills'], educationIds: [], skillIds: ['agent'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], createdAt: at, updatedAt: at, archivedAt: null,
      });
      await importResumeCatalog(resumeStore, { library, profiles: [profile] });
      const resume = createResumeApplicationService(resumeStore, { now: () => at });
      const published = await resume.publishRevision({ profileId: profile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 });
      const artifact = ResumeArtifactSchema.parse({
        id: 'email-resume-artifact-1', revisionId: published.revision.id, kind: 'pdf', mimeType: 'application/pdf', storageUri: 'memory://email-resume-artifact-1', sha256: 'c'.repeat(64), byteSize: 512,
        rendererId: 'fixture-renderer', rendererVersion: '1', createdAt: at,
      });
      await resumeStore.transaction((tx) => tx.insertArtifact(artifact));

      const applicant = createApplicantApplicationService(applicantStore, { now: () => at, idFactory: () => 'fixture' });
      await applicant.ensureDefaults({
        profile: ApplicantProfileSchema.parse({
          id: 'default', version: 1, displayName: '测试候选人', phone: '13800000000', email: 'candidate@example.test', location: '浙江', website: null, github: null,
          education: [{ id: 'edu-1', school: '测试大学', major: '物联网工程', degree: '本科', department: null, location: null, startMonth: '2022-09', endMonth: '2026-06' }],
          targetRoles: ['AI Agent'], targetCities: ['杭州'], availableFrom: '立即', notes: null, createdAt: at, updatedAt: at,
        }),
        answerSet: ApplicationAnswerSetSchema.parse({ id: 'default', version: 1, name: 'Default answers', entries: [], createdAt: at, updatedAt: at }),
      });

      const career = createCareerApplicationService(careerStore, {
        now: () => at,
        resumeEvidence: {
          async getProfile(id) { return (await resumeStore.getProfile(id)) ? { id } : null; },
          async getRevision(id) { const value = await resumeStore.getRevision(id); return value ? { id: value.id, profileId: value.profileId } : null; },
          async getArtifact(id) { const value = await resumeStore.getArtifact(id); return value ? { id: value.id, revisionId: value.revisionId } : null; },
        },
      });
      const artifacts = createResumeArtifactService(resumeStore, {
        now: () => at,
        htmlRenderer: { rendererId: 'fixture-html', rendererVersion: '1', renderHtml: () => '<html></html>' },
        pdfRenderer: null,
        storage: { async write() { throw new Error('should reuse existing pdf'); }, async read() { return new Uint8Array(); }, async remove() {} },
      });
      const jobResume = createJobResumePreparationService(career, resume, artifacts);
      let generatedId = 0;
      const email = createEmailApplicationService(career, resume, applicant, jobResume, emailStore, { now: () => at, idFactory: () => `fixture-${++generatedId}` });

      const jobs = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Email Co', title: 'Agent开发工程师', city: '杭州', description: 'Agent Harness MCP Orchestration Tool Calling', observedAt: at,
        listings: [{ sourceKind: 'email', externalNamespace: 'legacy-email', externalId: 'email-role-1', identityKind: 'external-id', status: 'active', metadataSnapshot: { contactEmail: 'jobs@example.test' } }],
      }] });
      const jobId = jobs.items[0]!.jobId!;

      const prepared = await email.prepare(jobId, { idempotencyKey: 'email-package-idempotency-1' });
      expect(prepared.package).toMatchObject({
        recipient: 'jobs@example.test', resumeProfileId: profile.id, resumeRevisionId: published.revision.id, resumeArtifactId: artifact.id,
        attachmentFileName: '测试候选人-AI-Agent-ForgeFlow版.pdf',
      });
      expect(prepared.package.subject).toContain('Agent开发工程师');
      expect(prepared.package.body).toContain('测试大学');
      expect(prepared.package.body).toContain('Agent Harness');
      expect(prepared.intent).toMatchObject({ status: 'planned', channel: 'email', externalTargetUrl: null, executor: 'chatgpt-web' });
      expect((await email.prepare(jobId, { idempotencyKey: 'email-package-idempotency-1' })).package.id).toBe(prepared.package.id);

      await expect(email.authorizeSend(prepared.package.id, { draftHash: '0'.repeat(64), idempotencyKey: 'email-auth-wrong' })).rejects.toBeInstanceOf(CareerConflictError);
      const expiring = await email.authorizeSend(prepared.package.id, { draftHash: prepared.package.draftHash, expiresInSeconds: 30, idempotencyKey: 'email-auth-expiring' });
      expect(expiring).toMatchObject({ packageId: prepared.package.id, status: 'active', draftHash: prepared.package.draftHash });
      expect((await email.listSendAuthorizations()).items).toContainEqual(expect.objectContaining({ id: expiring.id, status: 'active' }));
      await expect(email.claimSend(prepared.package.id, { authorizationId: expiring.id, draftHash: prepared.package.draftHash, occurredAt: '2026-09-18T07:21:00.000Z' })).rejects.toBeInstanceOf(CareerConflictError);
      expect((await career.submissionIntents.get(prepared.intent.id))?.status).toBe('planned');

      const authorization = await email.authorizeSend(prepared.package.id, { draftHash: prepared.package.draftHash, expiresInSeconds: 300, idempotencyKey: 'email-auth-live' });
      await expect(email.authorizeSend(prepared.package.id, { draftHash: prepared.package.draftHash, expiresInSeconds: 300, idempotencyKey: 'email-auth-second-active' })).rejects.toBeInstanceOf(CareerConflictError);
      const claimed = await email.claimSend(prepared.package.id, { authorizationId: authorization.id, draftHash: prepared.package.draftHash, occurredAt: '2026-09-18T07:21:00.000Z' });
      expect(claimed.authorization.status).toBe('consumed');
      expect(claimed.intent.status).toBe('external_in_progress');
      expect((await email.listSendAuthorizations()).items).toHaveLength(0);

      const confirmed = await email.confirm(prepared.package.id, {
        draftHash: prepared.package.draftHash, provider: 'gmail', messageId: '<msg-1@example.test>', threadId: 'thread-1', sentAt: '2026-09-18T07:22:00.000Z',
      });
      expect(confirmed.persistenceCommitted).toBe(true);
      expect(confirmed.intent).toMatchObject({ status: 'committed', channel: 'email', externalReference: 'gmail:<msg-1@example.test>' });
      expect(confirmed.intent.externalEvidence).toMatchObject({ emailPackageId: prepared.package.id, messageId: '<msg-1@example.test>', draftHash: prepared.package.draftHash, resumeArtifactId: artifact.id });
      const again = await email.confirm(prepared.package.id, {
        draftHash: prepared.package.draftHash, provider: 'gmail', messageId: '<msg-1@example.test>', threadId: 'thread-1', sentAt: '2026-09-18T07:22:00.000Z',
      });
      expect(again.intent.applicationId).toBe(confirmed.intent.applicationId);
      expect(again.intent.submissionId).toBe(confirmed.intent.submissionId);

      const board = await career.workspace.listApplicationBoard({ limit: 20, offset: 0 });
      expect(board.total).toBe(1);
      const application = await career.applications.getApplication(confirmed.intent.applicationId!);
      expect(application?.submissions).toHaveLength(1);
      expect(application?.submissions[0]).toMatchObject({ channel: 'email', resumeRevisionId: published.revision.id, resumeArtifactId: artifact.id });
    } finally {
      emailStore.close(); applicantStore.close(); resumeStore.close(); careerStore.close();
    }
  });
});
