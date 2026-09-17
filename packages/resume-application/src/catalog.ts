import {
  ResumeLibrarySchema,
  ResumeProfileSchema,
  validateResumeProfileReferences,
  type ResumeLibrary,
  type ResumeProfile,
} from '@job-harness/resume-contracts';
import type { ResumeStorePort } from './store';

export interface ResumeCatalogImportIssue {
  readonly profileId: string;
  readonly path: string;
  readonly message: string;
}

export class ResumeCatalogImportError extends Error {
  readonly issues: readonly ResumeCatalogImportIssue[];

  constructor(issues: readonly ResumeCatalogImportIssue[]) {
    super(`Resume catalog import failed with ${issues.length} issue(s)`);
    this.name = 'ResumeCatalogImportError';
    this.issues = issues;
  }
}

export async function importResumeCatalog(
  store: ResumeStorePort,
  input: { readonly library: ResumeLibrary; readonly profiles: readonly ResumeProfile[] },
): Promise<{ library: ResumeLibrary; profiles: readonly ResumeProfile[] }> {
  const library = ResumeLibrarySchema.parse(input.library);
  const profiles = input.profiles.map((profile) => ResumeProfileSchema.parse(profile));
  const issues = profiles.flatMap((profile) =>
    validateResumeProfileReferences(library, profile).map((issue) => ({
      profileId: profile.id,
      path: issue.path,
      message: `${issue.message}: ${issue.id}`,
    })),
  );
  if (issues.length) throw new ResumeCatalogImportError(issues);

  return store.transaction(async (tx) => {
    const persistedLibrary = await tx.upsertLibrary(library);
    const persistedProfiles: ResumeProfile[] = [];
    for (const profile of profiles) persistedProfiles.push(await tx.upsertProfile(profile));
    return { library: persistedLibrary, profiles: persistedProfiles };
  });
}
