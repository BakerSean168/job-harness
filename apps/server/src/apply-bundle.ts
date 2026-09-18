import { ApplyBundleSchema } from '@job-harness/apply-contracts';
import { ApplyConflictError, ApplyNotFoundError, ApplyNotReadyError, type ApplyBundleFactoryPort } from '@job-harness/apply-runtime';
import type { CareerRuntimePorts } from '@job-harness/application';
import type { ResumeArtifact, ResumeRevision } from '@job-harness/resume-contracts';
import type { ApplicantStoreReadPort } from '@job-harness/applicant-application';
import { applicantSnapshotVersion, answerSetVersion } from './applicant-snapshot';

export interface ResumeApplyEvidenceReader {
  getRevision(revisionId: string): Promise<ResumeRevision | null>;
  getArtifact(artifactId: string): Promise<ResumeArtifact | null>;
}

export function createApplyBundleFactory(
  career: CareerRuntimePorts,
  resumeStore: ResumeApplyEvidenceReader,
  applicantStore?: ApplicantStoreReadPort | null,
): ApplyBundleFactoryPort {
  return {
    async create(input) {
      const intent = await career.submissionIntents.get(input.intentId);
      if (!intent) throw new ApplyNotFoundError('SubmissionIntent', input.intentId);
      const reconciliationOnly = input.policySnapshot.reconciliationOnly === true;
      const dispatchable = intent.status === 'planned' || (intent.status === 'needs_manual_review' && reconciliationOnly);
      if (!dispatchable) throw new ApplyConflictError(`SubmissionIntent '${intent.id}' is '${intent.status}' and cannot be dispatched`);
      const job = await career.jobs.getJob(intent.jobId); if (!job) throw new ApplyNotFoundError('Job', intent.jobId);
      const listing = intent.listingId == null ? null : job.listings.find((candidate) => candidate.id === intent.listingId) ?? null;
      if (intent.listingId && !listing) throw new ApplyNotFoundError('JobListing', intent.listingId);
      const listingUrl = intent.externalTargetUrl ?? listing?.url ?? null;
      if (!listingUrl) throw new ApplyNotReadyError(`SubmissionIntent '${intent.id}' has no executable target URL`);

      let resumeArtifact = null;
      if (intent.resumeArtifactId) {
        const artifact = await resumeStore.getArtifact(intent.resumeArtifactId); if (!artifact) throw new ApplyNotFoundError('ResumeArtifact', intent.resumeArtifactId);
        if (intent.resumeRevisionId && artifact.revisionId !== intent.resumeRevisionId) throw new ApplyConflictError(`ResumeArtifact '${artifact.id}' does not belong to intent Revision '${intent.resumeRevisionId}'`);
        if (artifact.kind !== 'pdf' || artifact.mimeType !== 'application/pdf') throw new ApplyConflictError(`Apply Executor requires a PDF Resume Artifact; '${artifact.id}' is '${artifact.kind}/${artifact.mimeType}'`);
        const revision = await resumeStore.getRevision(artifact.revisionId); if (!revision) throw new ApplyNotFoundError('ResumeRevision', artifact.revisionId);
        resumeArtifact = { id: artifact.id, revisionId: artifact.revisionId, sha256: artifact.sha256.toLowerCase(), byteSize: artifact.byteSize, mimeType: artifact.mimeType, fileName: pdfFileName(revision.resolvedDocumentSnapshot.output.pdfName ?? revision.resolvedDocumentSnapshot.output.documentTitle) };
      }

      const profileRevision = applicantStore ? await applicantStore.getDefaultProfile().then(async (profile) => profile ? applicantStore.getLatestProfileRevision(profile.id) : null) : null;
      const answerRevision = applicantStore ? await applicantStore.getDefaultAnswerSet().then(async (set) => set ? applicantStore.getLatestAnswerSetRevision(set.id) : null) : null;
      const resumeRevision = intent.resumeRevisionId ? await resumeStore.getRevision(intent.resumeRevisionId) : null;
      const catalogVersion = applicantSnapshotVersion({
        applicantProfile: profileRevision ? { revisionId: profileRevision.id, contentHash: profileRevision.contentHash } : null,
        resume: resumeRevision ? { revisionId: resumeRevision.id, contentHash: resumeRevision.contentHash } : null,
        answerSet: answerRevision ? { revisionId: answerRevision.id, contentHash: answerRevision.contentHash } : null,
      });

      return ApplyBundleSchema.parse({
        intentId: intent.id, attemptId: input.attemptId, jobId: job.id, listingId: listing?.id ?? null, listingUrl,
        company: job.companyName, title: job.title, city: job.city,
        resumeProfileId: intent.resumeProfileId, resumeRevisionId: intent.resumeRevisionId, resumeArtifact,
        applicantCatalogVersion: catalogVersion ?? null,
        applicantProfileRevisionId: profileRevision?.id ?? null,
        applicantProfileHash: profileRevision?.contentHash ?? null,
        answerSetRevisionId: answerRevision?.id ?? null,
        answerSetVersion: answerRevision ? answerSetVersion(answerRevision.id, answerRevision.answerSetVersion) : null,
        answerSetHash: answerRevision?.contentHash ?? null,
        policySnapshot: input.policySnapshot, createdAt: input.createdAt,
      });
    },
  };
}

function pdfFileName(value: string): string {
  const cleaned = value.replace(/[\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim().slice(0, 220) || 'resume';
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}
