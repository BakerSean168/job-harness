import type { DatabaseSync } from 'node:sqlite';

export const SQLITE_SCHEMA_VERSION = 1;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS company_aliases (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL UNIQUE,
  PRIMARY KEY (company_id, normalized_alias)
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_roles_json TEXT NOT NULL,
  cities_json TEXT NOT NULL,
  graduation_years_json TEXT NOT NULL,
  experience_json TEXT NOT NULL,
  keywords_json TEXT NOT NULL,
  exclusions_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  resume_profile_ids_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS discovery_runs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  executor TEXT NOT NULL,
  context_snapshot_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
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
CREATE INDEX IF NOT EXISTS jobs_composite_idx ON jobs(company_id, normalized_title, normalized_city);
CREATE INDEX IF NOT EXISTS jobs_canonical_url_idx ON jobs(canonical_url);
CREATE INDEX IF NOT EXISTS jobs_state_idx ON jobs(state);
CREATE TABLE IF NOT EXISTS job_external_identities (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  normalized_source TEXT NOT NULL,
  normalized_external_id TEXT NOT NULL,
  PRIMARY KEY (job_id, normalized_source, normalized_external_id),
  UNIQUE (normalized_source, normalized_external_id)
);
CREATE TABLE IF NOT EXISTS job_sources (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT,
  label TEXT,
  PRIMARY KEY (job_id, source_key)
);
CREATE INDEX IF NOT EXISTS job_sources_kind_idx ON job_sources(kind);
CREATE TABLE IF NOT EXISTS job_observations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  discovery_run_id TEXT REFERENCES discovery_runs(id) ON DELETE SET NULL,
  observed_at TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_url TEXT,
  source_label TEXT,
  availability TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_observations_job_idx ON job_observations(job_id, observed_at);
CREATE INDEX IF NOT EXISTS job_observations_run_idx ON job_observations(discovery_run_id);
CREATE TABLE IF NOT EXISTS resume_profile_refs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  external_profile_id TEXT,
  target_role TEXT,
  version TEXT,
  hash TEXT,
  artifact_uri TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  resume_profile_id TEXT REFERENCES resume_profile_refs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_stage_idx ON applications(current_stage);
CREATE TABLE IF NOT EXISTS application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  stage TEXT,
  occurred_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  note TEXT,
  UNIQUE (application_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS application_events_timeline_idx ON application_events(application_id, occurred_at, id);
CREATE TABLE IF NOT EXISTS idempotency_receipts (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);
`;

export function migrateSqliteDatabase(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  const current = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  if (current > SQLITE_SCHEMA_VERSION) {
    throw new Error(`Job Harness SQLite schema ${current} is newer than supported ${SQLITE_SCHEMA_VERSION}`);
  }
  if (current === 0) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(SCHEMA_V1);
      db.exec(`PRAGMA user_version = ${SQLITE_SCHEMA_VERSION}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
