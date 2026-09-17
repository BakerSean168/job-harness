// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { importResumeCatalog } from '../../../packages/resume-application/src/catalog';
import { createResumeApplicationService } from '../../../packages/resume-application/src/service';
import { ResumeLibrarySchema, ResumeProfileSchema } from '../../../packages/resume-contracts/src';
import { SqliteResumeStore } from '../../../packages/persistence-sqlite/src';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../../server/src';

vi.mock('server-only', () => ({}));

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
const originalApiUrl = process.env.JOB_HARNESS_API_URL;
const originalToken = process.env.JOB_HARNESS_AUTH_TOKEN;

afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
  if (originalApiUrl === undefined) delete process.env.JOB_HARNESS_API_URL; else process.env.JOB_HARNESS_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.JOB_HARNESS_AUTH_TOKEN; else process.env.JOB_HARNESS_AUTH_TOKEN = originalToken;
});

const both = (value: string) => ({ 'zh-CN': value, en: value });
const at = '2026-09-17T03:00:00.000Z';

async function seed(databasePath: string) {
  const store = new SqliteResumeStore(databasePath);
  try {
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: { displayName: both('测试用户'), contact: { phone: null, email: null, website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [{ id: 'ts', label: null, content: both('TypeScript'), keywords: ['typescript'] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'agent', libraryId: 'primary', version: 1, name: both('Agent Resume'), targetRole: both('Agent Engineer'), locale: 'zh-CN', templateId: 'classic-v1', positioning: both('Agent Engineer'), output: { documentTitle: both('Agent Resume'), description: null, onlineUrl: null, pdfName: both('Agent Resume') }, layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: ['ts'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], archivedAt: null, createdAt: at, updatedAt: at,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
    const app = createResumeApplicationService(store, { now: () => at });
    return (await app.publishRevision({ profileId: 'agent', expectedProfileVersion: 1, expectedLibraryVersion: 1 })).revision.id;
  } finally { store.close(); }
}

describe('Web Resume artifact download proxy', () => {
  it('materializes and proxies a verified HTML artifact without exposing the bearer', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-resume-download-'));
    const databasePath = join(dir, 'career.db');
    const revisionId = await seed(databasePath);
    running = await startJobHarnessServer({ databasePath, artifactDirectory: join(dir, 'artifacts'), host: '127.0.0.1', port: 0, authToken: 'download-secret' });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'download-secret';

    const { POST } = await import('../src/app/downloads/resume-artifact/route');
    const form = new FormData();
    form.set('revisionId', revisionId);
    form.set('kind', 'html');
    const request = new NextRequest('http://job-harness.test/downloads/resume-artifact', { method: 'POST', headers: { origin: 'http://job-harness.test', host: 'job-harness.test' }, body: form });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-disposition')).toContain('Agent%20Resume-v1.html');
    const html = await response.text();
    expect(html).toContain('测试用户');
    expect(html).not.toContain('download-secret');

    const rejectedForm = new FormData();
    rejectedForm.set('revisionId', revisionId);
    rejectedForm.set('kind', 'html');
    const rejected = await POST(new NextRequest('http://job-harness.test/downloads/resume-artifact', { method: 'POST', headers: { origin: 'https://evil.example', host: 'job-harness.test' }, body: rejectedForm }));
    expect(rejected.status).toBe(403);
  });
});
