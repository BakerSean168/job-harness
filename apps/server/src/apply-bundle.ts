import { createHash } from 'node:crypto';
import { ApplyBundleSchema } from '@job-harness/apply-contracts';
import { ApplyConflictError, ApplyNotFoundError, ApplyNotReadyError, type ApplyBundleFactoryPort } from '@job-harness/apply-runtime';
import type { CareerRuntimePorts } from '@job-harness/application';
import type { SqliteResumeStore } from '@job-harness/persistence-sqlite';
import type { ApplicantStoreReadPort } from '@job-harness/applicant-application';

export function createApplyBundleFactory(
  career: CareerRuntimePorts,
  resumeStore: SqliteResumeStore,
  applicantStore?: ApplicantStoreReadPort | null,
): ApplyBundleFactoryPort {
  return {
    async create(input) {
      const intent = await career.submissionIntents.get(input.intentId);
      if (!intent) throw new ApplyNotFoundError('SubmissionIntent', input.intentId);
      if (intent.status !== 'planned') throw new ApplyConflictError(`SubmissionIntent '${intent.id}' is '${intent.status}' and cannot be dispatched`);
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
      const catalogParts = [
        profileRevision ? `profile:${profileRevision.id}:${profileRevision.contentHash}` : null,
        resumeRevision ? `resume:${resumeRevision.id}:${resumeRevision.contentHash.toLowerCase()}` : null,
        answerRevision ? `answers:${answerRevision.id}:${answerRevision.contentHash}` : null,
      ].filter((value): value is string => Boolean(value));
      const catalogVersion = catalogParts.length
        ? `applicant-snapshot:${createHash('sha256').update(catalogParts.join('|')).digest('hex')}`
        : input.applicantCatalogVersion;

      return ApplyBundleSchema.parse({
        intentId: intent.id, attemptId: input.attemptId, jobId: job.id, listingId: listing?.id ?? null, listingUrl,
        company: job.companyName, title: job.title, city: job.city,
        resumeProfileId: intent.resumeProfileId, resumeRevisionId: intent.resumeRevisionId, resumeArtifact,
        applicantCatalogVersion: catalogVersion ?? null,
        applicantProfileRevisionId: profileRevision?.id ?? null,
        applicantProfileHash: profileRevision?.contentHash ?? null,
        answerSetRevisionId: answerRevision?.id ?? null,
        answerSetVersion: answerRevision ? `answer-set:${answerRevision.id}:v${answerRevision.answerSetVersion}` : input.answerSetVersion,
        answerSetHash: answerRevision?.contentHash ?? input.answerSetHash,
        policySnapshot: input.policySnapshot, createdAt: input.createdAt,
      });
    },
  };
}

function pdfFileName(value: string): string {
  const cleaned = value.replace(/[\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim().slice(0, 220) || 'resume';
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}
