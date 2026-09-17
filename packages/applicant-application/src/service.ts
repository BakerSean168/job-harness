import { randomUUID } from 'node:crypto';
import {
  ApplicantProfileContextSchema,
  ApplicantProfileRevisionSchema,
  ApplicantProfileSchema,
  ApplicationAnswerSetContextSchema,
  ApplicationAnswerSetRevisionSchema,
  ApplicationAnswerSetSchema,
  SaveApplicantProfileInputSchema,
  SaveApplicationAnswerSetInputSchema,
  type ApplicantProfile,
  type ApplicantProfileContext,
  type ApplicationAnswerSet,
  type ApplicationAnswerSetContext,
  type SaveApplicantProfileInput,
  type SaveApplicationAnswerSetInput,
} from '@job-harness/applicant-contracts';
import { hashApplicantDocument } from './hash';
import type { ApplicantStorePort } from './store';

export class ApplicantNotFoundError extends Error {
  constructor(readonly entity: 'ApplicantProfile' | 'ApplicationAnswerSet', readonly id: string) {
    super(`${entity} '${id}' was not found`); this.name = 'ApplicantNotFoundError';
  }
}
export class ApplicantConcurrencyError extends Error {
  constructor(readonly entity: 'ApplicantProfile' | 'ApplicationAnswerSet', readonly id: string, readonly expected: number, readonly actual: number) {
    super(`${entity} '${id}' version conflict: expected v${expected}, actual v${actual}`); this.name = 'ApplicantConcurrencyError';
  }
}

export interface ApplicantRuntimePorts {
  getDefaultProfile(): Promise<ApplicantProfileContext | null>;
  saveProfile(input: SaveApplicantProfileInput): Promise<ApplicantProfileContext>;
  getDefaultAnswerSet(): Promise<ApplicationAnswerSetContext | null>;
  saveAnswerSet(input: SaveApplicationAnswerSetInput): Promise<ApplicationAnswerSetContext>;
  ensureDefaults(input: { profile: ApplicantProfile; answerSet: ApplicationAnswerSet }): Promise<{ profile: ApplicantProfileContext; answerSet: ApplicationAnswerSetContext }>;
}

