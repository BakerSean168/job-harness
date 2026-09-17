import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerApplicationService } from '@job-harness/application';
import { SqliteCareerStore } from '../src';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function iso(index: number): string {
  return new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString();
}

describe('pagination and query-plan regression', () => {
  it('keeps stable pages over a larger corpus and uses v4 hot-path indexes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'job-harness-pagination-'));
    dirs.push(dir);
    const databasePath = join(dir, 'career.db');
    const initial = new SqliteCareerStore(databasePath);
    initial.close();

    const db = new DatabaseSync(databasePath);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('BEGIN IMMEDIATE');
    try {
      const now = iso(0);
      db.prepare('INSERT INTO companies(id,name,normalized_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('company-perf', 'Perf Co', 'perf co', now, now);
      db.prepare(`INSERT INTO resume_profile_refs(id,name,source,external_profile_id,target_role,version,hash,artifact_uri,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run('resume-perf', 'Perf Resume', 'resume-harness', 'perf', 'Agent', 'v1', 'hash', 'file:///perf.pdf', now);
      db.prepare(`INSERT INTO campaigns(id,name,target_roles_json,cities_json,graduation_years_json,experience_json,keywords_json,exclusions_json,sources_json,resume_profile_ids_json,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('campaign-perf', 'Perf Campaign', '["Agent"]', '["Hangzhou"]', '[2026]', '[]', '[]', '[]', '["official"]', '["resume-perf"]', 'active', now, now);
      db.prepare(`INSERT INTO discovery_runs(id,campaign_id,executor,context_snapshot_json,started_at,completed_at,candidate_count,inserted_count,duplicate_count,rejected_count)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run('run-perf', 'campaign-perf', 'manual', '{}', now, iso(1), 600, 600, 0, 0);

      const insertJob = db.prepare(`INSERT INTO jobs(id,company_id,title,normalized_title,city,normalized_city,state,canonical_url,description,first_seen_at,last_seen_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const insertListing = db.prepare(`INSERT INTO job_listings(
        id,job_id,source_kind,label,url,normalized_url,external_namespace,external_id,normalized_external_namespace,normalized_external_id,identity_kind,identity_key,status,first_seen_at,last_seen_at,published_at,closed_at,metadata_snapshot_json
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const insertObservation = db.prepare(`INSERT INTO job_observations(id,job_id,discovery_run_id,observed_at,source_kind,source_url,source_label,availability,listing_id)
        VALUES(?,?,?,?,?,?,?,?,?)`);
      const insertApplication = db.prepare(`INSERT INTO applications(id,job_id,current_stage,applied_at,resume_profile_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?)`);

      for (let index = 0; index < 600; index += 1) {
        const id = `job-${String(index).padStart(4, '0')}`;
        const listingId = `listing-${String(index).padStart(4, '0')}`;
        const seen = iso(index + 10);
        const state = index % 3 === 0 ? 'shortlisted' : 'discovered';
        const url = `https://example.com/jobs/${index}`;
        insertJob.run(id, 'company-perf', `Agent Engineer ${index}`, `agent engineer ${index}`, 'Hangzhou', 'hangzhou', state, null, null, seen, seen, seen, seen);
        insertListing.run(listingId, id, 'official', 'Official', url, url, null, null, null, null, 'url', `url:${url}`, 'active', seen, seen, null, null, '{}');
        insertObservation.run(`observation-${index}`, id, 'run-perf', seen, 'official', url, 'Official', 'active', listingId);
        if (index < 300) {
          const stage = index % 2 === 0 ? 'screening' : 'applied';
          insertApplication.run(`application-${index}`, id, stage, seen, 'resume-perf', seen, seen);
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      db.close();
    }

    const store = new SqliteCareerStore(databasePath);
    try {
      const career = createCareerApplicationService(store);
      const first = await career.workspace.searchJobListItems({ limit: 50, offset: 0 });
      const last = await career.workspace.searchJobListItems({ limit: 50, offset: 550 });
      expect(first.total).toBe(600);
      expect(last.total).toBe(600);
      expect(first.items).toHaveLength(50);
      expect(last.items).toHaveLength(50);
      expect(new Set([...first.items, ...last.items].map((item) => item.jobId)).size).toBe(100);
      expect(first.items[0]!.lastSeenAt > first.items[49]!.lastSeenAt).toBe(true);
      expect(last.items[0]!.lastSeenAt > last.items[49]!.lastSeenAt).toBe(true);

      const shortlisted = await career.workspace.searchJobListItems({ states: ['shortlisted'], sourceKinds: ['official'], campaignId: 'campaign-perf', limit: 200, offset: 0 });
      expect(shortlisted.total).toBe(200);
      expect(shortlisted.items).toHaveLength(200);
      expect(shortlisted.items.every((item) => item.state === 'shortlisted' && item.campaigns.some((campaign) => campaign.id === 'campaign-perf'))).toBe(true);

      const applicationPage = await career.workspace.listApplicationBoard({ limit: 50, offset: 250 });
      expect(applicationPage.total).toBe(300);
      expect(applicationPage.items).toHaveLength(50);
      expect(new Set(applicationPage.items.map((item) => item.application.id)).size).toBe(50);
      expect(applicationPage.items.every((item) => item.companyName === 'Perf Co' && item.resume?.id === 'resume-perf')).toBe(true);

      expect(() => career.workspace.searchJobListItems({ limit: 201, offset: 0 })).toThrow();
    } finally {
      store.close();
    }

    const planDb = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const jobPlan = planDb.prepare('EXPLAIN QUERY PLAN SELECT id FROM jobs ORDER BY last_seen_at DESC, id LIMIT 50 OFFSET 500').all()
        .map((row) => String((row as Record<string, unknown>).detail)).join('\n');
      expect(jobPlan).toContain('jobs_last_seen_idx');
      const applicationPlan = planDb.prepare("EXPLAIN QUERY PLAN SELECT id FROM applications WHERE current_stage = 'screening' ORDER BY updated_at DESC, id LIMIT 50 OFFSET 100").all()
        .map((row) => String((row as Record<string, unknown>).detail)).join('\n');
      expect(applicationPlan).toContain('applications_stage_updated_idx');
      expect(planDb.prepare('PRAGMA user_version').get()).toEqual({ user_version: 8 });
    } finally {
      planDb.close();
    }
  });
});
