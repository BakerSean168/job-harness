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

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
const originalApiUrl = process.env.JOB_HARNESS_API_URL;
const originalToken = process.env.JOB_HARNESS_AUTH_TOKEN;
const both = (value: string) => ({ 'zh-CN': value, en: value });

async function seedRevision(databasePath: string): Promise<string> {
  const store = new SqliteResumeStore(databasePath);
  try {
    const at = '2026-09-17T13:20:00.000Z';
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: { displayName: both('Dispatch User'), contact: { phone: null, email: 'dispatch@example.test', website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [{ id: 'ts', label: null, content: both('TypeScript'), keywords: ['typescript'] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'frontend', libraryId: library.id, version: 1, name: both('Frontend Resume'), targetRole: both('Frontend Engineer'), locale: 'zh-CN', templateId: 'classic-v1', positioning: both('Frontend Engineer'),
      output: { documentTitle: both('Frontend Resume'), description: null, onlineUrl: null, pdfName: both('frontend-resume') }, layout: { header: 'without-photo', pageSize: 'A4' },
      sectionOrder: ['skills'], educationIds: [], skillIds: ['ts'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], archivedAt: null, createdAt: at, updatedAt: at,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
    return (await createResumeApplicationService(store, { now: () => at }).publishRevision({ profileId: profile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 })).revision.id;
  } finally { store.close(); }
}


afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
  if (originalApiUrl === undefined) delete process.env.JOB_HARNESS_API_URL; else process.env.JOB_HARNESS_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.JOB_HARNESS_AUTH_TOKEN; else process.env.JOB_HARNESS_AUTH_TOKEN = originalToken;
  vi.clearAllMocks();
});

describe('Web prepared-intent safe-fill dispatch action', () => {
  it('queues one idempotent fill_only attempt while keeping SubmissionIntent planned and submit disabled', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-web-dispatch-'));
    const databasePath = join(dir, 'career.db');
    const revisionId = await seedRevision(databasePath);
    const artifactId = 'artifact-dispatch-1';
    const resumeStore = new SqliteResumeStore(databasePath);
    try {
      await resumeStore.transaction(async (tx) => {
        await tx.insertArtifact(ResumeArtifactSchema.parse({
          id: artifactId,
          revisionId,
          kind: 'pdf',
          mimeType: 'application/pdf',
          storageUri: 'file:///tmp/dispatch-fixture.pdf',
          sha256: 'a'.repeat(64),
          byteSize: 128,
          rendererId: 'fixture-renderer',
          rendererVersion: '1',
          createdAt: '2026-09-17T13:20:00.000Z',
        }));
      });
    } finally {
      resumeStore.close();
    }
    running = await startJobHarnessServer({ databasePath, host: '127.0.0.1', port: 0, authToken: 'dispatch-secret', submissionReconcileIntervalMs: null });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'dispatch-secret';
    const client = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'dispatch-secret' });
    const now = '2026-09-17T13:20:00.000Z';

    const jobs = await client.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Dispatch Co', title: 'Frontend Engineer', city: 'Hangzhou', observedAt: now,
      listings: [{ sourceKind: 'other', url: 'https://www.nowcoder.com/jobs/detail/457892', identityKind: 'url', status: 'active' }],
    }] });
    const jobId = jobs.items[0]!.jobId!;
    const job = await client.workspace.getJobDetail(jobId);
    const listingId = job!.job.listings[0]!.id;
    const intent = await client.submissionIntents.prepare({
      jobId, listingId, resumeRevisionId: revisionId, resumeArtifactId: artifactId, executor: 'other', externalTargetUrl: 'https://www.nowcoder.com/jobs/detail/457892', idempotencyKey: 'dispatch-intent-1',
    });

    const form = new FormData();
    form.set('intentId', intent.id);
    form.set('decisionNonce', 'render-decision-1');
    const { dispatchPreparedIntentAction } = await import('../src/app/executors/actions');
    await dispatchPreparedIntentAction(form);
    await dispatchPreparedIntentAction(form);

    const attempts = await client.apply.attempts.list({ intentId: intent.id, limit: 20, offset: 0 });
    expect(attempts.total).toBe(1);
    expect(attempts.items[0]).toMatchObject({
      state: 'queued', executionMode: 'fill_only', preferredBrowserBackend: 'steel', requiredAdapterId: null,
      externalEffectState: 'not_crossed', requiredCapabilities: ['humanControl', 'persistentSession', 'resumeUpload'],
      policySnapshot: { allowFormFill: true, allowApplicationEntry: true, submitAllowed: false, initiatedBy: 'user-web' },
    });
    expect((await client.submissionIntents.get(intent.id))?.status).toBe('planned');
    expect((await client.workspace.listApplicationBoard({ limit: 20, offset: 0 })).total).toBe(0);

    const { revalidatePath } = await import('next/cache');
    expect(revalidatePath).toHaveBeenCalledWith('/executors');
  });
});