export function createApplicantApplicationService(store: ApplicantStorePort, options: { now?: () => string; idFactory?: () => string } = {}): ApplicantRuntimePorts {
  const now = options.now ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? randomUUID;

  async function profileContext(profile: ApplicantProfile): Promise<ApplicantProfileContext> {
    const revision = await store.getLatestProfileRevision(profile.id);
    if (!revision) throw new Error(`ApplicantProfile '${profile.id}' has no revision`);
    return ApplicantProfileContextSchema.parse({ profile, latestRevision: revision });
  }
  async function answerContext(answerSet: ApplicationAnswerSet): Promise<ApplicationAnswerSetContext> {
    const revision = await store.getLatestAnswerSetRevision(answerSet.id);
    if (!revision) throw new Error(`ApplicationAnswerSet '${answerSet.id}' has no revision`);
    return ApplicationAnswerSetContextSchema.parse({ answerSet, latestRevision: revision });
  }

  return {
    async getDefaultProfile() { const profile = await store.getDefaultProfile(); return profile ? profileContext(profile) : null; },
    async getDefaultAnswerSet() { const set = await store.getDefaultAnswerSet(); return set ? answerContext(set) : null; },
    async saveProfile(raw) {
      const input = SaveApplicantProfileInputSchema.parse(raw);
      return store.transaction(async (tx) => {
        const current = await tx.getProfile(input.profile.id);
        if (!current) throw new ApplicantNotFoundError('ApplicantProfile', input.profile.id);
        if (current.version !== input.expectedVersion) throw new ApplicantConcurrencyError('ApplicantProfile', current.id, input.expectedVersion, current.version);
        const candidate = ApplicantProfileSchema.parse({ ...input.profile, version: current.version, createdAt: current.createdAt, updatedAt: current.updatedAt });
        const previous = await tx.getLatestProfileRevision(current.id);
        if (hashApplicantDocument(candidate) === hashApplicantDocument(current) && previous) {
          return ApplicantProfileContextSchema.parse({ profile: current, latestRevision: previous });
        }
        const next = ApplicantProfileSchema.parse({ ...candidate, version: current.version + 1, updatedAt: now() });
        await tx.upsertProfile(next, true);
        const contentHash = hashApplicantDocument(next);
        const revision = previous?.contentHash === contentHash ? previous : ApplicantProfileRevisionSchema.parse({
          id: `applicant-profile-rev-${idFactory()}`, profileId: next.id,
          revisionNumber: (previous?.revisionNumber ?? 0) + 1, profileVersion: next.version,
          snapshot: next, contentHash, createdAt: now(), createdBy: 'user',
        });
        if (revision !== previous) await tx.insertProfileRevision(revision);
        return ApplicantProfileContextSchema.parse({ profile: next, latestRevision: revision });
      });
    },
    async saveAnswerSet(raw) {
      const input = SaveApplicationAnswerSetInputSchema.parse(raw);
      return store.transaction(async (tx) => {
        const current = await tx.getAnswerSet(input.answerSet.id);
        if (!current) throw new ApplicantNotFoundError('ApplicationAnswerSet', input.answerSet.id);
        if (current.version !== input.expectedVersion) throw new ApplicantConcurrencyError('ApplicationAnswerSet', current.id, input.expectedVersion, current.version);
        const candidate = ApplicationAnswerSetSchema.parse({ ...input.answerSet, version: current.version, createdAt: current.createdAt, updatedAt: current.updatedAt });
        const previous = await tx.getLatestAnswerSetRevision(current.id);
        if (hashApplicantDocument(candidate) === hashApplicantDocument(current) && previous) {
          return ApplicationAnswerSetContextSchema.parse({ answerSet: current, latestRevision: previous });
        }
        const next = ApplicationAnswerSetSchema.parse({ ...candidate, version: current.version + 1, updatedAt: now() });
        await tx.upsertAnswerSet(next, true);
        const contentHash = hashApplicantDocument(next);
        const revision = previous?.contentHash === contentHash ? previous : ApplicationAnswerSetRevisionSchema.parse({
          id: `answer-set-rev-${idFactory()}`, answerSetId: next.id,
          revisionNumber: (previous?.revisionNumber ?? 0) + 1, answerSetVersion: next.version,
          snapshot: next, contentHash, createdAt: now(), createdBy: 'user',
        });
        if (revision !== previous) await tx.insertAnswerSetRevision(revision);
        return ApplicationAnswerSetContextSchema.parse({ answerSet: next, latestRevision: revision });
      });
    },
    async ensureDefaults(input) {
      return store.transaction(async (tx) => {
        let profile = await tx.getDefaultProfile();
        let profileRevision = profile ? await tx.getLatestProfileRevision(profile.id) : null;
        if (!profile) {
          profile = ApplicantProfileSchema.parse(input.profile);
          await tx.upsertProfile(profile, true);
          profileRevision = ApplicantProfileRevisionSchema.parse({
            id: `applicant-profile-rev-${idFactory()}`, profileId: profile.id, revisionNumber: 1, profileVersion: profile.version,
            snapshot: profile, contentHash: hashApplicantDocument(profile), createdAt: now(), createdBy: 'import',
          });
          await tx.insertProfileRevision(profileRevision);
        }
        let answerSet = await tx.getDefaultAnswerSet();
        let answerRevision = answerSet ? await tx.getLatestAnswerSetRevision(answerSet.id) : null;
        if (!answerSet) {
          answerSet = ApplicationAnswerSetSchema.parse(input.answerSet);
          await tx.upsertAnswerSet(answerSet, true);
          answerRevision = ApplicationAnswerSetRevisionSchema.parse({
            id: `answer-set-rev-${idFactory()}`, answerSetId: answerSet.id, revisionNumber: 1, answerSetVersion: answerSet.version,
            snapshot: answerSet, contentHash: hashApplicantDocument(answerSet), createdAt: now(), createdBy: 'import',
          });
          await tx.insertAnswerSetRevision(answerRevision);
        }
        if (!profileRevision || !answerRevision) throw new Error('Applicant default revision bootstrap failed');
        return {
          profile: ApplicantProfileContextSchema.parse({ profile, latestRevision: profileRevision }),
          answerSet: ApplicationAnswerSetContextSchema.parse({ answerSet, latestRevision: answerRevision }),
        };
      });
    },
  };
}
