import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJobHarnessRestClient } from '@job-harness/client';
import { ApplicantProfileSchema, ApplicationAnswerSetSchema } from '../../../packages/applicant-contracts/src/index.ts';
import { createApplicantApplicationService } from '../../../packages/applicant-application/src/index.ts';
import { SqliteApplicantStore, SqliteResumeStore } from '../../../packages/persistence-sqlite/src/index.ts';
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
const at = '2026-09-18T07:40:00.000Z';
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
  const resumeStore = new SqliteResumeStore(databasePath);
  const applicantStore = new SqliteApplicantStore(databasePath);
  try {
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: { displayName: zh('测试用户'), contact: { phone: zh('13800000000'), email: 'candidate@example.test', website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [{ id: 'agent', label: null, content: zh('Agent Harness MCP'), keywords: ['Agent Harness','MCP'] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'ai-agent-forgeflow', libraryId: 'primary', version: 1, name: zh('ForgeFlow'), targetRole: zh('AI Agent / 大模型应用开发工程师'), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh('AI Agent'),
      output: { documentTitle: zh('Agent 简历'), description: null, onlineUrl: null, pdfName: zh('测试用户-ForgeFlow.pdf') }, layout: { header: 'without-photo', pageSize: 'A4' },
      sectionOrder: ['skills'], educationIds: [], skillIds: ['agent'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], createdAt: at, updatedAt: at, archivedAt: null,
    });
    await importResumeCatalog(resumeStore, { library, profiles: [profile] });
    const revision = (await createResumeApplicationService(resumeStore, { now: () => at }).publishRevision({ profileId: profile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 })).revision;
    const artifact = ResumeArtifactSchema.parse({ id: 'email-web-artifact', revisionId: revision.id, kind: 'pdf', mimeType: 'application/pdf', storageUri: 'file:///tmp/email-web.pdf', sha256: 'd'.repeat(64), byteSize: 100, rendererId: 'fixture', rendererVersion: '1', createdAt: at });
    await resumeStore.transaction((tx) => tx.insertArtifact(artifact));
    const applicant = createApplicantApplicationService(applicantStore, { now: () => at });
    await applicant.ensureDefaults({
      profile: ApplicantProfileSchema.parse({ id: 'default', version: 1, displayName: '测试用户', phone: '13800000000', email: 'candidate@example.test', location: null, website: null, github: null, education: [{ id: 'edu', school: '测试大学', major: '物联网工程', degree: '本科', department: null, location: null, startMonth: '2022-09', endMonth: '2026-06' }], targetRoles: ['AI Agent'], targetCities: ['杭州'], availableFrom: '立即', notes: null, createdAt: at, updatedAt: at }),
      answerSet: ApplicationAnswerSetSchema.parse({ id: 'default', version: 1, name: 'Default', entries: [], createdAt: at, updatedAt: at }),
    });
    return { profile, revision, artifact };
  } finally { applicantStore.close(); resumeStore.close(); }
}

describe('Email application Web action', () => {
  it('prepares one immutable email package and redirects to its review page without beginning external send', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-web-email-'));
    const databasePath = join(dir, 'career.db');
    const seeded = await seed(databasePath);
    running = await startJobHarnessServer({ databasePath, host: '127.0.0.1', port: 0, authToken: 'secret', submissionReconcileIntervalMs: null });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'secret';
    const client = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'secret' });
    const jobs = await client.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Mail Co', title: 'Agent开发工程师', description: 'Agent Harness MCP', observedAt: at,
      listings: [{ sourceKind: 'email', externalNamespace: 'email', externalId: 'mail-1', identityKind: 'external-id', status: 'active', metadataSnapshot: { contactEmail: 'recruit@example.test' } }],
    }] });
    const jobId = jobs.items[0]!.jobId!;
    const detail = await client.workspace.getJobDetail(jobId);
    const form = new FormData();
    form.set('jobId', jobId);
    form.set('listingId', detail!.job.listings[0]!.id);
    form.set('preferredProfileId', seeded.profile.id);
    form.set('decisionNonce', 'email-render-1');
    const { prepareEmailApplicationAction } = await import('../src/app/jobs/actions');
    await prepareEmailApplicationAction(form);
    await prepareEmailApplicationAction(form);

    const intents = await client.submissionIntents.list({ statuses: ['planned'], limit: 20, offset: 0 });
    expect(intents.total).toBe(1);
    const intent = intents.items[0]!;
    expect(intent).toMatchObject({ channel: 'email', status: 'planned', resumeRevisionId: seeded.revision.id, resumeArtifactId: seeded.artifact.id, externalStartedAt: null });
    const pkg = await client.emailApplications.prepare(jobId, { preferredProfileId: seeded.profile.id, listingId: detail!.job.listings[0]!.id, idempotencyKey: `web:email-package:${jobId}:${seeded.profile.id}:email-render-1` });
    expect(pkg.package.recipient).toBe('recruit@example.test');
    expect(pkg.package.draftHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pkg.intent.status).toBe('planned');

    const authForm = new FormData();
    authForm.set('packageId', pkg.package.id);
    authForm.set('draftHash', pkg.package.draftHash);
    authForm.set('decisionNonce', 'email-send-render-1');
    const { authorizeEmailApplicationSendAction } = await import('../src/app/jobs/actions');
    await authorizeEmailApplicationSendAction(authForm);
    const authorizations = await client.emailApplications.listSendAuthorizations(20);
    expect(authorizations.items).toHaveLength(1);
    expect(authorizations.items[0]).toMatchObject({ packageId: pkg.package.id, draftHash: pkg.package.draftHash, status: 'active' });
    expect((await client.submissionIntents.get(intent.id))?.status).toBe('planned');

    const { redirect } = await import('next/navigation');
    expect(redirect).toHaveBeenCalledWith(`/email-applications/${pkg.package.id}`);
    expect((await client.workspace.listApplicationBoard({ limit: 20, offset: 0 })).total).toBe(0);
  });
});
