import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '@job-harness/persistence-sqlite';
import { importLegacyCentralJobLedger, readLegacyCentralJobLedger } from '../src';

const importedAt = '2026-09-17T08:30:00.000Z';

function createLegacyLedger(path: string): void {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE companies(id INTEGER PRIMARY KEY, canonical_name TEXT NOT NULL);
    CREATE TABLE jobs(
      id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL, title TEXT NOT NULL, normalized_title TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '', normalized_city TEXT NOT NULL DEFAULT '', graduation TEXT NOT NULL DEFAULT '',
      experience TEXT NOT NULL DEFAULT '', ai_highlights TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'discovered',
      suppressed_from_primary INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', first_discovered_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    );
    CREATE TABLE job_sources(
      id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL, source TEXT NOT NULL DEFAULT '', source_kind TEXT NOT NULL DEFAULT 'platform_discovery',
      url TEXT NOT NULL DEFAULT '', normalized_url TEXT, external_job_id TEXT, contact_email TEXT NOT NULL DEFAULT '', raw_json TEXT NOT NULL DEFAULT '',
      first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    );
    CREATE TABLE discovery_runs(run_id TEXT PRIMARY KEY, ran_at TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', result_count INTEGER NOT NULL DEFAULT 0, new_count INTEGER NOT NULL DEFAULT 0, metadata_json TEXT NOT NULL DEFAULT '');
    CREATE TABLE discovery_events(id INTEGER PRIMARY KEY, run_id TEXT, job_id INTEGER NOT NULL, seen_at TEXT NOT NULL, is_new INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT '', query TEXT NOT NULL DEFAULT '');
    CREATE TABLE applications(id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL, job_id INTEGER, status TEXT NOT NULL, applied_at TEXT NOT NULL, platform TEXT NOT NULL DEFAULT '', profile_id TEXT NOT NULL DEFAULT '', resume_name TEXT NOT NULL DEFAULT '', external_ref TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE company_application_locks(company_id INTEGER PRIMARY KEY, reason TEXT NOT NULL, locked_at TEXT NOT NULL, expires_at TEXT, notes TEXT NOT NULL DEFAULT '');
  `);
  const company = db.prepare('INSERT INTO companies(id,canonical_name) VALUES(?,?)');
  company.run(1, '光启无界');
  company.run(2, 'NewCo');
  const job = db.prepare(`INSERT INTO jobs(id,company_id,title,normalized_title,city,normalized_city,graduation,experience,ai_highlights,status,suppressed_from_primary,notes,first_discovered_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  job.run(20, 1, 'AI应用开发工程师', 'ai应用开发工程师', '上海', '上海', '2026届', '', 'Agent', 'shortlisted', 0, 'legacy recurring result', '2026-09-16T03:55:00.000Z', '2026-09-16T03:55:00.000Z');
  job.run(21, 2, '前端开发工程师', '前端开发工程师', '杭州', '杭州', '2026届', '不限', 'React', 'discovered', 0, '', '2026-09-16T03:55:00.000Z', '2026-09-16T03:55:00.000Z');
  const source = db.prepare(`INSERT INTO job_sources(id,job_id,source,source_kind,url,normalized_url,external_job_id,contact_email,raw_json,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  source.run(1, 20, 'Lumicross官网', 'email', 'https://lumicross.ai/careers', 'https://lumicross.ai/careers', null, 'hire@lumicross.ai', '{"jd":"AI app"}', '2026-09-16T03:55:00.000Z', '2026-09-16T03:55:00.000Z');
  source.run(2, 21, 'NewCo官网', 'official_form', 'https://new.example.com/jobs/frontend-1', 'https://new.example.com/jobs/frontend-1', null, '', '', '2026-09-16T03:55:00.000Z', '2026-09-16T03:55:00.000Z');
  db.prepare('INSERT INTO discovery_runs VALUES(?,?,?,?,?,?,?)').run('legacy-run-1', '2026-09-16T03:55:00.000Z', '2026-grad', 'automation', 2, 2, '{"query":"frontend"}');
  db.prepare('INSERT INTO discovery_events VALUES(?,?,?,?,?,?,?)').run(1, 'legacy-run-1', 20, '2026-09-16T03:55:00.000Z', 1, 'automation', 'agent');
  db.prepare('INSERT INTO discovery_events VALUES(?,?,?,?,?,?,?)').run(2, 'legacy-run-1', 21, '2026-09-16T03:55:00.000Z', 1, 'automation', 'frontend');
  db.prepare('INSERT INTO applications VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(1, 1, null, 'applied', '2026-09-11T00:00:00.000Z', 'confirmed-in-chat', '', '', '', 'role unknown', '2026-09-11T00:00:00.000Z');
  db.prepare('INSERT INTO company_application_locks VALUES(?,?,?,?,?)').run(1, 'role_unknown', '2026-09-11T00:00:00.000Z', null, 'legacy safety guard');
  db.close();
}

describe('central Job Ledger convergence importer', () => {
  let dir: string;
  let store: SqliteCareerStore;
  let legacyPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-ledger-import-'));
    store = new SqliteCareerStore(join(dir, 'career.db'));
    legacyPath = join(dir, 'legacy-ledger.db');
    createLegacyLedger(legacyPath);
  });

  afterEach(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('adopts same-role legacy evidence, records an alias, imports new jobs and is rerun-safe', async () => {
    const career = createCareerApplicationService(store, { now: () => importedAt });
    await career.campaigns.upsertCampaign({
      id: '2026-grad-agent-fullstack-frontend', name: '2026届 Agent / 全栈 / 前端', targetRoles: ['Agent', 'Fullstack', 'Frontend'],
      cities: ['杭州', '深圳', '上海'], graduationYears: [2026], experience: ['0-1y'], keywords: [], exclusions: [], sources: ['official'], resumeProfileIds: [], status: 'active',
    });

    const existing = await career.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Lumicross / 光启无界', title: 'AI应用开发工程师', city: '上海', observedAt: '2026-09-10T00:00:00.000Z',
      listings: [{
        sourceKind: 'other', url: 'https://lumicross.ai/careers', externalNamespace: 'legacy-pool', externalId: 'lumicross-ai-app-shanghai', identityKind: 'external-id', status: 'active',
      }],
    }] });
    const existingJobId = existing.items[0]!.jobId!;
    await career.applications.recordApplication({
      jobId: existingJobId, appliedAt: '2026-09-11T00:00:00.000Z', idempotencyKey: 'existing-lumicross-app', actor: 'import', note: 'existing concrete evidence',
    });

    const dataset = readLegacyCentralJobLedger(legacyPath);
    expect(dataset).toMatchObject({ fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), jobs: expect.any(Array), runs: expect.any(Array) });
    expect(dataset.jobs).toHaveLength(2);
    expect(dataset.companyLocks).toHaveLength(1);

    const report = await importLegacyCentralJobLedger(dataset, career, {
      importedAt,
      campaignId: '2026-grad-agent-fullstack-frontend',
    });
    expect(report).toMatchObject({
      sourceJobs: 2,
      sourceRuns: 1,
      sourceEvents: 2,
      sourceApplications: 1,
      runsImported: 1,
      runsAlreadyImported: 0,
      jobsInserted: 1,
      jobsRejected: 0,
      jobsAdoptedByLegacyEvidence: 1,
      applicationEvidenceCovered: 1,
      applicationEvidenceUnresolved: 0,
    });

    const lumicross = await career.jobs.getJob(existingJobId);
    expect(lumicross?.companyName).toBe('Lumicross / 光启无界');
    const companyView = await career.workspace.listCompanies({ query: '光启无界', limit: 20, offset: 0 });
    expect(companyView.items[0]?.company.aliases).toContain('光启无界');
    expect((await career.jobs.searchJobs({ title: '前端开发工程师', city: '杭州', limit: 20, offset: 0 })).total).toBe(1);

    const rerun = await importLegacyCentralJobLedger(dataset, career, {
      importedAt,
      campaignId: '2026-grad-agent-fullstack-frontend',
    });
    expect(rerun).toMatchObject({ runsImported: 0, runsAlreadyImported: 1, jobsInserted: 0, jobsUpdated: 0, jobsDuplicate: 0, jobsRejected: 0 });
    const runs = await career.workspace.listDiscoveryRuns({ campaignId: '2026-grad-agent-fullstack-frontend', limit: 20, offset: 0 });
    expect(runs.total).toBe(1);
    expect(runs.items[0]?.run.contextSnapshot).toMatchObject({ legacyRunId: 'legacy-run-1' });
  });
});
