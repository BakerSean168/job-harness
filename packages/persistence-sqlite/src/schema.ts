import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  JOB_SOURCE_KINDS,
  buildJobListingIdentityKey,
  normalizeCanonicalUrl,
  normalizeIdentityText,
} from '@job-harness/domain';

export const SQLITE_SCHEMA_VERSION = 2;

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

const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS job_listings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  label TEXT,
  url TEXT,
  normalized_url TEXT,
  external_namespace TEXT,
  external_id TEXT,
  normalized_external_namespace TEXT,
  normalized_external_id TEXT,
  identity_kind TEXT NOT NULL,
  identity_key TEXT UNIQUE,
  status TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  published_at TEXT,
  closed_at TEXT,
  metadata_snapshot_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS job_listings_job_idx ON job_listings(job_id, last_seen_at);
CREATE INDEX IF NOT EXISTS job_listings_source_idx ON job_listings(source_kind, last_seen_at);
CREATE INDEX IF NOT EXISTS job_listings_url_idx ON job_listings(normalized_url);
`;

type Row = Record<string, unknown>;

function deterministicId(...parts: string[]): string {
  return `listing-${createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)}`;
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).some((row) => String(row.name) === column);
}

function migrateV1ToV2(db: DatabaseSync): void {
  db.exec(SCHEMA_V2);
  if (!hasColumn(db, 'job_observations', 'listing_id')) {
    db.exec('ALTER TABLE job_observations ADD COLUMN listing_id TEXT REFERENCES job_listings(id)');
  }

  const insertListing = db.prepare(`INSERT OR IGNORE INTO job_listings(
    id,job_id,source_kind,label,url,normalized_url,external_namespace,external_id,
    normalized_external_namespace,normalized_external_id,identity_kind,identity_key,status,
    first_seen_at,last_seen_at,published_at,closed_at,metadata_snapshot_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const jobs = db.prepare('SELECT * FROM jobs ORDER BY id').all() as Row[];
  for (const job of jobs) {
    const jobId = String(job.id);
    const firstSeen = String(job.first_seen_at);
    const lastSeen = String(job.last_seen_at);
    const canonicalUrl = job.canonical_url == null ? null : normalizeCanonicalUrl(String(job.canonical_url));
    const sources = db.prepare('SELECT * FROM job_sources WHERE job_id = ? ORDER BY source_key').all(jobId) as Row[];
    const externals = db.prepare('SELECT * FROM job_external_identities WHERE job_id = ? ORDER BY normalized_source, normalized_external_id').all(jobId) as Row[];
    const usedExternal = new Set<number>();
    let representedCanonical = false;

    const persist = (input: {
      sourceKind: string; label: string | null; url: string | null; externalNamespace: string | null;
      externalId: string | null; identityKind: 'external-id' | 'url' | 'scoped'; metadata: Record<string, unknown>;
      salt: string;
    }) => {
      const normalizedUrl = input.url ? normalizeCanonicalUrl(input.url) : null;
      let identityKind = input.identityKind;
      let identityKey = buildJobListingIdentityKey({
        sourceKind: input.sourceKind,
        identityKind,
        url: normalizedUrl,
        externalNamespace: input.externalNamespace,
        externalId: input.externalId,
      });
      if (identityKey) {
        const owner = db.prepare('SELECT job_id FROM job_listings WHERE identity_key = ?').get(identityKey) as Row | undefined;
        if (owner && String(owner.job_id) !== jobId) {
          identityKind = 'scoped';
          identityKey = null;
          input.metadata.migrationIdentityConflict = true;
        }
      }
      const id = deterministicId(jobId, input.salt, identityKey ?? `${input.sourceKind}:${normalizedUrl ?? ''}:${input.label ?? ''}`);
      insertListing.run(
        id, jobId, input.sourceKind, input.label, input.url, normalizedUrl,
        input.externalNamespace, input.externalId,
        input.externalNamespace ? normalizeIdentityText(input.externalNamespace) : null,
        input.externalId ? normalizeIdentityText(input.externalId) : null,
        identityKind, identityKey, 'active', firstSeen, lastSeen, null, null, JSON.stringify(input.metadata),
      );
      return id;
    };

    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      const source = sources[sourceIndex]!;
      const sourceKind = String(source.kind);
      const url = source.url == null ? null : String(source.url);
      const normalizedUrl = url ? normalizeCanonicalUrl(url) : null;
      const extIndex = externals.findIndex((external, index) =>
        !usedExternal.has(index) && normalizeIdentityText(String(external.source)) === normalizeIdentityText(sourceKind));
      const external = extIndex >= 0 ? externals[extIndex]! : null;
      if (extIndex >= 0) usedExternal.add(extIndex);
      const canonicalMatch = Boolean(canonicalUrl && normalizedUrl === canonicalUrl);
      representedCanonical ||= canonicalMatch;
      persist({
        sourceKind,
        label: source.label == null ? null : String(source.label),
        url,
        externalNamespace: external ? String(external.source) : null,
        externalId: external ? String(external.external_id) : null,
        identityKind: external ? 'external-id' : canonicalMatch ? 'url' : 'scoped',
        metadata: { migratedFromV1: true },
        salt: `source:${sourceIndex}`,
      });
    }

    if (canonicalUrl && !representedCanonical) {
      persist({
        sourceKind: sources[0] ? String(sources[0].kind) : 'other',
        label: 'Legacy canonical URL',
        url: canonicalUrl,
        externalNamespace: null,
        externalId: null,
        identityKind: 'url',
        metadata: { migratedFromV1: true, legacyCanonicalUrl: true },
        salt: 'canonical-url',
      });
    }

    for (let index = 0; index < externals.length; index += 1) {
      if (usedExternal.has(index)) continue;
      const external = externals[index]!;
      const namespace = String(external.source);
      const normalizedNamespace = normalizeIdentityText(namespace);
      const sourceKind = JOB_SOURCE_KINDS.includes(normalizedNamespace as (typeof JOB_SOURCE_KINDS)[number])
        ? normalizedNamespace
        : 'other';
      persist({
        sourceKind,
        label: `Legacy external identity: ${namespace}`,
        url: null,
        externalNamespace: namespace,
        externalId: String(external.external_id),
        identityKind: 'external-id',
        metadata: { migratedFromV1: true, legacyExternalIdentity: true },
        salt: `external:${index}`,
      });
    }

    const count = Number((db.prepare('SELECT COUNT(*) AS n FROM job_listings WHERE job_id = ?').get(jobId) as Row).n);
    if (count === 0) {
      persist({
        sourceKind: 'manual', label: 'Legacy source', url: null, externalNamespace: null, externalId: null,
        identityKind: 'scoped', metadata: { migratedFromV1: true, syntheticFallback: true }, salt: 'fallback',
      });
    }
  }

  const observations = db.prepare('SELECT * FROM job_observations WHERE listing_id IS NULL ORDER BY id').all() as Row[];
  const updateObservation = db.prepare('UPDATE job_observations SET listing_id = ? WHERE id = ?');
  for (const observation of observations) {
    const jobId = String(observation.job_id);
    const sourceKind = String(observation.source_kind);
    const sourceUrl = observation.source_url == null ? null : normalizeCanonicalUrl(String(observation.source_url));
    let listing: Row | undefined;
    if (sourceUrl) {
      listing = db.prepare('SELECT * FROM job_listings WHERE job_id = ? AND source_kind = ? AND normalized_url = ? ORDER BY id LIMIT 1').get(jobId, sourceKind, sourceUrl) as Row | undefined;
    }
    listing ??= db.prepare('SELECT * FROM job_listings WHERE job_id = ? AND source_kind = ? ORDER BY id LIMIT 1').get(jobId, sourceKind) as Row | undefined;
    listing ??= db.prepare('SELECT * FROM job_listings WHERE job_id = ? ORDER BY id LIMIT 1').get(jobId) as Row | undefined;
    if (!listing) throw new Error(`Cannot migrate observation '${String(observation.id)}': Job '${jobId}' has no listing`);
    updateObservation.run(String(listing.id), String(observation.id));
  }

  db.exec('CREATE INDEX IF NOT EXISTS job_observations_listing_idx ON job_observations(listing_id, observed_at)');
}

export function migrateSqliteDatabase(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  let current = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  if (current > SQLITE_SCHEMA_VERSION) {
    throw new Error(`Job Harness SQLite schema ${current} is newer than supported ${SQLITE_SCHEMA_VERSION}`);
  }
  if (current === 0) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(SCHEMA_V1);
      db.exec('PRAGMA user_version = 1');
      db.exec('COMMIT');
      current = 1;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (current === 1) {
    db.exec('BEGIN IMMEDIATE');
    try {
      migrateV1ToV2(db);
      db.exec('PRAGMA user_version = 2');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
