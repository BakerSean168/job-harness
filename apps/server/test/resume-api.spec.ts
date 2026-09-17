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
  });
});
