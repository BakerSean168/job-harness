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
  running = null;
  dir = null;
});
const both = (value: string) => ({ 'zh-CN': value, en: value });
const now = '2026-09-17T04:00:00.000Z';

async function seedRevision(databasePath: string): Promise<string> {
  const store = new SqliteResumeStore(databasePath);
  try {
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: { displayName: both('Submission User'), contact: { phone: null, email: null, website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [{ id: 'ts', label: null, content: both('TypeScript'), keywords: ['typescript'] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: now, updatedAt: now,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'agent-profile', libraryId: library.id, version: 1, name: both('Agent Resume'), targetRole: both('Agent Engineer'), locale: 'zh-CN', templateId: 'classic-v1', positioning: both('Agent Engineer'), output: { documentTitle: both('Agent Resume'), description: null, onlineUrl: null, pdfName: both('agent-resume') }, layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: ['ts'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], archivedAt: null, createdAt: now, updatedAt: now,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
    return (await createResumeApplicationService(store, { now: () => now }).publishRevision({ profileId: profile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 })).revision.id;
  } finally { store.close(); }
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${running!.apiUrl}${path}`, {
    ...init,
    headers: { authorization: 'Bearer submission-secret', 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const type = response.headers.get('content-type') ?? '';
  return { response, body: type.includes('application/json') ? await response.json() : await response.text() };
}

describe('ApplicationSubmission -> Resume Revision/Artifact', () => {
  it('records exact immutable submission evidence without requiring the legacy Resume Registry projection', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-submission-'));
    const databasePath = join(dir, 'career.db');
    const revisionId = await seedRevision(databasePath);
    running = await startJobHarnessServer({ databasePath, artifactDirectory: join(dir, 'artifacts'), host: '127.0.0.1', port: 0, authToken: 'submission-secret' });

    const artifactResult = await request(`/resume/revisions/${encodeURIComponent(revisionId)}/artifacts`, { method: 'POST', body: JSON.stringify({ kind: 'html' }) });
    expect(artifactResult.response.status).toBe(200);
    const artifactId = String((artifactResult.body as any).artifact.id);

    const inserted = await request('/jobs/batch', { method: 'POST', body: JSON.stringify({ jobs: [{ companyName: 'Submission Co', title: 'Agent Engineer', city: 'Hangzhou', listings: [{ sourceKind: 'official', url: 'https://example.invalid/submission', identityKind: 'url', status: 'active' }], observedAt: now }] }) });
    const jobId = String((inserted.body as any).items[0].jobId);
    const jobDetail = await request(`/jobs/${encodeURIComponent(jobId)}`);
    const listingId = String((jobDetail.body as any).primaryListing.id);

    const recorded = await request('/applications', { method: 'POST', body: JSON.stringify({
      jobId, appliedAt: '2026-09-17T04:10:00.000Z', listingId, channel: 'referral', resumeRevisionId: revisionId, resumeArtifactId: artifactId, idempotencyKey: 'submission-with-revision', actor: 'user', note: 'Referral submission with exact resume artifact',
    }) });
    expect(recorded.response.status).toBe(201);
    expect((recorded.body as any).application.resumeProfileId).toBeNull();
    expect((recorded.body as any).submissions).toEqual([expect.objectContaining({
      listingId, channel: 'referral', resumeProfileId: 'agent-profile', resumeRevisionId: revisionId, resumeArtifactId: artifactId, idempotencyKey: 'submission-with-revision',
    })]);

    const detail = await request(`/applications/${encodeURIComponent(String((recorded.body as any).application.id))}`);
    expect((detail.body as any).submissionCount).toBe(1);
    expect((detail.body as any).submissions[0]).toMatchObject({ resumeRevisionId: revisionId, resumeArtifactId: artifactId });

    const retry = await request('/applications', { method: 'POST', body: JSON.stringify({
      jobId, appliedAt: '2026-09-17T04:10:00.000Z', listingId, channel: 'referral', resumeRevisionId: revisionId, resumeArtifactId: artifactId, idempotencyKey: 'submission-with-revision', actor: 'user', note: 'Referral submission with exact resume artifact',
    }) });
    expect(retry.response.status).toBe(201);
    expect((retry.body as any).submissions).toHaveLength(1);

    const invalid = await request('/applications', { method: 'POST', body: JSON.stringify({
      jobId, appliedAt: '2026-09-17T04:20:00.000Z', resumeRevisionId: 'missing-revision', idempotencyKey: 'missing-revision', actor: 'user',
    }) });
    expect(invalid.response.status).toBe(404);
  });
});
