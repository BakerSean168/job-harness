/**
 * Give the four canonical public Resume Profiles version-free names and PDF
 * filenames without changing their stable IDs, content selections, or history.
 *
 * Usage: JOB_HARNESS_DB=... tsx scripts/resume-canonical-names.mts check|preview|commit
 * The preview must be approved before committing production.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { ResumeProfileSchema, validateResumeProfileReferences } from '../packages/resume-contracts/src/index.ts';

const mode = process.argv[2] ?? 'check';
if (!['check', 'preview', 'commit'].includes(mode)) throw Error('Expected check|preview|commit');

const canonical = [
  { id: 'ai-frontend-v5-1', version: 4, role: '前端开发工程师', pdf: '卢楼豪-前端开发工程师' },
  { id: 'ai-fullstack-v5-1', version: 3, role: '全栈开发工程师', pdf: '卢楼豪-全栈开发工程师' },
  { id: 'ai-fullstack-agent-v5-1', version: 4, role: 'AI 全栈开发工程师', pdf: '卢楼豪-AI全栈开发工程师' },
  { id: 'ai-agent-app-v5-1', version: 3, role: 'AI Agent 应用开发工程师', pdf: '卢楼豪-AIAgent应用开发工程师' },
] as const;
const BASE_LIBRARY_VERSION = 19;
const PUBLIC_VERSION_PATTERN = /(?:v|V)\s*5\s*[.．]\s*1/;
const OUTPUT = process.env.RESUME_CANONICAL_PREVIEW_DIR || '/data/resume-canonical-names-preview';
const PREVIEW_API = process.env.RESUME_PREVIEW_API || 'http://127.0.0.1:3000/api/v1/resume/preview/pdf';

const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  const library = await store.getLibrary('primary');
  if (!library || library.version !== BASE_LIBRARY_VERSION) throw Error('Unexpected canonical library baseline');
  const oldProfiles = await store.listProfiles({ includeArchived: true });
  const active = oldProfiles.filter((p) => !p.archivedAt);
  assert.deepStrictEqual(active.map((p) => p.id).sort(), canonical.map((p) => p.id).sort());
  if (oldProfiles.length !== 9) throw Error('Canonical cleanup was not completed');
  const timestamp = new Date().toISOString();

  const nextProfiles = canonical.map((spec) => {
    const before = active.find((p) => p.id === spec.id)!;
    if (before.version !== spec.version) throw Error('Unexpected Profile version: ' + spec.id);
    const zh = before.locale;
    const originalName = before.name[zh];
    const originalTitle = before.output.documentTitle[zh];
    const originalPdf = before.output.pdfName?.[zh];
    if (!originalName || !originalTitle || !originalPdf) throw Error('Missing public names: ' + spec.id);
    if (![originalName, originalTitle, originalPdf].every((s) => PUBLIC_VERSION_PATTERN.test(s)))
      throw Error('Expected legacy V5.1 label missing: ' + spec.id);

    const next = ResumeProfileSchema.parse({
      ...before,
      version: before.version + 1,
      name: { ...before.name, [zh]: spec.role },
      output: {
        ...before.output,
        documentTitle: { ...before.output.documentTitle, [zh]: '卢楼豪 - ' + spec.role },
        pdfName: { ...before.output.pdfName, [zh]: spec.pdf },
      },
      updatedAt: timestamp,
    });
    for (const label of [next.name[zh], next.output.documentTitle[zh], next.output.pdfName?.[zh]])
      assert.ok(label && !PUBLIC_VERSION_PATTERN.test(label));
    assert.deepStrictEqual(validateResumeProfileReferences(library, next), []);
    const oldResolved = resolveResume(library, before);
    const newResolved = resolveResume(library, next);
    const expected = {
      ...oldResolved,
      profileVersion: next.version,
      output: {
        ...oldResolved.output,
        documentTitle: '卢楼豪 - ' + spec.role,
        pdfName: spec.pdf,
      },
    };
    assert.deepStrictEqual(newResolved, expected, 'Only public metadata may change: ' + spec.id);
    return next;
  });

  for (const old of oldProfiles.filter((p) => p.archivedAt)) {
    assert.deepStrictEqual(validateResumeProfileReferences(library, old), []);
  }

  if (mode === 'preview') {
    mkdirSync(OUTPUT, { recursive: true });
    for (const profile of nextProfiles) {
      const response = await fetch(PREVIEW_API, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + (process.env.JOB_HARNESS_AUTH_TOKEN || ''),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ library, profile }),
      });
      if (!response.ok) throw Error('Renderer HTTP ' + response.status + ' for ' + profile.id);
      const bytes = Buffer.from(await response.arrayBuffer());
      writeFileSync(join(OUTPUT, profile.id + '.pdf'), bytes);
      console.log('PREVIEW_OK', profile.id, bytes.byteLength);
    }
  } else if (mode === 'commit') {
    await store.transaction(async (tx) => {
      const latestLib = await tx.getLibrary('primary');
      const latestProfiles = await tx.listProfiles({ includeArchived: true });
      if (JSON.stringify(latestLib) !== JSON.stringify(library) || JSON.stringify(latestProfiles) !== JSON.stringify(oldProfiles))
        throw Error('Concurrent database update, refusing stale metadata write');
      for (const profile of nextProfiles) await tx.upsertProfile(profile);
    });
    console.log('COMMITTED', JSON.stringify(nextProfiles.map((p) => ({
      id: p.id, profileVersion: p.version, publicName: p.name[p.locale], pdfName: p.output.pdfName?.[p.locale],
    })), null, 2));
  } else console.log('CHECK_OK', JSON.stringify({
    libraryVersion: library.version,
    renamedProfiles: nextProfiles.map((p) => ({ id: p.id, oldVersion: p.version - 1, newVersion: p.version,
      publicName: p.name[p.locale], pdfName: p.output.pdfName?.[p.locale] })),
    immutableHistory: 'untouched',
  }, null, 2));
} finally {
  store.close();
}
