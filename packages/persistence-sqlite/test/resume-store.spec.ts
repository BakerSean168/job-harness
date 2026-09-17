import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashResolvedResume, importResumeCatalog, resolveResume } from '@job-harness/resume-application';
import { ResumeArtifactSchema, ResumeLibrarySchema, ResumeProfileSchema, ResumeRevisionSchema } from '@job-harness/resume-contracts';
import { SqliteResumeStore } from '../src';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const at = '2026-09-17T02:00:00.000Z';
const zh = (value: string) => ({ 'zh-CN': value });

describe('SqliteResumeStore', () => {
  it('persists Library/Profile and append-only Revision/Artifact lifecycles', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'job-harness-resume-store-')); dirs.push(dir);
    const db = join(dir, 'career.db');
    const store = new SqliteResumeStore(db);
    try {
      const library = ResumeLibrarySchema.parse({
        id: 'primary', schemaVersion: 2, version: 1,
        basics: { displayName: zh('测试'), contact: { phone: null, email: 'test@example.com', website: null, github: null, location: null }, photoAssetId: null },
        education: [], skills: [{ id: 'agent', label: null, content: zh('Agent'), keywords: [] }], workExperiences: [], projects: [], certificates: [], summaries: [],
        createdAt: at, updatedAt: at,
      });
      const profile = ResumeProfileSchema.parse({
        id: 'agent', libraryId: 'primary', version: 1, name: zh('Agent 简历'), targetRole: zh('Agent'), locale: 'zh-CN', templateId: 'classic-v1', positioning: zh('Agent'),
        output: { documentTitle: zh('Agent 简历'), description: null, onlineUrl: null, pdfName: zh('Agent') },
        layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: ['agent'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [],
        createdAt: at, updatedAt: at, archivedAt: null,
      });
      await importResumeCatalog(store, { library, profiles: [profile] });
      expect((await store.listProfiles()).map((item) => item.id)).toEqual(['agent']);

      const resolved = resolveResume(library, profile);
      const hash = hashResolvedResume(resolved);
      const revision = ResumeRevisionSchema.parse({ id: 'rev-1', profileId: 'agent', revisionNumber: 1, libraryId: 'primary', libraryVersion: 1, profileVersion: 1, resolvedDocumentSnapshot: resolved, contentHash: hash, createdAt: at, createdBy: 'user', note: null });
      const artifact = ResumeArtifactSchema.parse({ id: 'artifact-1', revisionId: 'rev-1', kind: 'pdf', mimeType: 'application/pdf', storageUri: 'file:///data/rev-1.pdf', sha256: 'a'.repeat(64), byteSize: 100, rendererId: 'test-renderer', rendererVersion: '1', createdAt: at });
      await store.transaction(async (tx) => { await tx.insertRevision(revision); await tx.insertArtifact(artifact); });
      expect((await store.listRevisions('agent')).map((item) => item.id)).toEqual(['rev-1']);
      expect((await store.listArtifacts('rev-1')).map((item) => item.id)).toEqual(['artifact-1']);
      await expect(store.transaction((tx) => tx.insertRevision(revision))).rejects.toThrow();

      const tamper = new DatabaseSync(db);
      try {
        tamper.prepare('UPDATE resume_revisions SET snapshot_json = ? WHERE id = ?').run(
          JSON.stringify({ ...resolved, positioning: 'tampered positioning' }), 'rev-1',
        );
      } finally { tamper.close(); }
      await expect(store.getRevision('rev-1')).rejects.toThrow(/content-hash verification/);
    } finally { store.close(); }
  });
});
