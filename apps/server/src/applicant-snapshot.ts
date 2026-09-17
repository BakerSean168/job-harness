import { createHash } from 'node:crypto';

export interface FrozenApplicantSnapshotEvidence {
  readonly applicantProfile?: { readonly revisionId: string; readonly contentHash: string } | null;
  readonly resume?: { readonly revisionId: string; readonly contentHash: string } | null;
  readonly answerSet?: { readonly revisionId: string; readonly contentHash: string } | null;
}

export function applicantSnapshotVersion(evidence: FrozenApplicantSnapshotEvidence): string | null {
  const parts = [
    evidence.applicantProfile ? `profile:${evidence.applicantProfile.revisionId}:${evidence.applicantProfile.contentHash.toLowerCase()}` : null,
    evidence.resume ? `resume:${evidence.resume.revisionId}:${evidence.resume.contentHash.toLowerCase()}` : null,
    evidence.answerSet ? `answers:${evidence.answerSet.revisionId}:${evidence.answerSet.contentHash.toLowerCase()}` : null,
  ].filter((value): value is string => value !== null);
  return parts.length
    ? `applicant-snapshot:${createHash('sha256').update(parts.join('|')).digest('hex')}`
    : null;
}

export function answerSetVersion(revisionId: string, version: number): string {
  return `answer-set:${revisionId}:v${version}`;
}
