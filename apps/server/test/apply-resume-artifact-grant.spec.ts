import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createResumeApplicationService, importResumeCatalog } from '@job-harness/resume-application';
import { ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { SqliteResumeStore } from '@job-harness/persistence-sqlite';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let renderer: Server | null = null;
let dir: string | null = null;
afterEach(async () => {
  if (running) await running.close();
  if (renderer) await new Promise<void>((resolve) => renderer!.close(() => resolve()));
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null; renderer = null; dir = null;
});

const now = '2026-09-17T11:00:00.000Z';
const both = (value: string) => ({ 'zh-CN': value, en: value });

async function seedRevision(databasePath: string): Promise<string> {
  const store = new SqliteResumeStore(databasePath);
  try {
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: { displayName: both('Grant User'), contact: { phone: null, email: null, website: null, github: null, location: null }, photoAssetId: null },
      education: [], skills: [{ id: 'ts', label: null, content: both('TypeScript'), keywords: ['typescript'] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: now, updatedAt: now,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'frontend', libraryId: library.id, version: 1, name: both('Frontend Resume'), targetRole: both('Frontend Engineer'), locale: 'zh-CN', templateId: 'classic-v1', positioning: both('Frontend Engineer'), output: { documentTitle: both('Frontend Resume'), description: null, onlineUrl: null, pdfName: both('frontend-resume') }, layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: ['ts'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], archivedAt: null, createdAt: now, updatedAt: now,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
    return (await createResumeApplicationService(store, { now: () => now }).publishRevision({ profileId: profile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 })).revision.id;
  } finally { store.close(); }
}

async function startFakeRenderer(): Promise<string> {
  const pdf = new TextEncoder().encode('%PDF-frozen-grant-fixture');
  renderer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, rendererId: 'fixture-renderer', rendererVersion: '1' }));
      return;
    }
    if (req.url === '/render/pdf' && req.method === 'POST') {
      req.resume();
      res.setHeader('content-type', 'application/pdf');
      res.end(Buffer.from(pdf));
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((resolve) => renderer!.listen(0, '127.0.0.1', () => resolve()));
  const address = renderer.address();
  if (!address || typeof address === 'string') throw new Error('renderer did not bind TCP');
  return `http://127.0.0.1:${address.port}`;
}

async function request(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${running!.apiUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

describe('lease-scoped Resume Artifact grant', () => {
  it('gives the worker only the exact frozen PDF bound to its currently valid attempt lease', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-apply-artifact-grant-'));
    const databasePath = join(dir, 'career.db');
    const revisionId = await seedRevision(databasePath);
    const rendererUrl = await startFakeRenderer();
    running = await startJobHarnessServer({
      databasePath, artifactDirectory: join(dir, 'artifacts'), resumeRendererUrl: rendererUrl,
      host: '127.0.0.1', port: 0, authToken: 'global-secret', executorAuthToken: 'worker-secret',
    });

    const materialized = await request(`/resume/revisions/${revisionId}/artifacts`, 'global-secret', { method: 'POST', body: JSON.stringify({ kind: 'pdf' }) });
    expect(materialized.response.status).toBe(200);
    const artifactId = String(materialized.body.artifact.id);
    const artifactSha = String(materialized.body.artifact.sha256);

    const inserted = await request('/jobs/batch', 'global-secret', { method: 'POST', body: JSON.stringify({ jobs: [{
      companyName: 'Grant Co', title: 'Frontend Engineer', city: 'Hangzhou', observedAt: now,
      listings: [{ sourceKind: 'official', url: 'https://jobs.example.test/grant', identityKind: 'url', status: 'active' }],
    }] }) });
    const jobId = String(inserted.body.items[0].jobId);
    const job = await request(`/jobs/${jobId}`, 'global-secret');
    const listingId = String(job.body.job.listings[0].id);

    const intent = await request('/submission-intents', 'global-secret', { method: 'POST', body: JSON.stringify({
      jobId, listingId, resumeRevisionId: revisionId, resumeArtifactId: artifactId, executor: 'other',
      externalTargetUrl: 'https://jobs.example.test/grant', idempotencyKey: 'grant-intent-1',
    }) });
    const intentId = String(intent.body.id);

    await request('/executors/register', 'worker-secret', { method: 'POST', body: JSON.stringify({
      executorId: 'worker-grant', name: 'Grant Worker', version: '0.2.0', status: 'ready', browserBackends: ['steel'],
      adapterIds: ['readiness-v1'], executionModes: ['fill_only'], capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: false, semanticMapping: false }, maxConcurrency: 1, metadata: {},
    }) });
    const dispatched = await request('/execution-attempts', 'global-secret', { method: 'POST', body: JSON.stringify({
      intentId, executionMode: 'fill_only', requiredAdapterId: 'readiness-v1', preferredBrowserBackend: 'steel', requiredCapabilities: ['resumeUpload'], policySnapshot: { readinessOnly: true }, idempotencyKey: 'grant-attempt-1',
    }) });
    const attemptId = String(dispatched.body.id);
    const claimed = await request('/execution-attempts/claim', 'worker-secret', { method: 'POST', body: JSON.stringify({ executorId: 'worker-grant', leaseSeconds: 90 }) });
    const leaseToken = String(claimed.body.leaseToken);

    const grant = await request(`/execution-attempts/${attemptId}/resume-artifact`, 'worker-secret', {
      method: 'POST', body: JSON.stringify({ executorId: 'worker-grant', leaseToken }),
    });
    expect(grant.response.status).toBe(200);
    expect(grant.body).toMatchObject({ artifactId, revisionId, mimeType: 'application/pdf', sha256: artifactSha });
    const bytes = Buffer.from(String(grant.body.bytesBase64), 'base64');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifactSha);
    expect(bytes.byteLength).toBe(grant.body.byteSize);

    const wrongLease = await request(`/execution-attempts/${attemptId}/resume-artifact`, 'worker-secret', {
      method: 'POST', body: JSON.stringify({ executorId: 'worker-grant', leaseToken: `wrong-${'x'.repeat(40)}` }),
    });
    expect(wrongLease.response.status).toBe(409);
    expect(wrongLease.body).toMatchObject({ error: { code: 'LEASE_LOST' } });

    const unrestrictedDownload = await fetch(`${running.apiUrl}/resume/artifacts/${artifactId}/content`, { headers: { authorization: 'Bearer worker-secret' } });
    expect(unrestrictedDownload.status).toBe(401);
  });
});
