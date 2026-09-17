import type {
  ResumeArtifact,
  ResumeLibrary,
  ResumeProfile,
  ResumeRevision,
} from '@job-harness/resume-contracts';

export interface ResumeProfileListInput {
  readonly libraryId?: string;
  readonly includeArchived?: boolean;
}

export interface ResumeStoreReadPort {
  getLibrary(libraryId: string): Promise<ResumeLibrary | null>;
  listProfiles(input?: ResumeProfileListInput): Promise<readonly ResumeProfile[]>;
  getProfile(profileId: string): Promise<ResumeProfile | null>;
  listRevisions(profileId: string): Promise<readonly ResumeRevision[]>;
  getRevision(revisionId: string): Promise<ResumeRevision | null>;
  listArtifacts(revisionId: string): Promise<readonly ResumeArtifact[]>;
  getArtifact(artifactId: string): Promise<ResumeArtifact | null>;
}

export interface ResumeStoreTransactionPort extends ResumeStoreReadPort {
  upsertLibrary(library: ResumeLibrary): Promise<ResumeLibrary>;
  upsertProfile(profile: ResumeProfile): Promise<ResumeProfile>;
  insertRevision(revision: ResumeRevision): Promise<void>;
  insertArtifact(artifact: ResumeArtifact): Promise<void>;
}

export interface ResumeStorePort extends ResumeStoreReadPort {
  transaction<T>(work: (tx: ResumeStoreTransactionPort) => Promise<T>): Promise<T>;
}
