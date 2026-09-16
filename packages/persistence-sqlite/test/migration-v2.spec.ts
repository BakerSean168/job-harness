import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrateSqliteDatabase } from '../src';

describe('SQLite schema v1 -> v2 JobListing migration', () => {
  it('backfills listings and observation listing refs without collapsing semantic Moka hash routes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        title TEXT NOT NULL,
        normalized_title TEXT NOT NULL,
        city TEXT,
        normalized_city TEXT NOT NULL,
        state TEXT NOT NULL,
        canonical_url TEXT,
        description TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE job_sources (
        job_id TEXT NOT NULL,
        source_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        url TEXT,
        label TEXT,
        PRIMARY KEY (job_id, source_key)
      );
      CREATE TABLE job_external_identities (
        job_id TEXT NOT NULL,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        normalized_source TEXT NOT NULL,
        normalized_external_id TEXT NOT NULL,
        PRIMARY KEY (job_id, normalized_source, normalized_external_id)
      );
      CREATE TABLE discovery_runs (
        id TEXT PRIMARY KEY,
        campaign_id TEXT,
        executor TEXT NOT NULL,
        context_snapshot_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        candidate_count INTEGER NOT NULL DEFAULT 0,
        inserted_count INTEGER NOT NULL DEFAULT 0,
        duplicate_count INTEGER NOT NULL DEFAULT 0,
        rejected_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE applications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL UNIQUE,
        current_stage TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        resume_profile_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE job_observations (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        discovery_run_id TEXT,
        observed_at TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        source_url TEXT,
        source_label TEXT,
        availability TEXT NOT NULL
      );
      PRAGMA user_version = 1;
    `);
    const url = 'https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/8d40c764-d2b2-49b1-826c-e3f2adb75c01';
    db.prepare(`INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'job-deepseek', 'company-deepseek', 'Agent Harness', 'agent harness', 'Hangzhou', 'hangzhou',
      'shortlisted', url, null,
      '2026-09-11T10:00:00.000Z', '2026-09-16T10:00:00.000Z',
      '2026-09-11T10:00:00.000Z', '2026-09-16T10:00:00.000Z',
    );
    db.prepare('INSERT INTO job_sources VALUES(?,?,?,?,?)').run(
      'job-deepseek', 'moka', 'moka', url, 'Moka',
    );
    db.prepare('INSERT INTO job_external_identities VALUES(?,?,?,?,?)').run(
      'job-deepseek', 'moka', '8D40C764', 'moka', '8d40c764',
    );
    db.prepare('INSERT INTO job_observations VALUES(?,?,?,?,?,?,?,?)').run(
      'obs-1', 'job-deepseek', null, '2026-09-16T10:00:00.000Z', 'moka', url, 'Moka', 'active',
    );

    migrateSqliteDatabase(db);

    expect(db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 4 });
    const listings = db.prepare('SELECT * FROM job_listings WHERE job_id = ?').all('job-deepseek') as Array<Record<string, unknown>>;
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      source_kind: 'moka',
      identity_kind: 'external-id',
      external_namespace: 'moka',
      external_id: '8D40C764',
    });
    expect(String(listings[0]!.normalized_url)).toContain('#/job/8d40c764-d2b2-49b1-826c-e3f2adb75c01');
    expect(db.prepare('SELECT listing_id FROM job_observations WHERE id = ?').get('obs-1')).toMatchObject({
      listing_id: listings[0]!.id,
    });

    // Running migration again is a no-op and preserves the deterministic backfill.
    migrateSqliteDatabase(db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM job_listings').get()).toMatchObject({ n: 1 });
    db.close();
  });
});
