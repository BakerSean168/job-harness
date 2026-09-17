import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createResumeApplicationService, importResumeCatalog } from '@job-harness/resume-application';
import { ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { SqliteResumeStore } from '@job-harness/persistence-sqlite';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null; dir = null;
});

const now = '2026-09-17T12:20:00.000Z';
const both = (cn: string, en: string) => ({ 'zh-CN': cn, en });

async function seedRevision(databasePath: string): Promise<string> {
  const store = new SqliteResumeStore(databasePath);
  try {
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: {
        displayName: both('测试候选人', 'Test Candidate'),
        contact: { phone: both('13800138000', '+86 13800138000'), email: 'candidate@example.test', website: 'https://example.test', github: 'https://github.com/example', location: both('杭州', 'Hangzhou') },
        photoAssetId: null,
      },
      education: [{ id: 'school', institution: both('四川农业大学', 'Sichuan Agricultural University'), major: both('物联网工程', 'IoT Engineering'), degree: both('本科', 'Bachelor'), period: { start: '2022-09', end: '2026-06', current: false, note: null } }],
      skills: [{ id: 'web', content: both('<strong>前端：</strong>TypeScript / React', 'TypeScript / React') }],
      workExperiences: [{ id: 'intern', company: both('示例科技', 'Example Tech'), role: both('前端实习生', 'Frontend Intern'), period: { start: '2025-07', end: '2025-11', current: false, note: null }, bullets: [{ id: 'delivery', content: both('<strong>交付：</strong>完成业务功能', 'Delivered product features') }] }],
      projects: [{ id: 'project', name: both('ForgeFlow', 'ForgeFlow'), period: { start: '2026-01', end: null, current: true, note: null }, presentations: [{ id: 'default', description: both('自主软件工程系统', 'Autonomous software engineering system'), stack: both('TypeScript / Python', 'TypeScript / Python') }], highlights: [{ id: 'runtime', detail: both('构建 Agent Runtime', 'Built Agent Runtime') }] }],
      certificates: [], summaries: [], createdAt: now, updatedAt: now,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'frontend', libraryId: 'primary', version: 1, name: both('前端开发工程师', 'Frontend Engineer'), targetRole: both('前端开发工程师', 'Frontend Engineer'), locale: 'zh-CN', templateId: 'classic-v1', positioning: both('前端开发工程师', 'Frontend Engineer'),
      output: { documentTitle: both('前端开发简历', 'Frontend Resume'), description: null, onlineUrl: null, pdfName: both('测试候选人-前端开发工程师', 'candidate-frontend') },
      layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['education','skills','work','projects'], educationIds: ['school'], skillIds: ['web'], workSelections: [{ experienceId: 'intern', bulletIds: ['delivery'] }], projectSelections: [{ projectId: 'project', presentationId: 'default', highlightIds: ['runtime'] }], certificateIds: [], summaryIds: [], overrides: [], archivedAt: null, createdAt: now, updatedAt: now,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
    return (await createResumeApplicationService(store, { now: () => now }).publishRevision({ profileId: profile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 })).revision.id;
  } finally { store.close(); }
}

