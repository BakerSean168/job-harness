import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '@job-harness/persistence-sqlite';
import { startJobHarnessServer } from '../src';

const databasePath = resolve(process.env.JOB_HARNESS_E2E_DB ?? '../../.tmp/e2e/career.db');
const host = '127.0.0.1';
const port = Number(process.env.JOB_HARNESS_PORT ?? 3200);
const authToken = process.env.JOB_HARNESS_AUTH_TOKEN ?? 'e2e-api-token';
const now = '2026-09-16T12:00:00.000Z';

await rm(dirname(databasePath), { recursive: true, force: true });
await mkdir(dirname(databasePath), { recursive: true });

let id = 0;
const seedStore = new SqliteCareerStore(databasePath);
try {
  const career = createCareerApplicationService(seedStore, {
    now: () => now,
    idFactory: () => `e2e-${++id}`,
  });

  await career.resumeRegistry.syncResumeProfiles([{
    id: 'e2e-resume-agent',
    name: 'E2E Agent Resume',
    source: 'resume-harness',
    externalProfileId: 'e2e-agent',
    targetRole: 'AI Agent Engineer',
    version: 'v1',
    hash: 'e2e-resume-hash',
    artifactUri: 'file:///e2e/agent.pdf',
    updatedAt: '2026-09-16T08:00:00.000Z',
  }]);

  await career.campaigns.upsertCampaign({
    id: 'e2e-campaign',
    name: 'E2E Campaign',
    targetRoles: ['AI Agent Engineer'],
    cities: ['Hangzhou'],
    graduationYears: [2026],
    experience: ['0-1y'],
    keywords: ['Agent', 'MCP'],
    exclusions: [],
    sources: ['official'],
    resumeProfileIds: ['e2e-resume-agent'],
    status: 'active',
  });

  const run = await career.discovery.beginDiscoveryRun({
    campaignId: 'e2e-campaign',
    executor: 'manual',
    contextSnapshot: { purpose: 'browser-e2e' },
    startedAt: '2026-09-16T08:00:00.000Z',
    idempotencyKey: 'e2e-discovery',
  });

  const inserted = await career.jobs.upsertJobsBatch({
    jobs: [{
      companyName: 'E2E Labs',
      title: 'E2E Agent Engineer',
      city: 'Hangzhou',
      description: 'Deterministic browser E2E fixture for Job Harness.',
      listings: [{
        sourceKind: 'official',
        label: 'E2E Careers',
        url: 'https://example.com/e2e-agent-engineer',
        identityKind: 'url',
        status: 'active',
      }],
      observedAt: '2026-09-16T08:00:00.000Z',
      discoveryRunId: run.id,
    }],
  });
  const jobId = inserted.items[0]?.jobId;
  if (!jobId) throw new Error('E2E fixture Job was not inserted');

  await career.jobs.setJobState({ jobId, state: 'shortlisted', idempotencyKey: 'e2e-shortlist' });
  const application = await career.applications.recordApplication({
    jobId,
    appliedAt: '2026-09-16T09:00:00.000Z',
    resumeProfileId: 'e2e-resume-agent',
    idempotencyKey: 'e2e-application',
    actor: 'user',
    note: 'E2E submission',
  });
  await career.applications.transitionApplication({
    applicationId: application.application.id,
    toStage: 'screening',
    occurredAt: '2026-09-16T10:00:00.000Z',
    idempotencyKey: 'e2e-screening',
    actor: 'user',
    note: 'E2E screening',
  });
  await career.discovery.completeDiscoveryRun({
    runId: run.id,
    completedAt: '2026-09-16T08:10:00.000Z',
    candidateCount: 1,
    insertedCount: 1,
    duplicateCount: 0,
    rejectedCount: 0,
  });
} finally {
  seedStore.close();
}

const running = await startJobHarnessServer({ databasePath, host, port, authToken });
console.log(`E2E Job Harness API ready at ${running.apiUrl}`);

async function shutdown() {
  await running.close();
  process.exit(0);
}
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
