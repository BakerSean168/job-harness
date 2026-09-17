import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importResumeCatalog } from '@job-harness/resume-application';
import { ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { SqliteResumeStore } from '@job-harness/persistence-sqlite';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
afterEach(async () => { if (running) await running.close(); if (dir) await rm(dir, { recursive: true, force: true }); running = null; dir = null; });
const at = '2026-09-17T02:10:00.000Z';
const zh = (value: string) => ({ 'zh-CN': value });

async function seed(databasePath: string) {
  const store = new SqliteResumeStore(databasePath);
  try {
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: { displayName: zh('测试用户'), contact: { phone: null, email: 'test@example.com', website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [{ id: 'agent', label: null, content: zh('<strong>Agent：</strong>工程实践'), keywords: [] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'agent', libraryId: 'primary', version: 1, name: zh('Agent 简历'), targetRole: zh('Agent 工程师'), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh('Agent 工程师'), output: { documentTitle: zh('Agent 简历'), description: null, onlineUrl: null, pdfName: zh('Agent') }, layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: ['agent'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], createdAt: at, updatedAt: at, archivedAt: null,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
  } finally { store.close(); }
}

describe('Resume REST v1', () => {
  it('lists, resolves and previews persisted Resume Profiles behind the bearer boundary', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-resume-api-'));
    const databasePath = join(dir, 'career.db');
    await seed(databasePath);
    running = await startJobHarnessServer({ databasePath, host: '127.0.0.1', port: 0, authToken: 'secret' });

    const unauthorized = await fetch(`${running.apiUrl}/resume/profiles`);
    expect(unauthorized.status).toBe(401);

    const headers = { authorization: 'Bearer secret', 'content-type': 'application/json' };
    const list = await fetch(`${running.apiUrl}/resume/profiles`, { headers });
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ total: 1, items: [{ id: 'agent', libraryId: 'primary' }] });

    const detail = await fetch(`${running.apiUrl}/resume/profiles/agent`, { headers });
    const context = await detail.json();
    expect(detail.status).toBe(200);
    expect(context).toMatchObject({ profile: { id: 'agent' }, library: { id: 'primary' }, resolved: { positioning: 'Agent 工程师' } });

    const preview = await fetch(`${running.apiUrl}/resume/preview`, { method: 'POST', headers, body: JSON.stringify({ library: context.library, profile: context.profile }) });
    const previewBody = await preview.json();
    expect(preview.status).toBe(200);
    expect(previewBody.resolved.profileId).toBe('agent');
    expect(previewBody.html).toContain('测试用户');
    expect(previewBody.html).toContain('<strong>Agent：</strong>工程实践');

    const changedProfile = { ...context.profile, positioning: { 'zh-CN': 'AI Agent / Harness 工程师' } };
    const savedProfile = await fetch(`${running.apiUrl}/resume/profiles/agent`, {
      method: 'PUT', headers, body: JSON.stringify({ expectedVersion: 1, profile: changedProfile }),
    });
    const savedProfileBody = await savedProfile.json();
    expect(savedProfile.status).toBe(200);
    expect(savedProfileBody.profile.version).toBe(2);
    expect(savedProfileBody.resolved.positioning).toBe('AI Agent / Harness 工程师');

    const staleProfile = await fetch(`${running.apiUrl}/resume/profiles/agent`, {
      method: 'PUT', headers, body: JSON.stringify({ expectedVersion: 1, profile: changedProfile }),
    });
    expect(staleProfile.status).toBe(409);
    expect(await staleProfile.json()).toMatchObject({ error: { code: 'VERSION_CONFLICT' } });

    const invalidSharedEdit = await fetch(`${running.apiUrl}/resume/libraries/primary`, {
      method: 'PUT', headers, body: JSON.stringify({ expectedVersion: 1, library: { ...context.library, skills: [] } }),
    });
    expect(invalidSharedEdit.status).toBe(422);
    expect(await invalidSharedEdit.json()).toMatchObject({ error: { code: 'RESUME_REFERENCE_INVALID' } });

    const validSharedEdit = await fetch(`${running.apiUrl}/resume/libraries/primary`, {
      method: 'PUT', headers, body: JSON.stringify({ expectedVersion: 1, library: { ...context.library, basics: { ...context.library.basics, displayName: { 'zh-CN': '测试用户二号' } } } }),
    });
    expect(validSharedEdit.status).toBe(200);
    expect((await validSharedEdit.json()).version).toBe(2);


    const published = await fetch(`${running.apiUrl}/resume/profiles/agent/revisions`, {
      method: 'POST', headers, body: JSON.stringify({ expectedProfileVersion: 2, expectedLibraryVersion: 2, note: 'first publish' }),
    });
    const firstRevision = await published.json();
    expect(published.status).toBe(200);
    expect(firstRevision).toMatchObject({ reused: false, revision: { revisionNumber: 1, profileVersion: 2, libraryVersion: 2, note: 'first publish' } });

    const retriedPublish = await fetch(`${running.apiUrl}/resume/profiles/agent/revisions`, {
      method: 'POST', headers, body: JSON.stringify({ expectedProfileVersion: 2, expectedLibraryVersion: 2 }),
    });
    expect(await retriedPublish.json()).toMatchObject({ reused: true, revision: { id: firstRevision.revision.id, revisionNumber: 1 } });

    const currentDetail = await fetch(`${running.apiUrl}/resume/profiles/agent`, { headers });
    const currentContext = await currentDetail.json();
    const thirdProfile = await fetch(`${running.apiUrl}/resume/profiles/agent`, {
      method: 'PUT', headers, body: JSON.stringify({ expectedVersion: 2, profile: { ...currentContext.profile, positioning: { 'zh-CN': 'Agent Platform 工程师' } } }),
    });
    expect((await thirdProfile.json()).profile.version).toBe(3);

    const secondPublish = await fetch(`${running.apiUrl}/resume/profiles/agent/revisions`, {
      method: 'POST', headers, body: JSON.stringify({ expectedProfileVersion: 3, expectedLibraryVersion: 2, note: 'second publish' }),
    });
    const secondRevision = await secondPublish.json();
    expect(secondRevision).toMatchObject({ reused: false, revision: { revisionNumber: 2, profileVersion: 3, libraryVersion: 2 } });

    const history = await fetch(`${running.apiUrl}/resume/profiles/agent/revisions`, { headers });
    expect(await history.json()).toMatchObject({ total: 2, items: [{ id: secondRevision.revision.id, revisionNumber: 2 }, { id: firstRevision.revision.id, revisionNumber: 1 }] });

    const revisionDetail = await fetch(`${running.apiUrl}/resume/revisions/${encodeURIComponent(secondRevision.revision.id)}`, { headers });
    expect(await revisionDetail.json()).toMatchObject({ revision: { id: secondRevision.revision.id }, artifacts: [] });

    const previousDiff = await fetch(`${running.apiUrl}/resume/revisions/${encodeURIComponent(secondRevision.revision.id)}/diff?against=previous`, { headers });
    const previousDiffBody = await previousDiff.json();
    expect(previousDiffBody.fromRevisionId).toBe(firstRevision.revision.id);
    expect(previousDiffBody.changes).toContainEqual({ path: '/positioning', kind: 'changed', before: 'AI Agent / Harness 工程师', after: 'Agent Platform 工程师' });

    const currentDiff = await fetch(`${running.apiUrl}/resume/revisions/${encodeURIComponent(secondRevision.revision.id)}/diff?against=current`, { headers });
    expect(await currentDiff.json()).toMatchObject({ toRevisionId: null, changes: [] });


    const htmlArtifactResponse = await fetch(`${running.apiUrl}/resume/revisions/${encodeURIComponent(secondRevision.revision.id)}/artifacts`, {
      method: 'POST', headers, body: JSON.stringify({ kind: 'html' }),
    });
    const htmlArtifact = await htmlArtifactResponse.json();
    expect(htmlArtifactResponse.status).toBe(200);
    expect(htmlArtifact).toMatchObject({ reused: false, artifact: { revisionId: secondRevision.revision.id, kind: 'html', rendererId: 'nunjucks-classic' } });

    const repeatedHtml = await fetch(`${running.apiUrl}/resume/revisions/${encodeURIComponent(secondRevision.revision.id)}/artifacts`, {
      method: 'POST', headers, body: JSON.stringify({ kind: 'html' }),
    });
    expect(await repeatedHtml.json()).toMatchObject({ reused: true, artifact: { id: htmlArtifact.artifact.id } });

    const htmlDownload = await fetch(`${running.apiUrl}/resume/artifacts/${encodeURIComponent(htmlArtifact.artifact.id)}/content`, { headers });
    const htmlBytes = Buffer.from(await htmlDownload.arrayBuffer());
    expect(htmlDownload.status).toBe(200);
    expect(htmlDownload.headers.get('content-type')).toContain('text/html');
    expect(htmlBytes.toString('utf8')).toContain('测试用户二号');
    expect(createHash('sha256').update(htmlBytes).digest('hex')).toBe(htmlArtifact.artifact.sha256);

    const jsonArtifactResponse = await fetch(`${running.apiUrl}/resume/revisions/${encodeURIComponent(secondRevision.revision.id)}/artifacts`, {
      method: 'POST', headers, body: JSON.stringify({ kind: 'json' }),
    });
    const jsonArtifact = await jsonArtifactResponse.json();
    expect(jsonArtifact).toMatchObject({ reused: false, artifact: { kind: 'json', rendererId: 'resolved-resume-json', rendererVersion: '1' } });
    const jsonDownload = await fetch(`${running.apiUrl}/resume/artifacts/${encodeURIComponent(jsonArtifact.artifact.id)}/content`, { headers });
    expect(JSON.parse(await jsonDownload.text())).toMatchObject({ profileId: 'agent', profileVersion: 3, libraryVersion: 2 });

    const unavailablePdf = await fetch(`${running.apiUrl}/resume/revisions/${encodeURIComponent(secondRevision.revision.id)}/artifacts`, {
      method: 'POST', headers, body: JSON.stringify({ kind: 'pdf' }),
    });
    expect(unavailablePdf.status).toBe(503);
    expect(await unavailablePdf.json()).toMatchObject({ error: { code: 'RESUME_ARTIFACT_UNAVAILABLE' } });
  });
});