async function request(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${running!.apiUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

describe('lease-scoped applicant data derived from immutable Resume Revision', () => {
  it('exposes a value-free catalog and resolves only requested literal facts without giving the worker unrestricted Resume access', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-applicant-grant-'));
    const databasePath = join(dir, 'career.db');
    const revisionId = await seedRevision(databasePath);
    running = await startJobHarnessServer({ databasePath, host: '127.0.0.1', port: 0, authToken: 'global-secret', executorAuthToken: 'worker-secret' });

    const inserted = await request('/jobs/batch', 'global-secret', { method: 'POST', body: JSON.stringify({ jobs: [{
      companyName: 'Applicant Co', title: 'Frontend Engineer', city: 'Hangzhou', observedAt: now,
      listings: [{ sourceKind: 'official', url: 'https://jobs.example.test/applicant', identityKind: 'url', status: 'active' }],
    }] }) });
    const jobId = String(inserted.body.items[0].jobId);
    const job = await request(`/jobs/${jobId}`, 'global-secret');
    const listingId = String(job.body.job.listings[0].id);
    const intent = await request('/submission-intents', 'global-secret', { method: 'POST', body: JSON.stringify({
      jobId, listingId, resumeRevisionId: revisionId, executor: 'other', externalTargetUrl: 'https://jobs.example.test/applicant', idempotencyKey: 'applicant-intent-1',
    }) });

    await request('/executors/register', 'worker-secret', { method: 'POST', body: JSON.stringify({
      executorId: 'worker-applicant', name: 'Applicant Worker', version: '0.2.0', status: 'ready', browserBackends: ['steel'],
      adapterIds: ['generic-ats'], executionModes: ['fill_only'], capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: false, semanticMapping: false }, maxConcurrency: 1, metadata: {},
    }) });
    const dispatched = await request('/execution-attempts', 'global-secret', { method: 'POST', body: JSON.stringify({
      intentId: intent.body.id, executionMode: 'fill_only', requiredAdapterId: 'generic-ats', preferredBrowserBackend: 'steel', requiredCapabilities: ['humanControl'], policySnapshot: { allowFormFill: true, shadowFill: true }, idempotencyKey: 'applicant-attempt-1',
    }) });
    const attemptId = String(dispatched.body.id);
    const claimed = await request('/execution-attempts/claim', 'worker-secret', { method: 'POST', body: JSON.stringify({ executorId: 'worker-applicant', leaseSeconds: 90 }) });
    const leaseToken = String(claimed.body.leaseToken);

    const catalog = await request(`/execution-attempts/${attemptId}/applicant-data/catalog`, 'worker-secret', {
      method: 'POST', body: JSON.stringify({ executorId: 'worker-applicant', leaseToken }),
    });
    expect(catalog.response.status).toBe(200);
    expect(catalog.body.version).toContain(`resume-revision:${revisionId}`);
    expect(catalog.body.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'person.full_name', valueType: 'text', source: 'job-harness-resume-revision' }),
      expect.objectContaining({ key: 'contact.email', valueType: 'email', sensitivity: 'sensitive' }),
      expect.objectContaining({ key: 'education[0].school' }),
      expect.objectContaining({ key: 'work[0].description' }),
      expect.objectContaining({ key: 'projects[0].description' }),
    ]));
    const catalogSerialized = JSON.stringify(catalog.body);
    expect(catalogSerialized).not.toContain('测试候选人');
    expect(catalogSerialized).not.toContain('candidate@example.test');
    expect(catalogSerialized).not.toContain('四川农业大学');

    const resolved = await request(`/execution-attempts/${attemptId}/applicant-data/resolve`, 'worker-secret', {
      method: 'POST', body: JSON.stringify({ executorId: 'worker-applicant', leaseToken, keys: ['person.full_name','contact.email','education[0].school','work[0].description','legal.work_authorization'] }),
    });
    expect(resolved.response.status).toBe(200);
    expect(resolved.body.catalogVersion).toBe(catalog.body.version);
    expect(resolved.body.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'person.full_name', value: '测试候选人', literal: true }),
      expect.objectContaining({ key: 'contact.email', value: 'candidate@example.test', literal: true }),
      expect.objectContaining({ key: 'education[0].school', value: '四川农业大学', literal: true }),
      expect.objectContaining({ key: 'work[0].description', value: '交付：完成业务功能', literal: true }),
    ]));
    expect(resolved.body.values.some((item: { key: string }) => item.key === 'legal.work_authorization')).toBe(false);
    expect(JSON.stringify(resolved.body)).not.toContain('13800138000');

    const wrongLease = await request(`/execution-attempts/${attemptId}/applicant-data/catalog`, 'worker-secret', {
      method: 'POST', body: JSON.stringify({ executorId: 'worker-applicant', leaseToken: `wrong-${'x'.repeat(40)}` }),
    });
    expect(wrongLease.response.status).toBe(409);
    expect(wrongLease.body).toMatchObject({ error: { code: 'LEASE_LOST' } });

    const unrestrictedRevision = await fetch(`${running.apiUrl}/resume/revisions/${revisionId}`, { headers: { authorization: 'Bearer worker-secret' } });
    expect(unrestrictedRevision.status).toBe(401);
  });
});
