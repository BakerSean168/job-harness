import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { createSqliteBackup } from '../packages/persistence-sqlite/src/backup';

type Row = Record<string, SQLInputValue>;

interface RollbackPlan {
  readonly runId: string;
  readonly observationCount: number;
  readonly existingJobIds: string[];
  readonly newJobIds: string[];
  readonly existingListingIds: string[];
  readonly unsafeNewJobReferences: Array<{ table: string; count: number }>;
  readonly newAliasesOnExistingCompanies: Array<{ companyId: string; normalizedAlias: string }>;
  readonly applicationsBefore: number;
}

function n(value: unknown): number {
  return Number(value ?? 0);
}

function count(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): number {
  return n((db.prepare(sql).get(...params) as Row | undefined)?.n);
}

function safeTablesWithJobId(db: DatabaseSync): string[] {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Row[];
  return tables
    .map((row) => String(row.name))
    .filter((table) => /^[A-Za-z0-9_]+$/.test(table))
    .filter((table) => (db.prepare(`PRAGMA table_info("${table}")`).all() as Row[]).some((column) => String(column.name) === 'job_id'));
}

function idsForRun(db: DatabaseSync, runId: string): Array<{ jobId: string; listingId: string }> {
  return (db.prepare(`
    SELECT DISTINCT job_id, listing_id
    FROM job_observations
    WHERE discovery_run_id = ?
    ORDER BY job_id, listing_id
  `).all(runId) as Row[]).map((row) => ({ jobId: String(row.job_id), listingId: String(row.listing_id) }));
}

function inspect(db: DatabaseSync, runId: string): RollbackPlan {
  const run = db.prepare('SELECT id FROM discovery_runs WHERE id = ?').get(runId) as Row | undefined;
  if (!run) throw new Error(`DiscoveryRun '${runId}' does not exist`);

  const touched = idsForRun(db, runId);
  if (!touched.length) throw new Error(`DiscoveryRun '${runId}' has no observations to roll back`);
  const jobIds = [...new Set(touched.map((item) => item.jobId))];
  const existingJobIds = jobIds.filter((id) => Boolean(db.prepare('SELECT 1 FROM pre.jobs WHERE id = ?').get(id)));
  const newJobIds = jobIds.filter((id) => !existingJobIds.includes(id));
  const existingListingIds = [...new Set(touched
    .filter((item) => existingJobIds.includes(item.jobId))
    .map((item) => item.listingId))];

  for (const listingId of existingListingIds) {
    if (!db.prepare('SELECT 1 FROM pre.job_listings WHERE id = ?').get(listingId)) {
      throw new Error(`Touched listing '${listingId}' belongs to a pre-existing Job but is absent from the rollback backup`);
    }
  }

  const unsafeNewJobReferences: Array<{ table: string; count: number }> = [];
  for (const table of safeTablesWithJobId(db)) {
    if (table === 'job_listings' || table === 'job_observations') continue;
    let hits = 0;
    for (const jobId of newJobIds) hits += count(db, `SELECT COUNT(*) AS n FROM "${table}" WHERE job_id = ?`, jobId);
    if (hits > 0) unsafeNewJobReferences.push({ table, count: hits });
  }
  for (const jobId of newJobIds) {
    const outside = count(db, 'SELECT COUNT(*) AS n FROM job_observations WHERE job_id = ? AND discovery_run_id <> ?', jobId, runId);
    if (outside > 0) unsafeNewJobReferences.push({ table: 'job_observations:outside-run', count: outside });
  }

  const existingCompanyIds = [...new Set(existingJobIds.flatMap((jobId) => {
    const row = db.prepare('SELECT company_id FROM jobs WHERE id = ?').get(jobId) as Row | undefined;
    return row ? [String(row.company_id)] : [];
  }))];
  const newAliasesOnExistingCompanies: Array<{ companyId: string; normalizedAlias: string }> = [];
  for (const companyId of existingCompanyIds) {
    const rows = db.prepare(`
      SELECT normalized_alias
      FROM company_aliases ca
      WHERE company_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM pre.company_aliases pca
          WHERE pca.company_id = ca.company_id
            AND pca.normalized_alias = ca.normalized_alias
        )
    `).all(companyId) as Row[];
    for (const row of rows) newAliasesOnExistingCompanies.push({ companyId, normalizedAlias: String(row.normalized_alias) });
  }

  return {
    runId,
    observationCount: touched.length,
    existingJobIds,
    newJobIds,
    existingListingIds,
    unsafeNewJobReferences,
    newAliasesOnExistingCompanies,
    applicationsBefore: count(db, 'SELECT COUNT(*) AS n FROM applications'),
  };
}

