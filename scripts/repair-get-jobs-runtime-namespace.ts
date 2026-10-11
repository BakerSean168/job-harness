import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { createSqliteBackup } from '../packages/persistence-sqlite/src/backup';

type Row = Record<string, unknown>;

interface RepairPlan {
  readonly databasePath: string;
  readonly discoveryRunId: string;
  readonly site: string;
  readonly legacyNamespace: string;
  readonly canonicalNamespace: string;
  readonly targetListingIds: string[];
  readonly targetJobIds: string[];
  readonly canonicalOverlapCount: number;
  readonly applicationsBefore: number;
  readonly unsafeReferences: Array<{ table: string; count: number }>;
  readonly observationsOutsideRun: number;
  readonly jobsWithUnexpectedListingCount: number;
}

function n(value: unknown): number {
  return Number(value ?? 0);
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(',');
}

function countRows(db: DatabaseSync, sql: string, ...params: Array<string | number>): number {
  return n((db.prepare(sql).get(...params) as Row | undefined)?.n);
}

function normalizeNamespace(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function tablesWithJobId(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Row[];
  return rows
    .map((row) => String(row.name))
    .filter((table) => /^[A-Za-z0-9_]+$/.test(table))
    .filter((table) => {
      const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as Row[];
      return columns.some((column) => String(column.name) === 'job_id');
    });
}

function inspect(db: DatabaseSync, databasePath: string, site: string, discoveryRunId: string): RepairPlan {
  const legacyNamespace = `vvvsrx-get-jobs:${site}`;
  const canonicalNamespace = site;
  const legacyNormalized = normalizeNamespace(legacyNamespace);
  const canonicalNormalized = normalizeNamespace(canonicalNamespace);

  const run = db.prepare('SELECT id FROM discovery_runs WHERE id = ?').get(discoveryRunId) as Row | undefined;
  if (!run) throw new Error(`DiscoveryRun '${discoveryRunId}' does not exist`);

  const listingRows = db.prepare(`
    SELECT DISTINCT jl.id, jl.job_id
    FROM job_listings jl
    JOIN job_observations o ON o.listing_id = jl.id
    WHERE jl.normalized_external_namespace = ?
      AND o.discovery_run_id = ?
    ORDER BY jl.id
  `).all(legacyNormalized, discoveryRunId) as Row[];
  const targetListingIds = listingRows.map((row) => String(row.id));
  const targetJobIds = [...new Set(listingRows.map((row) => String(row.job_id)))].sort();
  if (!targetListingIds.length || !targetJobIds.length) {
    throw new Error(`No legacy get_jobs listings for namespace '${legacyNamespace}' are attached to DiscoveryRun '${discoveryRunId}'`);
  }

  let observationsOutsideRun = 0;
  let jobsWithUnexpectedListingCount = 0;
  for (const jobId of targetJobIds) {
    observationsOutsideRun += countRows(
      db,
      'SELECT COUNT(*) AS n FROM job_observations WHERE job_id = ? AND discovery_run_id <> ?',
      jobId,
      discoveryRunId,
    );
    const listingCount = countRows(db, 'SELECT COUNT(*) AS n FROM job_listings WHERE job_id = ?', jobId);
    if (listingCount !== 1) jobsWithUnexpectedListingCount += 1;
  }

  const unsafeReferences: Array<{ table: string; count: number }> = [];
  for (const table of tablesWithJobId(db)) {
    if (table === 'job_listings' || table === 'job_observations') continue;
    let count = 0;
    for (const jobId of targetJobIds) {
      count += countRows(db, `SELECT COUNT(*) AS n FROM "${table}" WHERE job_id = ?`, jobId);
    }
    if (count > 0) unsafeReferences.push({ table, count });
  }

  let canonicalOverlapCount = 0;
  for (const listingId of targetListingIds) {
    const listing = db.prepare('SELECT normalized_external_id FROM job_listings WHERE id = ?').get(listingId) as Row | undefined;
    const externalId = listing?.normalized_external_id == null ? '' : String(listing.normalized_external_id);
    if (!externalId) continue;
    canonicalOverlapCount += countRows(
      db,
      'SELECT COUNT(*) AS n FROM job_listings WHERE normalized_external_namespace = ? AND normalized_external_id = ?',
      canonicalNormalized,
      externalId,
    ) > 0 ? 1 : 0;
  }

  return {
    databasePath,
    discoveryRunId,
    site,
    legacyNamespace,
    canonicalNamespace,
    targetListingIds,
    targetJobIds,
    canonicalOverlapCount,
    applicationsBefore: countRows(db, 'SELECT COUNT(*) AS n FROM applications'),
    unsafeReferences,
    observationsOutsideRun,
    jobsWithUnexpectedListingCount,
  };
}

function assertSafe(plan: RepairPlan): void {
  if (plan.targetListingIds.length !== plan.targetJobIds.length) {
    throw new Error(`Repair requires one legacy listing per target Job; found ${plan.targetListingIds.length} listings for ${plan.targetJobIds.length} Jobs`);
  }
  if (plan.observationsOutsideRun !== 0) {
    throw new Error(`Refusing repair: target Jobs have ${plan.observationsOutsideRun} observations outside DiscoveryRun '${plan.discoveryRunId}'`);
  }
  if (plan.jobsWithUnexpectedListingCount !== 0) {
    throw new Error(`Refusing repair: ${plan.jobsWithUnexpectedListingCount} target Jobs have listings other than the legacy runtime listing`);
  }
  if (plan.unsafeReferences.length) {
    throw new Error(`Refusing repair: target Jobs are referenced outside listings/observations: ${JSON.stringify(plan.unsafeReferences)}`);
  }
}

function backupPath(databasePath: string, discoveryRunId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(dirname(databasePath), `${basename(databasePath)}.before-get-jobs-namespace-repair-${discoveryRunId.slice(0, 8)}-${stamp}.bak`);
}

function applyRepair(databasePath: string, site: string, discoveryRunId: string): { plan: RepairPlan; backup: string } {
  const preflightDb = new DatabaseSync(databasePath, { readOnly: true });
  let plan: RepairPlan;
  try {
    plan = inspect(preflightDb, databasePath, site, discoveryRunId);
    assertSafe(plan);
  } finally {
    preflightDb.close();
  }

  const backup = backupPath(databasePath, discoveryRunId);
  createSqliteBackup(databasePath, backup);

  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    const fresh = inspect(db, databasePath, site, discoveryRunId);
    assertSafe(fresh);
    if (
      fresh.targetListingIds.length !== plan.targetListingIds.length
      || fresh.targetJobIds.length !== plan.targetJobIds.length
      || fresh.applicationsBefore !== plan.applicationsBefore
    ) {
      throw new Error('Repair preflight changed after backup; refusing mutation');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const listingIds = new Set(fresh.targetListingIds);
      const jobIds = new Set(fresh.targetJobIds);
      for (const listingId of listingIds) {
        db.prepare('DELETE FROM job_observations WHERE listing_id = ? AND discovery_run_id = ?').run(listingId, discoveryRunId);
      }
      for (const listingId of listingIds) {
        db.prepare('DELETE FROM job_listings WHERE id = ?').run(listingId);
      }
      for (const jobId of jobIds) {
        const remainingListings = countRows(db, 'SELECT COUNT(*) AS n FROM job_listings WHERE job_id = ?', jobId);
        if (remainingListings !== 0) throw new Error(`Job '${jobId}' still has listings after legacy listing removal`);
        db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
      }
      db.prepare(`
        UPDATE discovery_runs
        SET completed_at = NULL,
            candidate_count = 0,
            inserted_count = 0,
            duplicate_count = 0,
            rejected_count = 0
        WHERE id = ?
      `).run(discoveryRunId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const applicationsAfter = countRows(db, 'SELECT COUNT(*) AS n FROM applications');
    if (applicationsAfter !== fresh.applicationsBefore) {
      throw new Error(`Application count changed during repair: ${fresh.applicationsBefore} -> ${applicationsAfter}`);
    }
    const integrity = String((db.prepare('PRAGMA integrity_check').get() as Row).integrity_check);
    if (integrity !== 'ok') throw new Error(`SQLite integrity_check failed after repair: ${integrity}`);
    return { plan: fresh, backup };
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const { values } = parseArgs({
    args,
    options: {
      db: { type: 'string' },
      site: { type: 'string' },
      'discovery-run-id': { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  if (!values.db || !values.site || !values['discovery-run-id']) {
    throw new Error('Usage: repair-get-jobs-runtime-namespace --db <sqlite> --site <site> --discovery-run-id <id> [--apply]');
  }
  const databasePath = resolve(values.db);
  if (!existsSync(databasePath)) throw new Error(`SQLite database does not exist: ${databasePath}`);
  const site = values.site.trim();
  if (!/^[a-z0-9-]+$/.test(site)) throw new Error(`Invalid site '${site}'`);
  const discoveryRunId = values['discovery-run-id'].trim();

  if (values.apply) {
    const result = applyRepair(databasePath, site, discoveryRunId);
    console.log(JSON.stringify({
      mode: 'apply',
      backup: result.backup,
      targetListingsRemoved: result.plan.targetListingIds.length,
      targetJobsRemoved: result.plan.targetJobIds.length,
      canonicalOverlapCount: result.plan.canonicalOverlapCount,
      discoveryRunReset: discoveryRunId,
      applicationsPreserved: result.plan.applicationsBefore,
    }, null, 2));
    return;
  }

  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const plan = inspect(db, databasePath, site, discoveryRunId);
    assertSafe(plan);
    console.log(JSON.stringify({
      mode: 'dry-run',
      targetListings: plan.targetListingIds.length,
      targetJobs: plan.targetJobIds.length,
      canonicalOverlapCount: plan.canonicalOverlapCount,
      predictedFreshCanonicalInserts: plan.targetListingIds.length - plan.canonicalOverlapCount,
      applicationsPreserved: plan.applicationsBefore,
      discoveryRunToReset: discoveryRunId,
    }, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
