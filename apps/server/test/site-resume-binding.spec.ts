import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ResumeArtifactSchema, ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { createResumeApplicationService, importResumeCatalog } from '@job-harness/resume-application';
import { SqliteResumeStore, SqliteSiteResumeBindingStore } from '@job-harness/persistence-sqlite';
import { createSiteResumeBindingService, SiteResumeBindingError } from '../src/site-resume-binding';
import type { BrowserExtensionValidationRun } from '../src/browser-extension-validation';

let dir: string | null = null;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null; });
const at = '2026-09-18T08:40:00.000Z';
const zh = (value: string) => ({ 'zh-CN': value });

async function fixture() {
  dir = await mkdtemp(join(tmpdir(), 'jh-site-resume-binding-'));
  const databasePath = join(dir, 'career.db');
  const resumeStore = new SqliteResumeStore(databasePath);
  const bindingStore = new SqliteSiteResumeBindingStore(databasePath);
  const library = ResumeLibrarySchema.parse({
    id: 'primary', schemaVersion: 2, version: 1,
    basics: { displayName: zh('测试用户'), contact: { phone: null, email: 'candidate@example.test', website: null, github: null, location: null }, photoAssetId: null },
    education: [], skills: [], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
  });
  const profile = ResumeProfileSchema.parse({
    id: 'ai-agent-forgeflow', libraryId: 'primary', version: 1, name: zh('AI Agent ForgeFlow'), targetRole: zh('AI Agent开发工程师'), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh('Agent Harness'),
    output: { documentTitle: zh('ForgeFlow简历'), description: null, onlineUrl: null, pdfName: zh('forgeflow.pdf') }, layout: { header: 'without-photo', pageSize: 'A4' },
    sectionOrder: ['skills'], educationIds: [], skillIds: [], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], createdAt: at, updatedAt: at, archivedAt: null,
  });
  const secondProfile = ResumeProfileSchema.parse({
    ...profile, id: 'ai-frontend', name: zh('AI 前端'), targetRole: zh('前端开发工程师'), positioning: zh('AI 前端'),
    output: { ...profile.output, documentTitle: zh('前端简历'), pdfName: zh('frontend.pdf') },
  });
  await importResumeCatalog(resumeStore, { library, profiles: [profile, secondProfile] });
  const resume = createResumeApplicationService(resumeStore, { now: () => at });
  const published = await resume.publishRevision({ profileId: profile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 });
  const artifact = ResumeArtifactSchema.parse({
    id: 'resume-artifact-forgeflow-binding', revisionId: published.revision.id, kind: 'pdf', mimeType: 'application/pdf', storageUri: 'memory://forgeflow.pdf', sha256: 'a'.repeat(64), byteSize: 1234, rendererId: 'fixture', rendererVersion: '1', createdAt: at,
  });
  await resumeStore.transaction((tx) => tx.insertArtifact(artifact));
  const secondPublished = await resume.publishRevision({ profileId: secondProfile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 });
  const secondArtifact = ResumeArtifactSchema.parse({
    id: 'resume-artifact-frontend-binding', revisionId: secondPublished.revision.id, kind: 'pdf', mimeType: 'application/pdf', storageUri: 'memory://frontend.pdf', sha256: 'c'.repeat(64), byteSize: 1200, rendererId: 'fixture', rendererVersion: '1', createdAt: at,
  });
  await resumeStore.transaction((tx) => tx.insertArtifact(secondArtifact));
  const run: BrowserExtensionValidationRun = {
    id: 'validation-1', agentId: 'windows-chrome-primary', targetUrl: 'https://www.zhaopin.com/jobdetail/CC1.htm', mode: 'site-readonly', createdAt: at, expiresAt: '2026-09-18T08:50:00.000Z', sessionRef: 'chrome-tab:1', commandCount: 15, writeCount: 0,
    characterization: {
      observedAt: at, currentUrl: 'https://www.zhaopin.com/jobdetail/CC1.htm', title: 'Agent', formStateHash: 'b'.repeat(64), bodyTextLength: 100, stateSignals: ['立即投递','选择简历','在线简历'], actions: [{ tag: 'button', text: '立即投递', href: null, type: 'button', role: null, disabled: false, ariaDisabled: false }], controls: [{ kind: 'select', label: '选择简历', name: 'resumeId', description: '在线简历', required: true, disabled: false, readOnly: false, optionLabels: ['AI Agent简历','前端简历'], semanticHints: ['resume-selector'], accept: null, multiple: false, sectionLabel: '在线简历' }],
    },
  };
  let id = 0;
  const service = createSiteResumeBindingService(resume, bindingStore, { get: (runId: string) => runId === run.id ? run : null }, { now: () => at, idFactory: () => `fixture-${++id}` });
  return { service, resumeStore, bindingStore, profile, secondProfile, revision: published.revision, artifact, run };
}

describe('site-managed resume binding', () => {
  it('binds only an observed label to the current immutable Resume Revision/PDF and keeps an audit trail', async () => {
    const f = await fixture();
    try {
      await expect(f.service.create({ siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary', profileId: f.profile.id, externalResumeLabel: '不存在的简历', characterizationRunId: f.run.id, idempotencyKey: 'bad-label' })).rejects.toBeInstanceOf(SiteResumeBindingError);
      const created = await f.service.create({ siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary', profileId: f.profile.id, externalResumeLabel: ' AI Agent简历 ', characterizationRunId: f.run.id, idempotencyKey: 'bind-1' });
      expect(created).toMatchObject({
        siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary', profileId: f.profile.id,
        resumeRevisionId: f.revision.id, resumeArtifactId: f.artifact.id, externalResumeLabel: 'AI Agent简历', assurance: 'user-confirmed-label',
        characterizationRunId: f.run.id, characterizationFormStateHash: 'b'.repeat(64), status: 'active',
      });
      await expect(f.service.create({ siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary', profileId: f.profile.id, externalResumeLabel: 'AI Agent简历', characterizationRunId: f.run.id, idempotencyKey: 'bind-2' })).rejects.toBeInstanceOf(SiteResumeBindingError);
      await expect(f.service.create({ siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary', profileId: f.secondProfile.id, externalResumeLabel: 'AI Agent简历', characterizationRunId: f.run.id, idempotencyKey: 'bind-same-label-other-profile' })).rejects.toBeInstanceOf(SiteResumeBindingError);
      expect((await f.service.list({ siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary' })).items).toEqual([created]);
      const revoked = await f.service.revoke(created.id, { idempotencyKey: 'revoke-1' });
      expect(revoked).toMatchObject({ id: created.id, status: 'revoked', revokedAt: at, revokeIdempotencyKey: 'revoke-1', revokeRequestHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
      await expect(f.service.revoke(created.id, { idempotencyKey: 'revoke-other' })).rejects.toBeInstanceOf(SiteResumeBindingError);
      expect(await f.service.revoke(created.id, { idempotencyKey: 'revoke-1' })).toEqual(revoked);
      expect((await f.service.list({ siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary' })).items).toEqual([]);
      expect((await f.service.list({ siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary', includeRevoked: true })).items).toEqual([revoked]);
    } finally { f.bindingStore.close(); f.resumeStore.close(); }
  });
});
