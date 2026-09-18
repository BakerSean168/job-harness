import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJobHarnessRestClient } from '@job-harness/client';
import { SqliteResumeStore } from '../../../packages/persistence-sqlite/src/index.ts';
import { createResumeApplicationService, importResumeCatalog } from '../../../packages/resume-application/src/index.ts';
import { ResumeArtifactSchema, ResumeLibrarySchema, ResumeProfileSchema } from '../../../packages/resume-contracts/src/index.ts';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../../server/src';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
const originalApiUrl = process.env.JOB_HARNESS_API_URL;
const originalToken = process.env.JOB_HARNESS_AUTH_TOKEN;
const zh = (value: string) => ({ 'zh-CN': value });

async function seedResume(databasePath: string) {
  const store = new SqliteResumeStore(databasePath);
  try {
    const at = '2026-09-18T07:00:00.000Z';
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: { displayName: zh('测试用户'), contact: { phone: null, email: 'candidate@example.test', website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [{ id: 'frontend', label: null, content: zh('React TypeScript Vue'), keywords: ['React','TypeScript','Vue'] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'ai-frontend', libraryId: 'primary', version: 1, name: zh('AI 前端'), targetRole: zh('前端开发工程师'), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh('AI 前端 / 前端开发工程师'),
      output: { documentTitle: zh('前端简历'), description: null, onlineUrl: null, pdfName: zh('frontend.pdf') }, layout: { header: 'without-photo', pageSize: 'A4' },
      sectionOrder: ['skills'], educationIds: [], skillIds: ['frontend'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], createdAt: at, updatedAt: at, archivedAt: null,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
    const revision = (await createResumeApplicationService(store, { now: () => at }).publishRevision({ profileId: profile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 })).revision;
    const artifact = ResumeArtifactSchema.parse({
      id: 'resume-artifact-frontend-fixture', revisionId: revision.id, kind: 'pdf', mimeType: 'application/pdf', storageUri: 'file:///tmp/frontend-fixture.pdf', sha256: 'b'.repeat(64), byteSize: 256,
      rendererId: 'fixture-renderer', rendererVersion: '1', createdAt: at,
    });
    await store.transaction((tx) => tx.insertArtifact(artifact));
    return { profile, revision, artifact };
  } finally { store.close(); }
}

afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null; dir = null;
  if (originalApiUrl === undefined) delete process.env.JOB_HARNESS_API_URL; else process.env.JOB_HARNESS_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.JOB_HARNESS_AUTH_TOKEN; else process.env.JOB_HARNESS_AUTH_TOKEN = originalToken;
  vi.clearAllMocks();
});

describe('Job detail one-click autofill preparation', () => {
  it('freezes the selected resume and dispatches one idempotent fill_only user-Chrome attempt without submit authority', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-web-auto-application-'));
    const databasePath = join(dir, 'career.db');
    const seeded = await seedResume(databasePath);
    running = await startJobHarnessServer({ databasePath, host: '127.0.0.1', port: 0, authToken: 'secret', submissionReconcileIntervalMs: null });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'secret';
    const client = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'secret' });
    const jobs = await client.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Frontend Co', title: '前端开发工程师', city: '杭州', description: 'React TypeScript Vue3 TanStack Query', observedAt: '2026-09-18T07:00:00.000Z',
      listings: [{ sourceKind: 'official', url: 'https://jobs.example.test/apply/123', identityKind: 'url', status: 'active' }],
    }] });
    const jobId = jobs.items[0]!.jobId!;
    const detail = await client.workspace.getJobDetail(jobId);
    const listingId = detail!.job.listings[0]!.id;
    await client.apply.executors.register({
      executorId: 'extension-fill-worker', name: 'User Chrome', version: '0.2.0', hostLabel: 'test', status: 'ready', browserBackends: ['extension'], adapterIds: ['generic-ats'], executionModes: ['fill_only'],
      capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: false, semanticMapping: false }, maxConcurrency: 1, metadata: {},
    });

    const form = new FormData();
    form.set('jobId', jobId);
    form.set('listingId', listingId);
    form.set('preferredProfileId', seeded.profile.id);
    form.set('decisionNonce', 'render-nonce-1');
    const { prepareRecommendedApplicationAction } = await import('../src/app/jobs/actions');
    await prepareRecommendedApplicationAction(form);
    await prepareRecommendedApplicationAction(form);

    const intents = await client.submissionIntents.list({ statuses: ['planned'], limit: 20, offset: 0 });
    const intent = intents.items.find((item) => item.jobId === jobId)!;
    expect(intent).toMatchObject({
      resumeProfileId: seeded.profile.id,
      resumeRevisionId: seeded.revision.id,
      resumeArtifactId: seeded.artifact.id,
      executor: 'browser-extension',
      status: 'planned',
    });
    const attempts = await client.apply.attempts.list({ intentId: intent.id, limit: 20, offset: 0 });
    expect(attempts.total).toBe(1);
    expect(attempts.items[0]).toMatchObject({
      executionMode: 'fill_only', preferredBrowserBackend: 'extension', externalEffectState: 'not_crossed',
      requiredCapabilities: ['humanControl','persistentSession','resumeUpload'],
      policySnapshot: { allowFormFill: true, allowApplicationEntry: true, submitAllowed: false, initiatedBy: 'user-web-auto-fill' },
    });
    const { redirect } = await import('next/navigation');
    expect(redirect).toHaveBeenCalledWith(`/executors/${attempts.items[0]!.id}`);
    expect((await client.workspace.listApplicationBoard({ limit: 20, offset: 0 })).total).toBe(0);
  });
});
