import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express, Response } from 'express';
import { buildCareerExportSnapshot, createCareerApplicationService } from '@job-harness/application';
import { JOB_HARNESS_REST_V1_ROUTES, type CareerExportSnapshot } from '@job-harness/contracts';
import { createSqliteBackup, SqliteCareerStore } from '@job-harness/persistence-sqlite';
import { registerRestV1Route } from './rest-route';
import { writeInternalRestError } from './http-errors';

function fileTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export interface TemporarySqliteBackup {
  readonly path: string;
  readonly fileName: string;
  cleanup(): Promise<void>;
}

export async function createTemporarySqliteBackup(
  databasePath: string,
  exportedAt = new Date().toISOString(),
): Promise<TemporarySqliteBackup> {
  const dir = await mkdtemp(join(tmpdir(), 'job-harness-backup-'));
  const fileName = `job-harness-backup-${fileTimestamp(exportedAt)}.db`;
  const path = join(dir, fileName);
  try {
    createSqliteBackup(databasePath, path);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    path,
    fileName,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export async function exportCareerSnapshotFromSqlite(
  databasePath: string,
  exportedAt = new Date().toISOString(),
): Promise<CareerExportSnapshot> {
  const backup = await createTemporarySqliteBackup(databasePath, exportedAt);
  const store = new SqliteCareerStore(backup.path);
  try {
    return await buildCareerExportSnapshot(createCareerApplicationService(store), exportedAt);
  } finally {
    store.close();
    await backup.cleanup();
  }
}

export function exportJsonFileName(exportedAt: string): string {
  return `job-harness-export-${fileTimestamp(exportedAt)}.json`;
}

export function registerJobHarnessDataAdminApi(app: Express, databasePath: string, apiPrefix = '/api/v1'): void {
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.export, async (_req, res) => {
    try {
      const exportedAt = new Date().toISOString();
      const snapshot = await exportCareerSnapshotFromSqlite(databasePath, exportedAt);
      res
        .status(200)
        .set({
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="${exportJsonFileName(exportedAt)}"`,
          'cache-control': 'no-store',
        })
        .send(JSON.stringify(snapshot));
    } catch {
      writeInternalRestError(res);
    }
  });

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.backup, async (_req, res) => {
    let backup: TemporarySqliteBackup | null = null;
    try {
      const exportedAt = new Date().toISOString();
      backup = await createTemporarySqliteBackup(databasePath, exportedAt);
      const info = await stat(backup.path);
      res.status(200).set({
        'content-type': 'application/vnd.sqlite3',
        'content-disposition': `attachment; filename="${backup.fileName}"`,
        'content-length': String(info.size),
        'cache-control': 'no-store',
      });
      const stream = createReadStream(backup.path);
      const cleanup = backup.cleanup;
      let cleaned = false;
      const finishCleanup = () => {
        if (cleaned) return;
        cleaned = true;
        void cleanup();
      };
      res.once('close', finishCleanup);
      res.once('finish', finishCleanup);
      stream.once('error', () => {
        finishCleanup();
        writeInternalRestError(res);
      });
      stream.pipe(res);
    } catch {
      if (backup) await backup.cleanup();
      writeInternalRestError(res);
    }
  });
}
