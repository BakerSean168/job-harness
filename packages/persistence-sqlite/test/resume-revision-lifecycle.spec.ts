import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createResumeApplicationService } from '@job-harness/resume-application';
import { ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { SqliteResumeStore } from '../src';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));
const both = (zh: string, en = zh) => ({ 'zh-CN': zh, en });

function seed(now: string) {
  const library = ResumeLibrarySchema.parse({
    id: 'primary', schemaVersion: 2, version: 1,
    basics: { displayName: both('张三'), contact: { phone: null, email: 'a@example.com', website: null, github: null, location: null }, photoAssetId: null },
    education: [], skills: [{ id: 'ts', label: null, content: both('TypeScript'), keywords: ['typescript'] }], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: now, updatedAt: now,
  });
  const profile = ResumeProfileSchema.parse({
    id: 'agent', libraryId: 'primary', version: 1, name: both('Agent 简历'), targetRole: both('Agent 工程师'), locale: 'zh-CN', templateId: 'classic-v1', positioning: both('Agent 工程师'), output: { documentTitle: both('Agent 简历'), description: null, onlineUrl: null, pdfName: both('Agent') }, layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: ['ts'], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], archivedAt: null, createdAt: now, updatedAt: now,
  });
  return { library, profile };
}

describe('Resume revision lifecycle', () => {
  it('publishes immutable numbered snapshots, reuses identical content, and diffs against previous/current', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jh-resume-revision-'));
    dirs.push(dir);
    const store = new SqliteResumeStore(join(dir, 'career.db'));
    const times = ['2026-09-17T02:00:00.000Z', '2026-09-17T02:01:00.000Z', '2026-09-17T02:02:00.000Z'];
    const resume = createResumeApplicationService(store, { now: () => times.shift() ?? '2026-09-17T03:00:00.000Z' });
    try {
      const initial = seed('2026-09-17T01:00:00.000Z');
      await store.transaction(async (tx) => { await tx.upsertLibrary(initial.library); await tx.upsertProfile(initial.profile); });

      const first = await resume.publishRevision({ profileId: 'agent', expectedProfileVersion: 1, expectedLibraryVersion: 1, note: 'baseline' });
      expect(first.reused).toBe(false);
      expect(first.revision).toMatchObject({ revisionNumber: 1, profileVersion: 1, libraryVersion: 1, note: 'baseline' });

      const retry = await resume.publishRevision({ profileId: 'agent', expectedProfileVersion: 1, expectedLibraryVersion: 1, note: 'ignored on reuse' });
      expect(retry.reused).toBe(true);
      expect(retry.revision.id).toBe(first.revision.id);
      expect((await resume.listRevisions('agent')).total).toBe(1);

      const context = await resume.getProfileContext('agent');
      expect(context).not.toBeNull();
      const saved = await resume.saveProfile({ expectedVersion: 1, profile: { ...context!.profile, positioning: both('Senior Agent 工程师') } });
      const second = await resume.publishRevision({ profileId: 'agent', expectedProfileVersion: saved.profile.version, expectedLibraryVersion: saved.library.version });
      expect(second.revision.revisionNumber).toBe(2);
      expect(second.revision.contentHash).not.toBe(first.revision.contentHash);

      const introduced = await resume.diffRevision(second.revision.id, { against: 'previous' });
      expect(introduced?.changes).toContainEqual({ path: '/positioning', kind: 'changed', before: 'Agent 工程师', after: 'Senior Agent 工程师' });
      expect(introduced?.fromRevisionId).toBe(first.revision.id);
      expect(introduced?.toRevisionId).toBe(second.revision.id);

      const current = await resume.diffRevision(second.revision.id, { against: 'current' });
      expect(current?.changes).toHaveLength(0);
      expect(current?.toRevisionId).toBeNull();
    } finally { store.close(); }
  });
});
