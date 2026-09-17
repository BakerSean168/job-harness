import {
  ListResumeProfilesInputSchema,
  ListResumeProfilesOutputSchema,
  ListResumeRevisionsOutputSchema,
  PublishResumeRevisionInputSchema,
  PublishResumeRevisionOutputSchema,
  ResumeRevisionDetailSchema,
  ResumeRevisionDiffOutputSchema,
  ResumeRevisionDiffQuerySchema,
  ResumeRevisionSchema,
  ResumeLibrarySchema,
  ResumeProfileContextSchema,
  ResumePreviewInputSchema,
  SaveResumeLibraryInputSchema,
  SaveResumeProfileInputSchema,
  validateResumeProfileReferences,
  type ListResumeProfilesInput,
  type ListResumeProfilesOutput,
  type ListResumeRevisionsOutput,
  type PublishResumeRevisionInput,
  type PublishResumeRevisionOutput,
  type ResumeRevisionDetail,
  type ResumeRevisionDiffOutput,
  type ResumeRevisionDiffQuery,
  type ResumeLibrary,
  type ResumeProfileContext,
  type ResumePreviewInput,
  type SaveResumeLibraryInput,
  type SaveResumeProfileInput,
} from '@job-harness/resume-contracts';
import { randomUUID } from 'node:crypto';
import { resolveResume } from './resolver';
import { diffResumeSnapshots, hashResolvedResume } from './revision';
import type { ResumeStorePort } from './store';

export class ResumeNotFoundError extends Error {
  constructor(readonly entity: 'ResumeLibrary' | 'ResumeProfile' | 'ResumeRevision', readonly id: string) {
    super(`${entity} '${id}' was not found`);
    this.name = 'ResumeNotFoundError';
  }
}

export class ResumeConcurrencyError extends Error {
  constructor(readonly entity: 'ResumeLibrary' | 'ResumeProfile' | 'ResumeRevision', readonly id: string, readonly expectedVersion: number, readonly actualVersion: number) {
    super(`${entity} '${id}' version conflict: expected v${expectedVersion}, actual v${actualVersion}`);
    this.name = 'ResumeConcurrencyError';
  }
}

export class ResumeReferenceValidationError extends Error {
  constructor(readonly issues: readonly { profileId: string; path: string; message: string }[]) {
    super(`Resume reference validation failed with ${issues.length} issue(s)`);
    this.name = 'ResumeReferenceValidationError';
  }
}

export interface ResumeRuntimePorts {
  listProfiles(input?: ListResumeProfilesInput): Promise<ListResumeProfilesOutput>;
  getProfileContext(profileId: string): Promise<ResumeProfileContext | null>;
  resolvePreview(input: ResumePreviewInput): Promise<ResumeProfileContext>;
  saveProfile(input: SaveResumeProfileInput): Promise<ResumeProfileContext>;
  saveLibrary(input: SaveResumeLibraryInput): Promise<ResumeLibrary>;
  listRevisions(profileId: string): Promise<ListResumeRevisionsOutput>;
  getRevisionDetail(revisionId: string): Promise<ResumeRevisionDetail | null>;
  publishRevision(input: PublishResumeRevisionInput): Promise<PublishResumeRevisionOutput>;
  diffRevision(revisionId: string, query?: ResumeRevisionDiffQuery): Promise<ResumeRevisionDiffOutput | null>;
}

