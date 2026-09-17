import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJobHarnessRestClient } from '@job-harness/client';
import { importResumeCatalog } from '../../../packages/resume-application/src';
import { ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { SqliteResumeStore } from '../../../packages/persistence-sqlite/src';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../../server/src';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
const originalApiUrl = process.env.JOB_HARNESS_API_URL;
const originalToken = process.env.JOB_HARNESS_AUTH_TOKEN;
const at = '2026-09-17T02:20:00.000Z';
const zh = (value: string) => ({ 'zh-CN': value });

afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null; dir = null;
  if (originalApiUrl === undefined) delete process.env.JOB_HARNESS_API_URL; else process.env.JOB_HARNESS_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.JOB_HARNESS_AUTH_TOKEN; else process.env.JOB_HARNESS_AUTH_TOKEN = originalToken;
  vi.clearAllMocks();
});

async function seed(databasePath: string) {
  const store = new SqliteResumeStore(databasePath);
  try {
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: { displayName: zh('测试用户'), contact: { phone: null, email: 'test@example.com', website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [{ id: 'agent', label: null, content: zh('Agent'), keywords: [] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'agent', libraryId: 'primary', version: 1, name: zh('Agent 简历'), targetRole: zh('Agent'), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh('Agent'), output: { documentTitle: zh('Agent 简历'), description: null, onlineUrl: null, pdfName: null }, layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: ['agent'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], createdAt: at, updatedAt: at, archivedAt: null,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
  } finally { store.close(); }
}

describe('Web Resume save actions', () => {
  it('persists Profile and shared Library drafts through REST with optimistic concurrency', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-resume-action-'));
    const databasePath = join(dir, 'career.db');
    await seed(databasePath);
    running = await startJobHarnessServer({ databasePath, host: '127.0.0.1', port: 0, authToken: 'resume-secret' });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'resume-secret';
    const client = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'resume-secret' });
    const context = await client.resume.getProfileContext('agent');
    expect(context).not.toBeNull();

    const { saveResumeLibraryAction, saveResumeProfileAction } = await import('../src/app/resumes/actions');
    const changedProfile = { ...context!.profile, positioning: zh('Agent Harness Engineer') };
    const savedProfile = await saveResumeProfileAction(1, changedProfile);
    expect(savedProfile.ok).toBe(true);
    if (!savedProfile.ok) throw new Error(savedProfile.message);
    expect(savedProfile.value.profile.version).toBe(2);
    expect(savedProfile.value.resolved.positioning).toBe('Agent Harness Engineer');

    const stale = await saveResumeProfileAction(1, changedProfile);
    expect(stale).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });

    const changedLibrary = { ...context!.library, basics: { ...context!.library.basics, displayName: zh('新名字') } };
    const savedLibrary = await saveResumeLibraryAction(1, changedLibrary);
    expect(savedLibrary.ok).toBe(true);
    if (!savedLibrary.ok) throw new Error(savedLibrary.message);
    expect(savedLibrary.value.version).toBe(2);

    const reread = await client.resume.getProfileContext('agent');
    expect(reread?.library.version).toBe(2);
    expect(reread?.resolved.basics.displayName).toBe('新名字');
    expect(reread?.profile.version).toBe(2);

    const { revalidatePath } = await import('next/cache');
    expect(revalidatePath).toHaveBeenCalledWith('/resumes');
  });
});
