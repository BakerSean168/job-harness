import {
  ListResumeProfilesInputSchema,
  ListResumeProfilesOutputSchema,
  ResumeProfileContextSchema,
  ResumePreviewInputSchema,
  type ListResumeProfilesInput,
  type ListResumeProfilesOutput,
  type ResumeProfileContext,
  type ResumePreviewInput,
} from '@job-harness/resume-contracts';
import { resolveResume } from './resolver';
import type { ResumeStorePort } from './store';

export class ResumeNotFoundError extends Error {
  constructor(readonly entity: 'ResumeLibrary' | 'ResumeProfile', readonly id: string) {
    super(`${entity} '${id}' was not found`);
    this.name = 'ResumeNotFoundError';
  }
}

export interface ResumeRuntimePorts {
  listProfiles(input?: ListResumeProfilesInput): Promise<ListResumeProfilesOutput>;
  getProfileContext(profileId: string): Promise<ResumeProfileContext | null>;
  resolvePreview(input: ResumePreviewInput): Promise<ResumeProfileContext>;
}

export function createResumeApplicationService(store: ResumeStorePort): ResumeRuntimePorts {
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
      if (parsed.profile.libraryId !== parsed.library.id) {
        throw new ResumeNotFoundError('ResumeLibrary', parsed.profile.libraryId);
      }
      return ResumeProfileContextSchema.parse({
        library: parsed.library,
        profile: parsed.profile,
        resolved: resolveResume(parsed.library, parsed.profile),
      });
    },
  };
}