function assertSafe(plan: RollbackPlan): void {
  if (plan.unsafeNewJobReferences.length) {
    throw new Error(`Refusing rollback because new Jobs have durable references: ${JSON.stringify(plan.unsafeNewJobReferences)}`);
  }
}

function restoreRow(db: DatabaseSync, table: string, id: string): void {
  if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`Unsafe table name '${table}'`);
  const columns = (db.prepare(`PRAGMA table_info("${table}")`).all() as Row[]).map((row) => String(row.name));
  const key = columns.includes('id') ? 'id' : null;
  if (!key) throw new Error(`Table '${table}' has no id column`);
  const mutable = columns.filter((column) => column !== key);
  const row = db.prepare(`SELECT * FROM pre."${table}" WHERE id = ?`).get(id) as Row | undefined;
  if (!row) throw new Error(`Backup row '${table}:${id}' is missing`);
  const setters = mutable.map((column) => `"${column}" = ?`).join(', ');
  db.prepare(`UPDATE "${table}" SET ${setters} WHERE id = ?`).run(
    ...mutable.map((column) => row[column] ?? null),
    id,
  );
}

function backupPath(databasePath: string, runId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(dirname(databasePath), `${basename(databasePath)}.before-discovery-rollback-${runId.slice(0, 8)}-${stamp}.bak`);
}

function openAttached(databasePath: string, sourceBackup: string, readOnly = false): DatabaseSync {
  const db = new DatabaseSync(databasePath, { readOnly });
  const escaped = sourceBackup.replaceAll("'", "''");
  db.exec(`ATTACH DATABASE '${escaped}' AS pre`);
  return db;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const { values } = parseArgs({
    args,
    options: {
      db: { type: 'string' },
      backup: { type: 'string' },
      'run-id': { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  if (!values.db || !values.backup || !values['run-id']) {
    throw new Error('Usage: rollback-discovery-run-from-backup --db <sqlite> --backup <sqlite> --run-id <id> [--apply]');
  }
  const databasePath = resolve(values.db);
  const sourceBackup = resolve(values.backup);
  const runId = values['run-id'].trim();
  if (!existsSync(databasePath)) throw new Error(`SQLite database not found: ${databasePath}`);
  if (!existsSync(sourceBackup)) throw new Error(`Rollback backup not found: ${sourceBackup}`);

  const preflight = openAttached(databasePath, sourceBackup, true);
  let plan: RollbackPlan;
  try {
    plan = inspect(preflight, runId);
    assertSafe(plan);
  } finally {
    preflight.close();
  }

  if (!values.apply) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      ...plan,
    }, null, 2));
    return;
  }

  const safetyBackup = backupPath(databasePath, runId);
  createSqliteBackup(databasePath, safetyBackup);
  const db = openAttached(databasePath, sourceBackup);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    const fresh = inspect(db, runId);
    assertSafe(fresh);
    if (
      fresh.observationCount !== plan.observationCount
      || fresh.existingJobIds.length !== plan.existingJobIds.length
      || fresh.newJobIds.length !== plan.newJobIds.length
      || fresh.applicationsBefore !== plan.applicationsBefore
    ) {
      throw new Error('Rollback target changed after safety backup; refusing mutation');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM job_observations WHERE discovery_run_id = ?').run(runId);

      for (const listingId of fresh.existingListingIds) restoreRow(db, 'job_listings', listingId);
      for (const jobId of fresh.existingJobIds) restoreRow(db, 'jobs', jobId);

      for (const alias of fresh.newAliasesOnExistingCompanies) {
        db.prepare('DELETE FROM company_aliases WHERE company_id = ? AND normalized_alias = ?').run(alias.companyId, alias.normalizedAlias);
      }

      for (const jobId of fresh.newJobIds) {
        db.prepare('DELETE FROM job_listings WHERE job_id = ?').run(jobId);
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
      `).run(runId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const applicationsAfter = count(db, 'SELECT COUNT(*) AS n FROM applications');
    if (applicationsAfter !== fresh.applicationsBefore) {
      throw new Error(`Application count changed during rollback: ${fresh.applicationsBefore} -> ${applicationsAfter}`);
    }
    const integrity = String((db.prepare('PRAGMA integrity_check').get() as Row).integrity_check);
    if (integrity !== 'ok') throw new Error(`SQLite integrity_check failed after rollback: ${integrity}`);

    console.log(JSON.stringify({
      mode: 'apply',
      runId,
      sourceBackup,
      safetyBackup,
      removedNewJobs: fresh.newJobIds.length,
      restoredExistingJobs: fresh.existingJobIds.length,
      restoredExistingListings: fresh.existingListingIds.length,
      removedRunObservations: fresh.observationCount,
      removedAliases: fresh.newAliasesOnExistingCompanies.length,
      applicationsPreserved: fresh.applicationsBefore,
      discoveryRunReset: true,
    }, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