export function createResumeApplicationService(store: ResumeStorePort, options: { now?: () => string } = {}): ResumeRuntimePorts {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async listProfiles(input = {}) {
      const parsed = ListResumeProfilesInputSchema.parse(input);
      const items = await store.listProfiles({
        ...(parsed.libraryId ? { libraryId: parsed.libraryId } : {}),
        ...(parsed.includeArchived !== undefined ? { includeArchived: parsed.includeArchived } : {}),
      });
      return ListResumeProfilesOutputSchema.parse({ items, total: items.length });
    },

    async getProfileContext(profileId) {
      const profile = await store.getProfile(profileId);
      if (!profile) return null;
      const library = await store.getLibrary(profile.libraryId);
      if (!library) throw new ResumeNotFoundError('ResumeLibrary', profile.libraryId);
      return ResumeProfileContextSchema.parse({ library, profile, resolved: resolveResume(library, profile) });
    },

    async resolvePreview(input) {
      const parsed = ResumePreviewInputSchema.parse(input);
      if (parsed.profile.libraryId !== parsed.library.id) throw new ResumeNotFoundError('ResumeLibrary', parsed.profile.libraryId);
      return ResumeProfileContextSchema.parse({ library: parsed.library, profile: parsed.profile, resolved: resolveResume(parsed.library, parsed.profile) });
    },

    async saveProfile(input) {
      const parsed = SaveResumeProfileInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const current = await tx.getProfile(parsed.profile.id);
        if (!current) throw new ResumeNotFoundError('ResumeProfile', parsed.profile.id);
        if (current.version !== parsed.expectedVersion) throw new ResumeConcurrencyError('ResumeProfile', current.id, parsed.expectedVersion, current.version);
        if (parsed.profile.libraryId !== current.libraryId) throw new ResumeReferenceValidationError([{ profileId: current.id, path: 'libraryId', message: 'Changing a Profile libraryId is not supported by this mutation' }]);
        const library = await tx.getLibrary(current.libraryId);
        if (!library) throw new ResumeNotFoundError('ResumeLibrary', current.libraryId);
        const draft = { ...parsed.profile, version: current.version, createdAt: current.createdAt, updatedAt: current.updatedAt };
        const referenceIssues = validateResumeProfileReferences(library, draft);
        if (referenceIssues.length) throw new ResumeReferenceValidationError(referenceIssues.map((issue) => ({ profileId: current.id, path: issue.path, message: `${issue.message}: ${issue.id}` })));
        // Resolve before persistence so locale-specific required content fails closed.
        resolveResume(library, draft);
        const next = { ...draft, version: current.version + 1, updatedAt: now() };
        const saved = await tx.upsertProfile(next);
        return ResumeProfileContextSchema.parse({ library, profile: saved, resolved: resolveResume(library, saved) });
      });
    },

    async saveLibrary(input) {
      const parsed = SaveResumeLibraryInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const current = await tx.getLibrary(parsed.library.id);
        if (!current) throw new ResumeNotFoundError('ResumeLibrary', parsed.library.id);
        if (current.version !== parsed.expectedVersion) throw new ResumeConcurrencyError('ResumeLibrary', current.id, parsed.expectedVersion, current.version);
        const profiles = await tx.listProfiles({ libraryId: current.id, includeArchived: true });
        const candidate = ResumeLibrarySchema.parse({ ...parsed.library, version: current.version, createdAt: current.createdAt, updatedAt: current.updatedAt });
        const issues = profiles.flatMap((profile) => validateResumeProfileReferences(candidate, profile).map((issue) => ({ profileId: profile.id, path: issue.path, message: `${issue.message}: ${issue.id}` })));
        if (issues.length) throw new ResumeReferenceValidationError(issues);
        // Every active Profile must still resolve in its own target locale.
        for (const profile of profiles.filter((item) => !item.archivedAt)) resolveResume(candidate, profile);
        return tx.upsertLibrary({ ...candidate, version: current.version + 1, updatedAt: now() });
      });
    },

    async listRevisions(profileId) {
      const profile = await store.getProfile(profileId);
      if (!profile) throw new ResumeNotFoundError('ResumeProfile', profileId);
      const items = await store.listRevisions(profileId);
      return ListResumeRevisionsOutputSchema.parse({ items, total: items.length });
    },

    async getRevisionDetail(revisionId) {
      const revision = await store.getRevision(revisionId);
      if (!revision) return null;
      const artifacts = await store.listArtifacts(revision.id);
      return ResumeRevisionDetailSchema.parse({ revision, artifacts });
    },

    async publishRevision(input) {
      const parsed = PublishResumeRevisionInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const profile = await tx.getProfile(parsed.profileId);
        if (!profile) throw new ResumeNotFoundError('ResumeProfile', parsed.profileId);
        if (profile.version !== parsed.expectedProfileVersion) {
          throw new ResumeConcurrencyError('ResumeProfile', profile.id, parsed.expectedProfileVersion, profile.version);
        }
        const library = await tx.getLibrary(profile.libraryId);
        if (!library) throw new ResumeNotFoundError('ResumeLibrary', profile.libraryId);
        if (library.version !== parsed.expectedLibraryVersion) {
          throw new ResumeConcurrencyError('ResumeLibrary', library.id, parsed.expectedLibraryVersion, library.version);
        }
        const resolved = resolveResume(library, profile);
        const contentHash = hashResolvedResume(resolved);
        const revisions = await tx.listRevisions(profile.id);
        const existing = revisions.find((revision) => revision.contentHash === contentHash);
        if (existing) return PublishResumeRevisionOutputSchema.parse({ revision: existing, reused: true });
        const revisionNumber = Math.max(0, ...revisions.map((revision) => revision.revisionNumber)) + 1;
        const revision = ResumeRevisionSchema.parse({
          id: `resume-rev-${randomUUID()}`,
          profileId: profile.id,
          revisionNumber,
          libraryId: library.id,
          libraryVersion: library.version,
          profileVersion: profile.version,
          resolvedDocumentSnapshot: resolved,
          contentHash,
          createdAt: now(),
          createdBy: 'user',
          note: parsed.note ?? null,
        });
        await tx.insertRevision(revision);
        return PublishResumeRevisionOutputSchema.parse({ revision, reused: false });
      });
    },

    async diffRevision(revisionId, query = {}) {
      const parsed = ResumeRevisionDiffQuerySchema.parse(query);
      const revision = await store.getRevision(revisionId);
      if (!revision) return null;
      const against = parsed.against ?? 'previous';
      if (against === 'current') {
        const profile = await store.getProfile(revision.profileId);
        if (!profile) throw new ResumeNotFoundError('ResumeProfile', revision.profileId);
        const library = await store.getLibrary(profile.libraryId);
        if (!library) throw new ResumeNotFoundError('ResumeLibrary', profile.libraryId);
        const current = resolveResume(library, profile);
        const currentHash = hashResolvedResume(current);
        return ResumeRevisionDiffOutputSchema.parse({
          profileId: revision.profileId,
          against,
          fromRevisionId: revision.id,
          toRevisionId: null,
          fromContentHash: revision.contentHash,
          toContentHash: currentHash,
          changes: diffResumeSnapshots(revision.resolvedDocumentSnapshot, current),
        });
      }
      const revisions = await store.listRevisions(revision.profileId);
      const previous = revisions
        .filter((candidate) => candidate.revisionNumber < revision.revisionNumber)
        .sort((left, right) => right.revisionNumber - left.revisionNumber)[0] ?? null;
      return ResumeRevisionDiffOutputSchema.parse({
        profileId: revision.profileId,
        against,
        fromRevisionId: previous?.id ?? null,
        toRevisionId: revision.id,
        fromContentHash: previous?.contentHash ?? null,
        toContentHash: revision.contentHash,
        changes: diffResumeSnapshots(previous?.resolvedDocumentSnapshot ?? {}, revision.resolvedDocumentSnapshot),
      });
    },
  };
}
