import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { importResumeCatalog, resolveResume } from '../packages/resume-application/src/index';
import { loadLegacyResumeRepository, importLegacyResumeBundle } from '../packages/resume-importers/src/index';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/index';
import { renderResumeHtml } from '../packages/resume-renderer/src/index';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function count(db: DatabaseSync, table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as Record<string, unknown>).n);
}

function legacyHtmlHashes(): Map<string, string> {
  const manifest = path.resolve('packages/resume-renderer/test/fixtures/legacy/html-sha256.txt');
  return new Map(
    fs.readFileSync(manifest, 'utf8').trim().split('\n').map((line) => {
      const match = line.match(/^([a-f0-9]{64})\s+.*\/([a-z0-9-]+)\.html$/);
      if (!match) throw new Error(`Invalid legacy HTML manifest line: ${line}`);
      return [match[2]!, match[1]!] as const;
    }),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const { values } = parseArgs({
    args,
    options: {
      source: { type: 'string' },
      db: { type: 'string' },
      'imported-at': { type: 'string' },
      report: { type: 'string' },
    },
    allowPositionals: false,
  });
  if (!values.source || !values.db || !values['imported-at']) {
    throw new Error('Usage: resume-legacy-import --source <resume-repo> --db <sqlite> --imported-at <ISO> [--report <json>]');
  }

  const source = path.resolve(values.source);
  const databasePath = path.resolve(values.db);
  const importedAt = values['imported-at'];
  const bundle = loadLegacyResumeRepository(source);
  const imported = importLegacyResumeBundle(bundle, importedAt);

  const beforeDb = new DatabaseSync(databasePath, { readOnly: true });
  const before = {
    jobs: count(beforeDb, 'jobs'),
    applications: count(beforeDb, 'applications'),
    resumeProfileRefs: count(beforeDb, 'resume_profile_refs'),
    companies: count(beforeDb, 'companies'),
  };
  beforeDb.close();

  const store = new SqliteResumeStore(databasePath);
  try {
    await importResumeCatalog(store, imported);
    const storedLibrary = await store.getLibrary(imported.library.id);
    if (!storedLibrary) throw new Error('Imported ResumeLibrary is missing after commit');
    const storedProfiles = await store.listProfiles({ libraryId: imported.library.id, includeArchived: true });
    const expected = legacyHtmlHashes();
    const parity = storedProfiles.map((profile) => {
      const resolved = resolveResume(storedLibrary, profile);
      const actualHash = sha256(renderResumeHtml(resolved, { variant: profile.id }));
      const expectedHash = expected.get(profile.id) ?? null;
      return { profileId: profile.id, expectedHash, actualHash, exactHtmlParity: expectedHash === actualHash };
    });

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    const report = {
      schemaVersion: Number((verify.prepare('PRAGMA user_version').get() as Record<string, unknown>).user_version),
      integrity: String((verify.prepare('PRAGMA integrity_check').get() as Record<string, unknown>).integrity_check),
      before,
      after: {
        jobs: count(verify, 'jobs'),
        applications: count(verify, 'applications'),
        resumeProfileRefs: count(verify, 'resume_profile_refs'),
        companies: count(verify, 'companies'),
        resumeLibraries: count(verify, 'resume_libraries'),
        resumeProfiles: count(verify, 'resume_profiles'),
        resumeRevisions: count(verify, 'resume_revisions'),
        resumeArtifacts: count(verify, 'resume_artifacts'),
      },
      importedLibrary: { id: storedLibrary.id, version: storedLibrary.version },
      importedProfileIds: storedProfiles.map((profile) => profile.id).sort(),
      parity,
      findings: imported.findings,
    };
    verify.close();

    if (report.integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${report.integrity}`);
    if (report.before.jobs !== report.after.jobs || report.before.applications !== report.after.applications || report.before.resumeProfileRefs !== report.after.resumeProfileRefs || report.before.companies !== report.after.companies) {
      throw new Error('Career compatibility counts changed during Resume import');
    }
    if (report.parity.some((item) => !item.exactHtmlParity)) throw new Error('Resume renderer parity failed after SQLite roundtrip');
    if (report.findings.some((finding) => finding.severity === 'error')) throw new Error('Blocking legacy Resume migration findings remain');

    if (values.report) fs.writeFileSync(path.resolve(values.report), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    store.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
