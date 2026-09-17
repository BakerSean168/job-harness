import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { CareerExportSnapshotSchema } from '@job-harness/contracts';
import { SqliteCareerStore } from '@job-harness/persistence-sqlite';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;

afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
});

describe('data export and backup', () => {
  it('downloads a logical Career export and a standalone SQLite backup', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-export-'));
    const databasePath = join(dir, 'career.db');
    const seedStore = new SqliteCareerStore(databasePath);
    try {
      const career = createCareerApplicationService(seedStore, { now: () => '2026-09-16T12:00:00.000Z' });
      await career.resumeRegistry.syncResumeProfiles([{
        id: 'resume-export', name: 'Export Resume', source: 'resume-harness', externalProfileId: 'export',
        targetRole: 'Agent', version: 'v1', hash: 'hash-export', artifactUri: 'file:///resume/export.pdf', updatedAt: '2026-09-16T08:00:00.000Z',
      }]);
      await career.campaigns.upsertCampaign({
        id: 'campaign-export', name: 'Export Campaign', targetRoles: ['Agent Engineer'], cities: ['Hangzhou'], graduationYears: [2026], experience: ['0-1y'], keywords: ['agent'], exclusions: [], sources: ['official'], resumeProfileIds: ['resume-export'], status: 'active',
      });
      const run = await career.discovery.beginDiscoveryRun({ campaignId: 'campaign-export', executor: 'manual', contextSnapshot: { query: 'agent' }, startedAt: '2026-09-16T08:00:00.000Z', idempotencyKey: 'export-run' });
      const jobs = await career.jobs.upsertJobsBatch({ jobs: [{
        companyName: 'Export Co', title: 'Agent Engineer', city: 'Hangzhou',
        listings: [{ sourceKind: 'official', url: 'https://example.com/export-role', identityKind: 'url', status: 'active' }],
        description: 'Exportable role', observedAt: '2026-09-16T08:00:00.000Z', discoveryRunId: run.id,
      }] });
      const jobId = jobs.items[0]!.jobId!;
      await career.jobs.setJobState({ jobId, state: 'shortlisted', idempotencyKey: 'export-shortlist' });
      await career.submissionIntents.prepare({
        jobId, executor: 'manual', executorSessionId: 'export-session', idempotencyKey: 'export-intent', note: 'Prepared but intentionally not submitted',
      });
      const application = await career.applications.recordApplication({ jobId, appliedAt: '2026-09-16T09:00:00.000Z', resumeProfileId: 'resume-export', idempotencyKey: 'export-application', actor: 'user', note: 'Submitted' });
      await career.applications.transitionApplication({ applicationId: application.application.id, toStage: 'screening', occurredAt: '2026-09-16T10:00:00.000Z', idempotencyKey: 'export-screening', actor: 'user' });
      await career.discovery.completeDiscoveryRun({ runId: run.id, completedAt: '2026-09-16T08:10:00.000Z', candidateCount: 1, insertedCount: 1, duplicateCount: 0, rejectedCount: 0 });
    } finally {
      seedStore.close();
    }

    running = await startJobHarnessServer({ databasePath, host: '127.0.0.1', port: 0 });

    const exportResponse = await fetch(`${running.apiUrl}/export`);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get('content-disposition')).toMatch(/attachment; filename="job-harness-export-.*\.json"/);
    const exported = CareerExportSnapshotSchema.parse(await exportResponse.json());
    expect(exported).toMatchObject({ format: 'job-harness-career-export', schemaVersion: 3 });
    expect(exported.companies).toHaveLength(1);
    expect(exported.jobs).toHaveLength(1);
    expect(exported.jobs[0]?.listings).toHaveLength(1);
    expect(exported.observations).toHaveLength(1);
    expect(exported.applications).toHaveLength(1);
    expect(exported.applications[0]?.timeline.map((event) => event.type)).toEqual(['application_recorded', 'stage_changed']);
    expect(exported.campaigns).toHaveLength(1);
    expect(exported.resumes).toHaveLength(1);
    expect(exported.discoveryRuns).toHaveLength(1);
    expect(exported.submissionIntents).toEqual([expect.objectContaining({ executorSessionId: 'export-session', status: 'planned' })]);

    const backupResponse = await fetch(`${running.apiUrl}/backup`);
    expect(backupResponse.status).toBe(200);
    expect(backupResponse.headers.get('content-disposition')).toMatch(/attachment; filename="job-harness-backup-.*\.db"/);
    const backupBytes = new Uint8Array(await backupResponse.arrayBuffer());
    expect(new TextDecoder().decode(backupBytes.slice(0, 16))).toBe('SQLite format 3\u0000');
    const downloadedPath = join(dir, 'downloaded.db');
    await writeFile(downloadedPath, backupBytes);

    const downloaded = new DatabaseSync(downloadedPath, { readOnly: true });
    try {
      expect(downloaded.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      expect(downloaded.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 1 });
      expect(downloaded.prepare('SELECT COUNT(*) AS n FROM applications').get()).toEqual({ n: 1 });
      expect(downloaded.prepare('SELECT COUNT(*) AS n FROM job_listings').get()).toEqual({ n: 1 });
    } finally {
      downloaded.close();
    }
  });
});
