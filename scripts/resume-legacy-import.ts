import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { hashResolvedResume, importResumeCatalog, resolveResume } from '../packages/resume-application/src/index';
import { loadLegacyResumeRepository, importLegacyResumeBundle } from '../packages/resume-importers/src/index';
import { ResumeArtifactSchema, ResumeRevisionSchema, type ResumeProfile, type ResumeRevision } from '../packages/resume-contracts/src/index';
import { createFileSystemResumeArtifactStorage } from '../apps/server/src/resume-artifacts';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/index';
import { renderResumeHtml } from '../packages/resume-renderer/src/index';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicId(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}-${createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)}`;
}

function readPdfMap(mapPath: string): Map<string, string> {
  const absoluteMap = path.resolve(mapPath);
  const raw = JSON.parse(fs.readFileSync(absoluteMap, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Legacy PDF map must be a JSON object of profileId -> PDF path');
  const base = path.dirname(absoluteMap);
  const result = new Map<string, string>();
  for (const [profileId, file] of Object.entries(raw as Record<string, unknown>)) {
    if (!profileId.trim() || typeof file !== 'string' || !file.trim()) throw new Error(`Invalid legacy PDF map entry for '${profileId}'`);
    result.set(profileId, path.isAbsolute(file) ? file : path.resolve(base, file));
  }
  return result;
}

async function ensureImportedRevision(
  store: SqliteResumeStore,
  library: Parameters<typeof resolveResume>[0],
  profile: ResumeProfile,
  importedAt: string,
): Promise<ResumeRevision> {
  const resolved = resolveResume(library, profile);
  const contentHash = hashResolvedResume(resolved);
  const revisions = await store.listRevisions(profile.id);
  const existing = revisions.find((revision) => revision.contentHash === contentHash);
  if (existing) return existing;
  const revision = ResumeRevisionSchema.parse({
    id: deterministicId('resume-rev-import', profile.id, contentHash),
    profileId: profile.id,
    revisionNumber: Math.max(0, ...revisions.map((item) => item.revisionNumber)) + 1,
    libraryId: library.id,
    libraryVersion: library.version,
    profileVersion: profile.version,
    resolvedDocumentSnapshot: resolved,
    contentHash,
    createdAt: importedAt,
    createdBy: 'import',
    note: 'Imported immutable snapshot from the legacy Resume source.',
  });
  await store.transaction(async (tx) => tx.insertRevision(revision));
  return revision;
}

async function importLegacyPdfArtifacts(input: {
  store: SqliteResumeStore;
  library: Parameters<typeof resolveResume>[0];
  profiles: readonly ResumeProfile[];
  pdfMapPath: string;
  artifactOutputDirectory: string;
  importedAt: string;
  requireAll: boolean;
}) {
  const pdfMap = readPdfMap(input.pdfMapPath);
  const profileIds = new Set(input.profiles.map((profile) => profile.id));
  const unknown = [...pdfMap.keys()].filter((profileId) => !profileIds.has(profileId));
  if (unknown.length) throw new Error(`Legacy PDF map contains unknown Profile IDs: ${unknown.sort().join(', ')}`);
  if (input.requireAll) {
    const missing = [...profileIds].filter((profileId) => !pdfMap.has(profileId));
    if (missing.length) throw new Error(`Legacy PDF map is missing Profile IDs: ${missing.sort().join(', ')}`);
  }
  const storage = createFileSystemResumeArtifactStorage(input.artifactOutputDirectory);
  const importedArtifacts: Array<Record<string, unknown>> = [];

  for (const profile of input.profiles) {
    const sourcePath = pdfMap.get(profile.id);
    if (!sourcePath) continue;
    const bytes = new Uint8Array(fs.readFileSync(sourcePath));
    if (bytes.byteLength < 5 || Buffer.from(bytes.slice(0, 5)).toString('ascii') !== '%PDF-') {
      throw new Error(`Legacy PDF for Profile '${profile.id}' is not a PDF`);
    }
    const digest = sha256Bytes(bytes);
    const revision = await ensureImportedRevision(input.store, input.library, profile, input.importedAt);
    const existing = (await input.store.listArtifacts(revision.id)).find((artifact) =>
      artifact.kind === 'pdf' && artifact.rendererId === 'legacy-resume-pdf' && artifact.rendererVersion === 'source-v1',
    );
    if (existing) {
      if (existing.sha256 !== digest || existing.byteSize !== bytes.byteLength) {
        throw new Error(`Existing legacy PDF Artifact for Profile '${profile.id}' does not match source bytes`);
      }
      const stored = await storage.read(existing.storageUri);
      if (sha256Bytes(stored) !== digest) throw new Error(`Stored legacy PDF Artifact for Profile '${profile.id}' failed byte parity`);
      importedArtifacts.push({ profileId: profile.id, revisionId: revision.id, artifactId: existing.id, sourceFile: path.basename(sourcePath), sha256: digest, byteSize: bytes.byteLength, reused: true, exactByteParity: true });
      continue;
    }

    const artifactId = deterministicId('resume-artifact-import', profile.id, digest);
    let storageUri: string | null = null;
    try {
      storageUri = await storage.write({ artifactId, revisionId: revision.id, extension: 'pdf', bytes });
      const artifact = ResumeArtifactSchema.parse({
        id: artifactId,
        revisionId: revision.id,
        kind: 'pdf',
        mimeType: 'application/pdf',
        storageUri,
        sha256: digest,
        byteSize: bytes.byteLength,
        rendererId: 'legacy-resume-pdf',
        rendererVersion: 'source-v1',
        createdAt: input.importedAt,
      });
      await input.store.transaction(async (tx) => tx.insertArtifact(artifact));
      const stored = await storage.read(storageUri);
      if (sha256Bytes(stored) !== digest) throw new Error(`Stored legacy PDF Artifact for Profile '${profile.id}' failed byte parity`);
      importedArtifacts.push({ profileId: profile.id, revisionId: revision.id, artifactId, sourceFile: path.basename(sourcePath), sha256: digest, byteSize: bytes.byteLength, reused: false, exactByteParity: true });
    } catch (error) {
      if (storageUri) await storage.remove(storageUri).catch(() => undefined);
      throw error;
    }
  }
  return importedArtifacts;
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
      'legacy-pdf-map': { type: 'string' },
      'artifact-output-dir': { type: 'string' },
      'require-legacy-pdf-for-all': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  if (!values.source || !values.db || !values['imported-at']) {
    throw new Error('Usage: resume-legacy-import --source <resume-repo> --db <sqlite> --imported-at <ISO> [--report <json>] [--legacy-pdf-map <json> --artifact-output-dir <dir> --require-legacy-pdf-for-all]');
  }

  const source = path.resolve(values.source);
  const databasePath = path.resolve(values.db);
  const importedAt = values['imported-at'];
  if (Boolean(values['legacy-pdf-map']) !== Boolean(values['artifact-output-dir'])) {
    throw new Error('--legacy-pdf-map and --artifact-output-dir must be provided together');
  }
  const bundle = loadLegacyResumeRepository(source);
  const imported = importLegacyResumeBundle(bundle, importedAt);

  const beforeDb = new DatabaseSync(databasePath, { readOnly: true });
  const before = {
    jobs: count(beforeDb, 'jobs'),
    applications: count(beforeDb, 'applications'),
    applicationEvents: count(beforeDb, 'application_events'),
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
    const legacyPdfArtifacts = values['legacy-pdf-map'] && values['artifact-output-dir']
      ? await importLegacyPdfArtifacts({
          store, library: storedLibrary, profiles: storedProfiles, pdfMapPath: values['legacy-pdf-map'],
          artifactOutputDirectory: values['artifact-output-dir'], importedAt, requireAll: values['require-legacy-pdf-for-all'] ?? false,
        })
      : [];
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
        applicationEvents: count(verify, 'application_events'),
        applicationSubmissions: count(verify, 'application_submissions'),
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
      legacyPdfArtifacts,
      findings: imported.findings,
    };
    verify.close();

    if (report.integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${report.integrity}`);
    if (report.before.jobs !== report.after.jobs || report.before.applications !== report.after.applications || report.before.applicationEvents !== report.after.applicationEvents || report.before.resumeProfileRefs !== report.after.resumeProfileRefs || report.before.companies !== report.after.companies) {
      throw new Error('Career compatibility counts changed during Resume import');
    }
    if (report.parity.some((item) => !item.exactHtmlParity)) throw new Error('Resume renderer parity failed after SQLite roundtrip');
    if (values['require-legacy-pdf-for-all'] && report.legacyPdfArtifacts.length !== storedProfiles.length) {
      throw new Error(`Expected ${storedProfiles.length} legacy PDF Artifacts, imported ${report.legacyPdfArtifacts.length}`);
    }
    if (report.legacyPdfArtifacts.some((item) => item.exactByteParity !== true)) throw new Error('Legacy PDF byte parity failed after Artifact import');
    if (report.findings.some((finding) => finding.severity === 'error')) throw new Error('Blocking legacy Resume migration findings remain');

    if (values.report) fs.writeFileSync(path.resolve(values.report), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    store.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
