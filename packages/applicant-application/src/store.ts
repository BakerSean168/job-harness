import type {
  ApplicantProfile,
  ApplicantProfileRevision,
  ApplicationAnswerSet,
  ApplicationAnswerSetRevision,
} from '@job-harness/applicant-contracts';

export interface ApplicantStoreReadPort {
  getProfile(profileId: string): Promise<ApplicantProfile | null>;
  getDefaultProfile(): Promise<ApplicantProfile | null>;
  getProfileRevision(revisionId: string): Promise<ApplicantProfileRevision | null>;
  getLatestProfileRevision(profileId: string): Promise<ApplicantProfileRevision | null>;
  getAnswerSet(answerSetId: string): Promise<ApplicationAnswerSet | null>;
  getDefaultAnswerSet(): Promise<ApplicationAnswerSet | null>;
  getAnswerSetRevision(revisionId: string): Promise<ApplicationAnswerSetRevision | null>;
  getLatestAnswerSetRevision(answerSetId: string): Promise<ApplicationAnswerSetRevision | null>;
}

export interface ApplicantStoreTransactionPort extends ApplicantStoreReadPort {
  upsertProfile(profile: ApplicantProfile, isDefault: boolean): Promise<ApplicantProfile>;
  insertProfileRevision(revision: ApplicantProfileRevision): Promise<void>;
  upsertAnswerSet(answerSet: ApplicationAnswerSet, isDefault: boolean): Promise<ApplicationAnswerSet>;
  insertAnswerSetRevision(revision: ApplicationAnswerSetRevision): Promise<void>;
}

export interface ApplicantStorePort extends ApplicantStoreReadPort {
  transaction<T>(work: (tx: ApplicantStoreTransactionPort) => Promise<T>): Promise<T>;
}
