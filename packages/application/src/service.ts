import { createHash, randomUUID } from 'node:crypto';
import {
  BeginDiscoveryInputSchema,
  BeginDiscoveryOutputSchema,
  CareerContextInputSchema,
  CareerContextOutputSchema,
  CompleteDiscoveryInputSchema,
  CompleteDiscoveryOutputSchema,
  DashboardSnapshotInputSchema,
  DuplicateCheckInputSchema,
  GetApplicationOutputSchema,
  ListDiscoveryRunsInputSchema,
  ListResumeUsageInputSchema,
  JobSchema,
  JobSearchCampaignSchema,
  ListApplicationBoardInputSchema,
  ListApplicationsInputSchema,
  ListCampaignsInputSchema,
  ListResumesInputSchema,
  PipelineStatsInputSchema,
  RecordApplicationInputSchema,
  ResumeProfileRefSchema,
  SearchJobListItemsInputSchema,
  SearchJobsInputSchema,
  SetJobStateInputSchema,
  TransitionApplicationInputSchema,
  UpsertCampaignInputSchema,
  UpsertJobsBatchInputSchema,
  UpsertJobsBatchOutputSchema,
  type ApplicationDetail,
  type DiscoveryRun,
  type DuplicateCheckInput,
  type Job,
  type JobObservation,
  type ResumeProfileRef,
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

export interface CareerServiceOptions {
  readonly now?: () => string;
  readonly idFactory?: () => string;
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
      return store.transaction(async (tx) => {
        const scope = 'career_application_record';
        const cached = await loadReceipt(tx, scope, parsed.idempotencyKey, parsed, (value) => GetApplicationOutputSchema.unwrap().parse(value));
        if (cached) return cached;
        const job = await tx.getJob(parsed.jobId);
        if (!job) throw new CareerNotFoundError('Job', parsed.jobId);
        const existing = await tx.findApplicationByJobId(parsed.jobId);
        if (parsed.resumeProfileId && !(await tx.getResumeProfile(parsed.resumeProfileId))) {
          throw new CareerNotFoundError('ResumeProfileRef', parsed.resumeProfileId);
        }
        const timestamp = now();
        if (existing) {
          const reconciled = await tx.reconcileApplicationRecord(
            existing.id,
            parsed.appliedAt,
            parsed.resumeProfileId ?? null,
            timestamp,
          );
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
          resumeProfileId: parsed.resumeProfileId ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await tx.insertApplication(application);
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

  return { jobs, applications, campaigns, discovery, resumes, analytics, workspace, resumeRegistry };
}
