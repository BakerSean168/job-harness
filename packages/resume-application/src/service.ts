import {
  ListResumeProfilesInputSchema,
  ListResumeProfilesOutputSchema,
  ResumeLibrarySchema,
  ResumeProfileContextSchema,
  ResumePreviewInputSchema,
  SaveResumeLibraryInputSchema,
  SaveResumeProfileInputSchema,
  validateResumeProfileReferences,
  type ListResumeProfilesInput,
  type ListResumeProfilesOutput,
  type ResumeLibrary,
  type ResumeProfileContext,
  type ResumePreviewInput,
  type SaveResumeLibraryInput,
  type SaveResumeProfileInput,
} from '@job-harness/resume-contracts';
import { resolveResume } from './resolver';
import type { ResumeStorePort } from './store';

export class ResumeNotFoundError extends Error {
  constructor(readonly entity: 'ResumeLibrary' | 'ResumeProfile', readonly id: string) {
    super(`${entity} '${id}' was not found`);
    this.name = 'ResumeNotFoundError';
  }
}

export class ResumeConcurrencyError extends Error {
  constructor(readonly entity: 'ResumeLibrary' | 'ResumeProfile', readonly id: string, readonly expectedVersion: number, readonly actualVersion: number) {
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
  };
}
