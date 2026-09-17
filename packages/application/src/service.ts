import { createHash, randomUUID } from 'node:crypto';
import {
  AnalyticsSnapshotInputSchema,
  BeginDiscoveryInputSchema,
  BeginDiscoveryOutputSchema,
  CareerContextInputSchema,
  CareerContextOutputSchema,
  CompleteDiscoveryInputSchema,
  CompleteDiscoveryOutputSchema,
  DashboardSnapshotInputSchema,
  DuplicateCheckInputSchema,
  EntityIdSchema,
  GetApplicationOutputSchema,
  ListDiscoveryRunsInputSchema,
  ListResumeUsageInputSchema,
  JobSchema,
  JobSearchCampaignSchema,
  ListApplicationBoardInputSchema,
  ListApplicationsInputSchema,
  ListCampaignsInputSchema,
  ListCompaniesInputSchema,
  ListResumesInputSchema,
  ListSavedViewsInputSchema,
  PipelineStatsInputSchema,
  RecordApplicationInputSchema,
  ResumeProfileRefSchema,
  SavedViewSchema,
  SearchJobListItemsInputSchema,
  SearchJobsInputSchema,
  SetJobStateInputSchema,
  TransitionApplicationInputSchema,
  UpsertCampaignInputSchema,
  UpsertSavedViewInputSchema,
  UpsertJobsBatchInputSchema,
  UpsertJobsBatchOutputSchema,
  ApplicationSubmissionSchema,
  BeginSubmissionIntentInputSchema,
  ConfirmSubmissionIntentInputSchema,
  FailSubmissionIntentInputSchema,
  ListSubmissionIntentsInputSchema,
  ListSubmissionIntentsOutputSchema,
  PrepareSubmissionIntentInputSchema,
  ReconcileSubmissionIntentInputSchema,
  ReconcileSubmissionIntentsInputSchema,
  ReconcileSubmissionIntentsOutputSchema,
  SubmissionIntentCommitOutputSchema,
  SubmissionIntentSchema,
  type ApplicationDetail,
  type ApplicationSubmission,
  type DiscoveryRun,
  type DuplicateCheckInput,
  type Job,
  type JobObservation,
  type ResumeProfileRef,
  type SubmissionIntent,
  type UpsertJobCandidate,
} from '@job-harness/contracts';
import { canTransitionApplicationStage, canTransitionJobState } from '@job-harness/domain';
import type { CareerApplicationPorts, CareerResumeRegistryPort, CareerRuntimePorts } from './ports';
import {
  CareerConflictError,
  CareerIdempotencyConflictError,
  CareerInvalidTransitionError,
  CareerNotFoundError,
} from './errors';
import type { CareerStorePort, CareerStoreTransactionPort, IdempotencyReceipt } from './store';


export interface CareerResumeSubmissionEvidencePort {
  getProfile?(profileId: string): Promise<{ readonly id: string } | null>;
  getRevision(revisionId: string): Promise<{ readonly id: string; readonly profileId: string } | null>;
  getArtifact(artifactId: string): Promise<{ readonly id: string; readonly revisionId: string } | null>;
}

