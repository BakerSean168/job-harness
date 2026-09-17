import { ApplyBundleSchema } from '@job-harness/apply-contracts';
import { ApplyConflictError, ApplyNotFoundError, ApplyNotReadyError, type ApplyBundleFactoryPort } from '@job-harness/apply-runtime';
import type { CareerRuntimePorts } from '@job-harness/application';
import type { SqliteResumeStore } from '@job-harness/persistence-sqlite';

export function createApplyBundleFactory(
  career: CareerRuntimePorts,
  resumeStore: SqliteResumeStore,
): ApplyBundleFactoryPort {
  return {
    async create(input) {
      const intent = await career.submissionIntents.get(input.intentId);
      if (!intent) throw new ApplyNotFoundError('SubmissionIntent', input.intentId);
      if (intent.status !== 'planned') {
        throw new ApplyConflictError(`SubmissionIntent '${intent.id}' is '${intent.status}' and cannot be dispatched`);
      }
      const job = await career.jobs.getJob(intent.jobId);
      if (!job) throw new ApplyNotFoundError('Job', intent.jobId);
      const listing = intent.listingId == null
        ? null
        : job.listings.find((candidate) => candidate.id === intent.listingId) ?? null;
      if (intent.listingId && !listing) throw new ApplyNotFoundError('JobListing', intent.listingId);
      const listingUrl = intent.externalTargetUrl ?? listing?.url ?? null;
      if (!listingUrl) {
        throw new ApplyNotReadyError(`SubmissionIntent '${intent.id}' has no executable target URL`);
      }

      let resumeArtifact = null;
      if (intent.resumeArtifactId) {
        const artifact = await resumeStore.getArtifact(intent.resumeArtifactId);
        if (!artifact) throw new ApplyNotFoundError('ResumeArtifact', intent.resumeArtifactId);
        if (intent.resumeRevisionId && artifact.revisionId !== intent.resumeRevisionId) {
          throw new ApplyConflictError(`ResumeArtifact '${artifact.id}' does not belong to intent Revision '${intent.resumeRevisionId}'`);
        }
        if (artifact.kind !== 'pdf' || artifact.mimeType !== 'application/pdf') {
          throw new ApplyConflictError(`Apply Executor requires a PDF Resume Artifact; '${artifact.id}' is '${artifact.kind}/${artifact.mimeType}'`);
        }
        resumeArtifact = {
          id: artifact.id,
          revisionId: artifact.revisionId,
          sha256: artifact.sha256.toLowerCase(),
          byteSize: artifact.byteSize,
          mimeType: artifact.mimeType,
        };
      }

      return ApplyBundleSchema.parse({
        intentId: intent.id,
        attemptId: input.attemptId,
        jobId: job.id,
        listingId: listing?.id ?? null,
        listingUrl,
        company: job.companyName,
        title: job.title,
        city: job.city,
        resumeProfileId: intent.resumeProfileId,
        resumeRevisionId: intent.resumeRevisionId,
        resumeArtifact,
        applicantCatalogVersion: input.applicantCatalogVersion,
        answerSetVersion: input.answerSetVersion,
        answerSetHash: input.answerSetHash,
        policySnapshot: input.policySnapshot,
        createdAt: input.createdAt,
      });
    },
  };
}