export interface CareerServiceOptions {
  readonly now?: () => string;
  readonly idFactory?: () => string;
  readonly resumeEvidence?: CareerResumeSubmissionEvidencePort | null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

async function findCandidateDuplicate(tx: CareerStoreTransactionPort, candidate: UpsertJobCandidate) {
  const result = await tx.findDuplicate({
    companyName: candidate.companyName,
    title: candidate.title,
    city: candidate.city ?? null,
    listings: candidate.listings,
  });
  if (result.identityConflict) {
    throw new CareerConflictError(
      `Candidate listings resolve to multiple existing Jobs: ${result.potentialMatches.map((job) => job.id).join(', ')}`,
    );
  }
  return result;
}

async function loadReceipt<T>(
  tx: CareerStoreTransactionPort,
  scope: string,
  key: string,
  input: unknown,
  parse: (value: unknown) => T,
): Promise<T | null> {
  const receipt = await tx.getIdempotencyReceipt(scope, key);
  if (!receipt) return null;
  if (receipt.requestHash !== requestHash(input)) {
    throw new CareerIdempotencyConflictError(scope, key);
  }
  return parse(receipt.result);
}

async function saveReceipt(
  tx: CareerStoreTransactionPort,
  scope: string,
  key: string,
  input: unknown,
  result: unknown,
  now: string,
): Promise<void> {
  const receipt: IdempotencyReceipt = {
    scope,
    key,
    requestHash: requestHash(input),
    result,
    createdAt: now,
  };
  await tx.putIdempotencyReceipt(receipt);
}

export function createCareerApplicationService(
  store: CareerStorePort,
  options: CareerServiceOptions = {},
): CareerRuntimePorts {
  const now = options.now ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? randomUUID;

  async function resolveResumeEvidence(input: {
    resumeProfileId?: string | null;
    resumeRevisionId?: string | null;
    resumeArtifactId?: string | null;
  }): Promise<{ profileId: string | null; revisionId: string | null; artifactId: string | null }> {
    let profileId = input.resumeProfileId ?? null;
    const revisionId = input.resumeRevisionId ?? null;
    const artifactId = input.resumeArtifactId ?? null;
    if (!revisionId) return { profileId, revisionId: null, artifactId: null };
    if (!options.resumeEvidence) throw new CareerConflictError('Resume Revision evidence is unavailable in this runtime');
    const revision = await options.resumeEvidence.getRevision(revisionId);
    if (!revision) throw new CareerNotFoundError('ResumeRevision', revisionId);
    if (profileId && profileId !== revision.profileId) {
      throw new CareerConflictError(`ResumeRevision '${revisionId}' belongs to Profile '${revision.profileId}', not '${profileId}'`);
    }
    profileId = revision.profileId;
    if (artifactId) {
      const artifact = await options.resumeEvidence.getArtifact(artifactId);
      if (!artifact) throw new CareerNotFoundError('ResumeArtifact', artifactId);
      if (artifact.revisionId !== revisionId) {
        throw new CareerConflictError(`ResumeArtifact '${artifactId}' does not belong to ResumeRevision '${revisionId}'`);
      }
    }
    return { profileId, revisionId, artifactId };
  }

  const jobs: CareerApplicationPorts['jobs'] = {
    searchJobs: (input) => store.searchJobs(SearchJobsInputSchema.parse(input)),
    getJob: (jobId) => store.getJob(jobId),
    checkDuplicate: (input) => store.findDuplicate(DuplicateCheckInputSchema.parse(input)),

    async upsertJobsBatch(input) {
      const parsed = UpsertJobsBatchInputSchema.parse(input);
      const items = await store.transaction(async (tx) => {
        const results: Array<{ index: number; status: 'inserted' | 'updated' | 'duplicate' | 'rejected'; jobId: string | null; reason: string | null }> = [];
        for (let index = 0; index < parsed.jobs.length; index += 1) {
          const candidate = parsed.jobs[index]!;
          try {
            if (candidate.discoveryRunId && !(await tx.getDiscoveryRun(candidate.discoveryRunId))) {
              throw new CareerNotFoundError('DiscoveryRun', candidate.discoveryRunId);
            }
            const duplicate = await findCandidateDuplicate(tx, candidate);
            if (duplicate.duplicate && duplicate.job) {
              const merged = await tx.mergeJobCandidate(duplicate.job.id, candidate, now());
              for (const listing of merged.touchedListings) {
                const observation: JobObservation = {
                  id: idFactory(),
                  jobId: duplicate.job.id,
                  listingId: listing.id,
                  discoveryRunId: candidate.discoveryRunId ?? null,
                  observedAt: candidate.observedAt,
                  availability: listing.status,
                };
                await tx.insertObservation(observation);
              }
              results.push({
                index,
                status: merged.metadataChanged ? 'updated' : 'duplicate',
                jobId: duplicate.job.id,
                reason: duplicate.matchedBy ? `matched-by:${duplicate.matchedBy}` : null,
              });
              continue;
            }

            const timestamp = now();
            const company = await tx.resolveCompany(candidate.companyName, timestamp);
            const job: Job = JobSchema.parse({
              id: idFactory(),
              companyId: company.id,
              companyName: company.name,
              title: candidate.title,
              city: candidate.city ?? null,
              state: 'discovered',
              description: candidate.description ?? null,
              listings: [],
              firstSeenAt: candidate.observedAt,
              lastSeenAt: candidate.observedAt,
              createdAt: timestamp,
              updatedAt: timestamp,
            });
            await tx.insertJob(job);
            const merged = await tx.mergeJobCandidate(job.id, candidate, timestamp);
            for (const listing of merged.touchedListings) {
              await tx.insertObservation({
                id: idFactory(),
                jobId: job.id,
                listingId: listing.id,
                discoveryRunId: candidate.discoveryRunId ?? null,
                observedAt: candidate.observedAt,
                availability: listing.status,
              });
            }
            const potential = duplicate.potentialMatches.map((match) => match.id);
            results.push({
              index,
              status: 'inserted',
              jobId: job.id,
              reason: potential.length ? `potential-duplicate:${potential.join(',')}` : null,
            });
          } catch (error) {
            results.push({
              index,
              status: 'rejected',
              jobId: null,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return results;
      });
      return UpsertJobsBatchOutputSchema.parse({ items });
    },

    async setJobState(input) {
      const parsed = SetJobStateInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const scope = 'career_job_state_set';
        const cached = await loadReceipt(tx, scope, parsed.idempotencyKey, parsed, (value) => JobSchema.parse(value));
        if (cached) return cached;
        const current = await tx.getJob(parsed.jobId);
        if (!current) throw new CareerNotFoundError('Job', parsed.jobId);
        if (!canTransitionJobState(current.state, parsed.state)) {
          throw new CareerInvalidTransitionError('job state', current.state, parsed.state);
        }
        const result = current.state === parsed.state ? current : await tx.updateJobState(parsed.jobId, parsed.state, now());
        await saveReceipt(tx, scope, parsed.idempotencyKey, parsed, result, now());
        return result;
      });
    },
  };

  const applications: CareerApplicationPorts['applications'] = {
    listApplications: (input) => store.listApplications(ListApplicationsInputSchema.parse(input)),
    getApplication: (applicationId) => store.getApplication(applicationId),

    async recordApplication(input) {
      const parsed = RecordApplicationInputSchema.parse(input);
      const resumeEvidence = await resolveResumeEvidence({
        resumeProfileId: parsed.resumeProfileId ?? null,
        resumeRevisionId: parsed.resumeRevisionId ?? null,
        resumeArtifactId: parsed.resumeArtifactId ?? null,
      });
      return store.transaction(async (tx) => {
        const scope = 'career_application_record';
        const cached = await loadReceipt(tx, scope, parsed.idempotencyKey, parsed, (value) => GetApplicationOutputSchema.unwrap().parse(value));
        if (cached) return cached;
        const job = await tx.getJob(parsed.jobId);
        if (!job) throw new CareerNotFoundError('Job', parsed.jobId);
        const existing = await tx.findApplicationByJobId(parsed.jobId);
        const listing = parsed.listingId == null ? null : job.listings.find((candidate) => candidate.id === parsed.listingId) ?? null;
        if (parsed.listingId && !listing) throw new CareerNotFoundError('JobListing', parsed.listingId);
        const explicitLegacyProfile = parsed.resumeProfileId ? await tx.getResumeProfile(parsed.resumeProfileId) : null;
        const explicitFirstClassProfile = parsed.resumeProfileId && !explicitLegacyProfile && options.resumeEvidence?.getProfile
          ? await options.resumeEvidence.getProfile(parsed.resumeProfileId)
          : null;
        if (parsed.resumeProfileId && !explicitLegacyProfile && !explicitFirstClassProfile) {
          throw new CareerNotFoundError('ResumeProfile', parsed.resumeProfileId);
        }
        const derivedLegacyProfile = !parsed.resumeProfileId && resumeEvidence.profileId
          ? await tx.getResumeProfile(resumeEvidence.profileId)
          : null;
        // Application.resumeProfileId remains a legacy compatibility projection. Exact first-class
        // Resume evidence is always preserved on ApplicationSubmission instead of being guessed here.
        const compatibilityProfileId = explicitLegacyProfile?.id ?? derivedLegacyProfile?.id ?? null;
        const channel = parsed.channel ?? listing?.sourceKind ?? null;
        const timestamp = now();
        if (existing) {
          const reconciled = await tx.reconcileApplicationRecord(
            existing.id,
            parsed.appliedAt,
            compatibilityProfileId,
            timestamp,
          );
          const submission = ApplicationSubmissionSchema.parse({
            id: idFactory(),
            applicationId: existing.id,
            listingId: listing?.id ?? null,
            submittedAt: parsed.appliedAt,
            channel,
            resumeProfileId: resumeEvidence.profileId,
            resumeRevisionId: resumeEvidence.revisionId,
            resumeArtifactId: resumeEvidence.artifactId,
            actor: parsed.actor,
            idempotencyKey: parsed.idempotencyKey,
            note: parsed.note ?? null,
            createdAt: timestamp,
          });
          await tx.insertApplicationSubmission(submission);
          await tx.insertApplicationEvent({
            id: idFactory(),
            applicationId: existing.id,
            type: 'submission_recorded',
            stage: null,
            occurredAt: parsed.appliedAt,
            actor: parsed.actor,
            idempotencyKey: parsed.idempotencyKey,
            note: parsed.note ?? null,
          });
          const detail = await tx.getApplication(reconciled.id);
          if (!detail) throw new CareerNotFoundError('Application', reconciled.id);
          await saveReceipt(tx, scope, parsed.idempotencyKey, parsed, detail, now());
          return detail;
        }
        const application = {
          id: idFactory(),
          jobId: parsed.jobId,
          currentStage: 'applied' as const,
          appliedAt: parsed.appliedAt,
          resumeProfileId: compatibilityProfileId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await tx.insertApplication(application);
        const submission = ApplicationSubmissionSchema.parse({
          id: idFactory(),
          applicationId: application.id,
          listingId: listing?.id ?? null,
          submittedAt: parsed.appliedAt,
          channel,
          resumeProfileId: resumeEvidence.profileId,
          resumeRevisionId: resumeEvidence.revisionId,
          resumeArtifactId: resumeEvidence.artifactId,
          actor: parsed.actor,
          idempotencyKey: parsed.idempotencyKey,
          note: parsed.note ?? null,
          createdAt: timestamp,
        });
        await tx.insertApplicationSubmission(submission);
        await tx.insertApplicationEvent({
          id: idFactory(),
          applicationId: application.id,
          type: 'application_recorded',
          stage: 'applied',
          occurredAt: parsed.appliedAt,
          actor: parsed.actor,
          idempotencyKey: parsed.idempotencyKey,
          note: parsed.note ?? null,
        });
        const detail = await tx.getApplication(application.id);
        if (!detail) throw new CareerNotFoundError('Application', application.id);
        await saveReceipt(tx, scope, parsed.idempotencyKey, parsed, detail, now());
        return detail;
      });
    },

    async transitionApplication(input) {
      const parsed = TransitionApplicationInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const scope = 'career_application_transition';
        const cached = await loadReceipt(tx, scope, parsed.idempotencyKey, parsed, (value) => GetApplicationOutputSchema.unwrap().parse(value));
        if (cached) return cached;
        const detail = await tx.getApplication(parsed.applicationId);
        if (!detail) throw new CareerNotFoundError('Application', parsed.applicationId);
        if (!canTransitionApplicationStage(detail.application.currentStage, parsed.toStage)) {
          throw new CareerInvalidTransitionError('application stage', detail.application.currentStage, parsed.toStage);
        }
        if (detail.application.currentStage !== parsed.toStage) {
          await tx.updateApplicationStage(parsed.applicationId, parsed.toStage, now());
          await tx.insertApplicationEvent({
            id: idFactory(),
            applicationId: parsed.applicationId,
            type: 'stage_changed',
            stage: parsed.toStage,
            occurredAt: parsed.occurredAt,
            actor: parsed.actor,
            idempotencyKey: parsed.idempotencyKey,
            note: parsed.note ?? null,
          });
        }
        const result = await tx.getApplication(parsed.applicationId);
        if (!result) throw new CareerNotFoundError('Application', parsed.applicationId);
        await saveReceipt(tx, scope, parsed.idempotencyKey, parsed, result, now());
        return result;
      });
    },
  };



  function submissionIntentActor(intent: SubmissionIntent): 'user' | 'chatgpt-web' | 'other' {
    if (intent.executor === 'chatgpt-web') return 'chatgpt-web';
    if (intent.executor === 'manual') return 'user';
    return 'other';
  }

  function confirmationMatches(
    current: SubmissionIntent,
    input: { confirmedAt: string; appliedAt: string; externalReference?: string | null | undefined; externalEvidence: Record<string, unknown> },
  ): boolean {
    return current.externalConfirmedAt === input.confirmedAt
      && current.appliedAt === input.appliedAt
      && current.externalReference === (input.externalReference ?? null)
      && stableJson(current.externalEvidence) === stableJson(input.externalEvidence);
  }

  async function commitSubmissionIntent(intentId: string) {
    const current = await store.getSubmissionIntent(intentId);
    if (!current) throw new CareerNotFoundError('SubmissionIntent', intentId);
    if (current.status === 'committed') {
      const application = current.applicationId ? await store.getApplication(current.applicationId) : null;
      return SubmissionIntentCommitOutputSchema.parse({ intent: current, application, persistenceCommitted: true });
    }
    if (!['external_confirmed', 'persistence_pending', 'needs_manual_review'].includes(current.status)) {
      throw new CareerConflictError(`SubmissionIntent '${intentId}' cannot reconcile from '${current.status}'`);
    }
    if (!current.appliedAt || !current.externalConfirmedAt) {
      throw new CareerConflictError(`SubmissionIntent '${intentId}' has no durable external-success confirmation to reconcile`);
    }

    const recordKey = `submission-intent:${current.id}`;
    try {
      const application = await applications.recordApplication({
        jobId: current.jobId,
        appliedAt: current.appliedAt,
        ...(current.listingId ? { listingId: current.listingId } : {}),
        ...(current.channel ? { channel: current.channel } : {}),
        ...(!current.resumeRevisionId && current.resumeProfileId ? { resumeProfileId: current.resumeProfileId } : {}),
        ...(current.resumeRevisionId ? { resumeRevisionId: current.resumeRevisionId } : {}),
        ...(current.resumeArtifactId ? { resumeArtifactId: current.resumeArtifactId } : {}),
        idempotencyKey: recordKey,
        actor: submissionIntentActor(current),
        note: current.note,
      });
      const submission = application.submissions.find((item) => item.idempotencyKey === recordKey);
      if (!submission) throw new CareerConflictError(`SubmissionIntent '${intentId}' application record has no matching submission evidence`);
      const committed = await store.transaction(async (tx) => {
        const latest = await tx.getSubmissionIntent(intentId);
        if (!latest) throw new CareerNotFoundError('SubmissionIntent', intentId);
        if (latest.status === 'committed') return latest;
        return tx.updateSubmissionIntent(SubmissionIntentSchema.parse({
          ...latest,
          status: 'committed',
          applicationId: application.application.id,
          submissionId: submission.id,
          lastError: null,
          updatedAt: now(),
        }));
      });
      return SubmissionIntentCommitOutputSchema.parse({ intent: committed, application, persistenceCommitted: true });
    } catch (error) {
      const pending = await store.transaction(async (tx) => {
        const latest = await tx.getSubmissionIntent(intentId);
        if (!latest) throw new CareerNotFoundError('SubmissionIntent', intentId);
        if (latest.status === 'committed') return latest;
        return tx.updateSubmissionIntent(SubmissionIntentSchema.parse({
          ...latest,
          status: 'persistence_pending',
          lastError: error instanceof Error ? error.message : String(error),
          retryCount: latest.retryCount + 1,
          updatedAt: now(),
        }));
      });
      const application = pending.applicationId ? await store.getApplication(pending.applicationId) : null;
      return SubmissionIntentCommitOutputSchema.parse({ intent: pending, application, persistenceCommitted: false });
    }
  }

  const submissionIntents: CareerApplicationPorts['submissionIntents'] = {
    list: (input = {}) => store.listSubmissionIntents(ListSubmissionIntentsInputSchema.parse(input)),
    get: (intentId) => store.getSubmissionIntent(intentId),

    async prepare(input) {
      const parsed = PrepareSubmissionIntentInputSchema.parse(input);
      const evidence = await resolveResumeEvidence({
        resumeProfileId: parsed.resumeProfileId ?? null,
        resumeRevisionId: parsed.resumeRevisionId ?? null,
        resumeArtifactId: parsed.resumeArtifactId ?? null,
      });
      return store.transaction(async (tx) => {
        const scope = 'career_submission_intent_prepare';
        const cached = await loadReceipt(tx, scope, parsed.idempotencyKey, parsed, (value) => SubmissionIntentSchema.parse(value));
        if (cached) return (await tx.getSubmissionIntent(cached.id)) ?? cached;
        const job = await tx.getJob(parsed.jobId);
        if (!job) throw new CareerNotFoundError('Job', parsed.jobId);
        const listing = parsed.listingId ? job.listings.find((candidate) => candidate.id === parsed.listingId) ?? null : null;
        if (parsed.listingId && !listing) throw new CareerNotFoundError('JobListing', parsed.listingId);
        if (evidence.profileId && !evidence.revisionId) {
          const [legacyProfile, firstClassProfile] = await Promise.all([
            tx.getResumeProfile(evidence.profileId),
            options.resumeEvidence?.getProfile ? options.resumeEvidence.getProfile(evidence.profileId) : Promise.resolve(null),
          ]);
          if (!legacyProfile && !firstClassProfile) throw new CareerNotFoundError('ResumeProfile', evidence.profileId);
        }
        const timestamp = now();
        const intent = SubmissionIntentSchema.parse({
          id: `submission-intent-${idFactory()}`,
          jobId: parsed.jobId,
          listingId: listing?.id ?? null,
          channel: parsed.channel ?? listing?.sourceKind ?? null,
          resumeProfileId: evidence.profileId,
          resumeRevisionId: evidence.revisionId,
          resumeArtifactId: evidence.artifactId,
          executor: parsed.executor,
          executorSessionId: parsed.executorSessionId ?? null,
          externalTargetUrl: parsed.externalTargetUrl ?? listing?.url ?? null,
          status: 'planned',
          externalStartedAt: null,
          externalConfirmedAt: null,
          appliedAt: null,
          externalReference: null,
          externalEvidence: {},
          applicationId: null,
          submissionId: null,
          prepareIdempotencyKey: parsed.idempotencyKey,
          lastError: null,
          retryCount: 0,
          note: parsed.note ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        await tx.insertSubmissionIntent(intent);
        await saveReceipt(tx, scope, parsed.idempotencyKey, parsed, intent, timestamp);
        return intent;
      });
    },

    async begin(input) {
      const parsed = BeginSubmissionIntentInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const current = await tx.getSubmissionIntent(parsed.intentId);
        if (!current) throw new CareerNotFoundError('SubmissionIntent', parsed.intentId);
        if (current.status === 'external_in_progress') return current;
        if (current.status !== 'planned') throw new CareerConflictError(`SubmissionIntent '${parsed.intentId}' cannot begin from '${current.status}'`);
        return tx.updateSubmissionIntent(SubmissionIntentSchema.parse({
          ...current,
          status: 'external_in_progress',
          externalStartedAt: parsed.occurredAt,
          updatedAt: now(),
        }));
      });
    },

    async confirm(input) {
      const parsed = ConfirmSubmissionIntentInputSchema.parse(input);
      const confirmed = await store.transaction(async (tx) => {
        const current = await tx.getSubmissionIntent(parsed.intentId);
        if (!current) throw new CareerNotFoundError('SubmissionIntent', parsed.intentId);
        if (['committed', 'external_confirmed', 'persistence_pending'].includes(current.status)
          || (current.status === 'needs_manual_review' && current.externalConfirmedAt)) {
          if (!confirmationMatches(current, parsed)) {
            throw new CareerConflictError(`SubmissionIntent '${parsed.intentId}' already has different external-success evidence`);
          }
          return current;
        }
        if (!['planned', 'external_in_progress', 'needs_manual_review'].includes(current.status)) {
          throw new CareerConflictError(`SubmissionIntent '${parsed.intentId}' cannot confirm from '${current.status}'`);
        }
        return tx.updateSubmissionIntent(SubmissionIntentSchema.parse({
          ...current,
          status: 'external_confirmed',
          externalStartedAt: current.externalStartedAt ?? parsed.confirmedAt,
          externalConfirmedAt: parsed.confirmedAt,
          appliedAt: parsed.appliedAt,
          externalReference: parsed.externalReference ?? null,
          externalEvidence: parsed.externalEvidence,
          lastError: null,
          updatedAt: now(),
        }));
      });
      if (confirmed.status === 'committed') {
        const application = confirmed.applicationId ? await store.getApplication(confirmed.applicationId) : null;
        return SubmissionIntentCommitOutputSchema.parse({ intent: confirmed, application, persistenceCommitted: true });
      }
      return commitSubmissionIntent(parsed.intentId);
    },

    async fail(input) {
      const parsed = FailSubmissionIntentInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const current = await tx.getSubmissionIntent(parsed.intentId);
        if (!current) throw new CareerNotFoundError('SubmissionIntent', parsed.intentId);
        if (current.status === 'external_failed') {
          const same = current.status === parsed.status
            && current.lastError === parsed.error
            && stableJson(current.externalEvidence) === stableJson(parsed.externalEvidence);
          if (same) return current;
          throw new CareerConflictError(`SubmissionIntent '${parsed.intentId}' is already terminal with different failure evidence`);
        }
        if (current.status === 'needs_manual_review' && current.externalConfirmedAt) {
          throw new CareerConflictError(`SubmissionIntent '${parsed.intentId}' already has durable external-success evidence and cannot be marked failed`);
        }
        if (!['planned', 'external_in_progress', 'needs_manual_review'].includes(current.status)) {
          throw new CareerConflictError(`SubmissionIntent '${parsed.intentId}' cannot fail from '${current.status}'`);
        }
        return tx.updateSubmissionIntent(SubmissionIntentSchema.parse({
          ...current,
          status: parsed.status,
          externalStartedAt: current.externalStartedAt ?? parsed.occurredAt,
          externalEvidence: parsed.externalEvidence,
          lastError: parsed.error,
          updatedAt: now(),
        }));
      });
    },

    reconcile(input) {
      const parsed = ReconcileSubmissionIntentInputSchema.parse(input);
      return commitSubmissionIntent(parsed.intentId);
    },

    async reconcilePending(input = {}) {
      const parsed = ReconcileSubmissionIntentsInputSchema.parse(input);
      const results: Array<{
        intentId: string;
        beforeStatus: SubmissionIntent['status'];
        afterStatus: SubmissionIntent['status'];
        persistenceCommitted: boolean;
        action: 'committed' | 'pending' | 'manual_review' | 'skipped';
        message: string | null;
      }> = [];

      const recoverable = await store.listSubmissionIntents({
        statuses: ['external_confirmed', 'persistence_pending'],
        limit: parsed.limit,
        offset: 0,
        order: 'oldest',
      });
      for (const candidate of recoverable.items) {
        if (candidate.retryCount >= parsed.maxAutomaticRetries) {
          const reviewed = await store.transaction(async (tx) => {
            const latest = await tx.getSubmissionIntent(candidate.id);
            if (!latest || latest.status === 'committed') return latest;
            if (!['external_confirmed', 'persistence_pending'].includes(latest.status)) return latest;
            return tx.updateSubmissionIntent(SubmissionIntentSchema.parse({
              ...latest,
              status: 'needs_manual_review',
              lastError: `Automatic persistence reconciliation paused after ${latest.retryCount} retries${latest.lastError ? `: ${latest.lastError}` : ''}`,
              updatedAt: now(),
            }));
          });
          if (reviewed) {
            results.push({ intentId: candidate.id, beforeStatus: candidate.status, afterStatus: reviewed.status, persistenceCommitted: false, action: reviewed.status === 'needs_manual_review' ? 'manual_review' : 'skipped', message: reviewed.lastError });
          }
          continue;
        }
        try {
          const outcome = await commitSubmissionIntent(candidate.id);
          results.push({
            intentId: candidate.id,
            beforeStatus: candidate.status,
            afterStatus: outcome.intent.status,
            persistenceCommitted: outcome.persistenceCommitted,
            action: outcome.persistenceCommitted ? 'committed' : 'pending',
            message: outcome.intent.lastError,
          });
        } catch (error) {
          const latest = await store.getSubmissionIntent(candidate.id);
          results.push({
            intentId: candidate.id,
            beforeStatus: candidate.status,
            afterStatus: latest?.status ?? candidate.status,
            persistenceCommitted: false,
            action: 'skipped',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const remaining = Math.max(0, parsed.limit - results.length);
      if (remaining > 0 && parsed.staleBefore) {
        const stale = await store.listSubmissionIntents({
          statuses: ['external_in_progress'],
          updatedBefore: parsed.staleBefore,
          limit: remaining,
          offset: 0,
          order: 'oldest',
        });
        for (const candidate of stale.items) {
          const reviewed = await store.transaction(async (tx) => {
            const latest = await tx.getSubmissionIntent(candidate.id);
            if (!latest || latest.status !== 'external_in_progress' || latest.updatedAt > parsed.staleBefore!) return latest;
            return tx.updateSubmissionIntent(SubmissionIntentSchema.parse({
              ...latest,
              status: 'needs_manual_review',
              lastError: `External submission remained in progress past ${parsed.staleBefore}; verify the recruiting site before retrying`,
              updatedAt: now(),
            }));
          });
          if (!reviewed) continue;
          results.push({
            intentId: candidate.id,
            beforeStatus: candidate.status,
            afterStatus: reviewed.status,
            persistenceCommitted: false,
            action: reviewed.status === 'needs_manual_review' ? 'manual_review' : 'skipped',
            message: reviewed.lastError,
          });
        }
      }

      return ReconcileSubmissionIntentsOutputSchema.parse({
        scanned: results.length,
        committed: results.filter((item) => item.action === 'committed').length,
        pending: results.filter((item) => item.action === 'pending').length,
        manualReview: results.filter((item) => item.action === 'manual_review').length,
        skipped: results.filter((item) => item.action === 'skipped').length,
        items: results,
      });
    },
  };

  const campaigns: CareerApplicationPorts['campaigns'] = {
    listCampaigns: (input = {}) => store.listCampaigns(ListCampaignsInputSchema.parse(input)),
    getCampaign: (campaignId) => store.getCampaign(campaignId),
    async upsertCampaign(input) {
      const parsed = UpsertCampaignInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const existing = await tx.getCampaign(parsed.id);
        const timestamp = now();
        return tx.upsertCampaign(JobSearchCampaignSchema.parse({
          ...parsed,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }));
      });
    },
  };

  const discovery: CareerApplicationPorts['discovery'] = {
    async beginDiscoveryRun(input) {
      const parsed = BeginDiscoveryInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const scope = 'career_discovery_begin';
        const cached = await loadReceipt(tx, scope, parsed.idempotencyKey, parsed, (value) => BeginDiscoveryOutputSchema.parse(value));
        if (cached) return (await tx.getDiscoveryRun(cached.id)) ?? cached;
        if (parsed.campaignId && !(await tx.getCampaign(parsed.campaignId))) {
          throw new CareerNotFoundError('JobSearchCampaign', parsed.campaignId);
        }
        const run: DiscoveryRun = {
          id: idFactory(),
          campaignId: parsed.campaignId ?? null,
          executor: parsed.executor,
          contextSnapshot: parsed.contextSnapshot,
          startedAt: parsed.startedAt,
          completedAt: null,
          candidateCount: 0,
          insertedCount: 0,
          duplicateCount: 0,
          rejectedCount: 0,
        };
        await tx.insertDiscoveryRun(run);
        await saveReceipt(tx, scope, parsed.idempotencyKey, parsed, run, now());
        return BeginDiscoveryOutputSchema.parse(run);
      });
    },

    async completeDiscoveryRun(input) {
      const parsed = CompleteDiscoveryInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const run = await tx.getDiscoveryRun(parsed.runId);
        if (!run) throw new CareerNotFoundError('DiscoveryRun', parsed.runId);
        if (run.completedAt) {
          const same = run.completedAt === parsed.completedAt &&
            run.candidateCount === parsed.candidateCount &&
            run.insertedCount === parsed.insertedCount &&
            run.duplicateCount === parsed.duplicateCount &&
            run.rejectedCount === parsed.rejectedCount;
          if (!same) throw new CareerConflictError(`DiscoveryRun '${parsed.runId}' is already completed with different counts`);
          return run;
        }
        return CompleteDiscoveryOutputSchema.parse(await tx.updateDiscoveryRun({
          ...run,
          completedAt: parsed.completedAt,
          candidateCount: parsed.candidateCount,
          insertedCount: parsed.insertedCount,
          duplicateCount: parsed.duplicateCount,
          rejectedCount: parsed.rejectedCount,
        }));
      });
    },
  };

  const resumes: CareerApplicationPorts['resumes'] = {
    listResumeProfiles: (input = {}) => store.listResumeProfiles(ListResumesInputSchema.parse(input)),
  };

  const savedViews: CareerApplicationPorts['savedViews'] = {
    listSavedViews: (input = {}) => store.listSavedViews(ListSavedViewsInputSchema.parse(input)),

    async upsertSavedView(input) {
      const parsed = UpsertSavedViewInputSchema.parse(input);
      return store.transaction(async (tx) => {
        const existing = await tx.getSavedView(parsed.id);
        const nameConflict = await tx.findSavedViewByName(parsed.workspace, parsed.name);
        if (nameConflict && nameConflict.id !== parsed.id) {
          throw new CareerConflictError(`Saved view '${parsed.name}' already exists in workspace '${parsed.workspace}'`);
        }
        const timestamp = now();
        return tx.upsertSavedView(SavedViewSchema.parse({
          ...parsed,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }));
      });
    },

    async deleteSavedView(savedViewId) {
      const id = EntityIdSchema.parse(savedViewId);
      return store.transaction(async (tx) => ({ deleted: await tx.deleteSavedView(id) }));
    },
  };

  const analytics: CareerApplicationPorts['analytics'] = {
    getPipelineStats: (input) => store.getPipelineStats(PipelineStatsInputSchema.parse(input)),
    async getCareerContext(input) {
      const parsed = CareerContextInputSchema.parse(input);
      const [campaign, resumePage, pipeline] = await Promise.all([
        parsed.campaignId ? store.getCampaign(parsed.campaignId) : Promise.resolve(null),
        store.listResumeProfiles({ limit: 200, offset: 0 }),
        store.getPipelineStats({ campaignId: parsed.campaignId }),
      ]);
      return CareerContextOutputSchema.parse({ campaign, resumes: resumePage.items, pipeline });
    },
  };

  const workspace: CareerApplicationPorts['workspace'] = {
    listCompanies: (input) => store.listCompanyViews(ListCompaniesInputSchema.parse(input)),
    getCompanyDetail: (companyId, campaignId) => store.getCompanyDetailView(companyId, campaignId),
    getAnalyticsSnapshot: (input) => store.getAnalyticsSnapshot(AnalyticsSnapshotInputSchema.parse(input), now()),
    searchJobListItems: (input) => store.searchJobListItems(SearchJobListItemsInputSchema.parse(input)),
    listApplicationBoard: (input) => store.listApplicationBoard(ListApplicationBoardInputSchema.parse(input)),
    getApplicationWorkspaceDetail: (applicationId) => store.getApplicationWorkspaceDetail(applicationId),
    getJobDetail: (jobId) => store.getJobDetailView(jobId),
    getDashboardSnapshot: (input) => store.getDashboardSnapshot(DashboardSnapshotInputSchema.parse(input), now()),
    listDiscoveryRuns: (input) => store.listDiscoveryRunViews(ListDiscoveryRunsInputSchema.parse(input)),
    getDiscoveryRunDetail: (runId) => store.getDiscoveryRunDetailView(runId),
    listResumeUsage: (input = {}) => store.listResumeUsage(ListResumeUsageInputSchema.parse(input)),
  };

  const resumeRegistry: CareerResumeRegistryPort = {
    async syncResumeProfiles(profiles) {
      const parsed = profiles.map((profile) => ResumeProfileRefSchema.parse(profile));
      await store.transaction((tx) => tx.upsertResumeProfiles(parsed));
      return { synced: parsed.length };
    },
  };

  return { jobs, applications, submissionIntents, campaigns, discovery, resumes, analytics, workspace, savedViews, resumeRegistry };
}
