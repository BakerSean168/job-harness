import type { Express, Request, Response } from 'express';
import {
  JOB_HARNESS_REST_V1_ROUTES,
  JobResumeMatchSchema,
  PrepareRecommendedSubmissionIntentInputSchema,
  PrepareRecommendedSubmissionIntentOutputSchema,
  RecommendJobResumesOutputSchema,
  type JobResumeMatch,
  type PrepareRecommendedSubmissionIntentInput,
  type PrepareRecommendedSubmissionIntentOutput,
  type RecommendJobResumesOutput,
} from '@job-harness/contracts';
import {
  CareerApplicationError,
  CareerConflictError,
  CareerNotFoundError,
  type CareerRuntimePorts,
} from '@job-harness/application';
import {
  ResumeArtifactCapabilityError,
  ResumeArtifactIntegrityError,
  ResumeNotFoundError,
  rankResumeProfilesForJob,
  type ResumeArtifactRuntimePorts,
  type ResumeJobMatch,
  type ResumeRuntimePorts,
} from '@job-harness/resume-application';
import { registerRestV1Route } from './rest-route';
import { writeCommonRestError, writeInternalRestError, writeRestError } from './http-errors';

function strongestSignals(match: ResumeJobMatch): JobResumeMatch['positiveSignals'] {
  const all = [
    ...match.matches.specialization,
    ...match.matches.titleStrong,
    ...match.matches.detailStrong,
    ...match.matches.combos,
    ...match.matches.titleMedium,
    ...match.matches.detailSupport,
  ];
  const best = new Map<string, number>();
  for (const item of all) best.set(item.keyword, Math.max(best.get(item.keyword) ?? Number.NEGATIVE_INFINITY, item.score));
  return [...best.entries()]
    .map(([keyword, score]) => ({ keyword, score }))
    .sort((left, right) => right.score - left.score || left.keyword.localeCompare(right.keyword))
    .slice(0, 12);
}

function riskSignals(match: ResumeJobMatch): JobResumeMatch['riskSignals'] {
  const all = [...match.matches.titleBlock, ...match.matches.detailNegative];
  const best = new Map<string, number>();
  for (const item of all) best.set(item.keyword, Math.max(best.get(item.keyword) ?? Number.NEGATIVE_INFINITY, item.score));
  return [...best.entries()]
    .map(([keyword, score]) => ({ keyword, score }))
    .sort((left, right) => right.score - left.score || left.keyword.localeCompare(right.keyword))
    .slice(0, 10);
}

export interface JobResumePreparationService {
  recommend(jobId: string): Promise<RecommendJobResumesOutput>;
  prepare(jobId: string, input: PrepareRecommendedSubmissionIntentInput): Promise<PrepareRecommendedSubmissionIntentOutput>;
}

export function createJobResumePreparationService(
  career: CareerRuntimePorts,
  resume: ResumeRuntimePorts,
  artifacts: ResumeArtifactRuntimePorts,
): JobResumePreparationService {
  async function recommend(jobId: string): Promise<RecommendJobResumesOutput> {
    const detail = await career.workspace.getJobDetail(jobId);
    if (!detail) throw new CareerNotFoundError('Job', jobId);
    const profiles = (await resume.listProfiles()).items;
    const ranked = rankResumeProfilesForJob({ title: detail.job.title, description: detail.job.description }, profiles);
    const items = await Promise.all(ranked.map(async (match): Promise<JobResumeMatch> => {
      const revisions = await resume.listRevisions(match.profileId);
      const latest = [...revisions.items].sort((left, right) => right.revisionNumber - left.revisionNumber)[0] ?? null;
      const revisionDetail = latest ? await resume.getRevisionDetail(latest.id) : null;
      const pdf = revisionDetail?.artifacts
        .filter((artifact) => artifact.kind === 'pdf' && artifact.mimeType === 'application/pdf')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
      return JobResumeMatchSchema.parse({
        profileId: match.profileId,
        profileName: match.profileName,
        targetRole: match.targetRole,
        score: match.score,
        decision: match.decision,
        family: match.family,
        latestRevisionId: latest?.id ?? null,
        latestPdfArtifactId: pdf?.id ?? null,
        executable: Boolean(latest && pdf),
        breakdown: {
          titleScore: match.titleScore,
          detailScore: match.detailScore,
          supportScore: match.supportScore,
          comboScore: match.comboScore,
          specializationScore: match.specializationScore,
          titlePenaltyScore: match.titlePenaltyScore,
          penaltyScore: match.penaltyScore,
        },
        positiveSignals: strongestSignals(match),
        riskSignals: riskSignals(match),
      });
    }));
    const first = items[0] ?? null;
    const second = items[1] ?? null;
    return RecommendJobResumesOutputSchema.parse({
      jobId,
      recommendedProfileId: first?.profileId ?? null,
      recommendationDelta: first ? Math.max(0, first.score - (second?.score ?? 0)) : 0,
      items,
    });
  }

  async function prepare(jobId: string, input: PrepareRecommendedSubmissionIntentInput): Promise<PrepareRecommendedSubmissionIntentOutput> {
    const parsed = PrepareRecommendedSubmissionIntentInputSchema.parse(input);
    const detail = await career.workspace.getJobDetail(jobId);
    if (!detail) throw new CareerNotFoundError('Job', jobId);
    if (detail.application) throw new CareerConflictError(`Job '${jobId}' already has an Application and cannot prepare a first submission intent`);

    const recommendations = await recommend(jobId);
    const selected = parsed.preferredProfileId
      ? recommendations.items.find((item) => item.profileId === parsed.preferredProfileId) ?? null
      : recommendations.items[0] ?? null;
    if (!selected) throw new CareerConflictError('No active Resume Profile is available for application preparation');
    if (!parsed.preferredProfileId && selected.score < 52) {
      throw new CareerConflictError(`Best Resume Profile '${selected.profileId}' scored ${selected.score}, below the automatic preparation threshold 52`);
    }

    const context = await resume.getProfileContext(selected.profileId);
    if (!context) throw new ResumeNotFoundError('ResumeProfile', selected.profileId);
    const published = await resume.publishRevision({
      profileId: context.profile.id,
      expectedProfileVersion: context.profile.version,
      expectedLibraryVersion: context.library.version,
      note: `Auto-frozen for Job Harness application preparation: ${detail.job.companyName} / ${detail.job.title}`,
    });
    const pdf = await artifacts.materialize({ revisionId: published.revision.id, kind: 'pdf' });

    const listing = parsed.listingId
      ? detail.job.listings.find((candidate) => candidate.id === parsed.listingId) ?? null
      : detail.primaryListing ?? detail.job.listings.find((candidate) => candidate.status === 'active' && candidate.url) ?? null;
    if (!listing) throw new CareerConflictError(`Job '${jobId}' has no listing available for application preparation`);
    const externalTargetUrl = parsed.externalTargetUrl ?? listing.url;
    if (!externalTargetUrl) throw new CareerConflictError(`Listing '${listing.id}' has no executable URL`);

    const intent = await career.submissionIntents.prepare({
      jobId,
      listingId: listing.id,
      channel: parsed.channel ?? listing.sourceKind,
      resumeProfileId: context.profile.id,
      resumeRevisionId: published.revision.id,
      resumeArtifactId: pdf.artifact.id,
      executor: parsed.executor,
      ...(parsed.executorSessionId !== undefined ? { executorSessionId: parsed.executorSessionId } : {}),
      externalTargetUrl,
      idempotencyKey: parsed.idempotencyKey,
      note: parsed.note ?? `Auto-selected ${context.profile.id} (${selected.score}/100) via deterministic resume matching.`,
    });

    const selection = JobResumeMatchSchema.parse({
      ...selected,
      latestRevisionId: published.revision.id,
      latestPdfArtifactId: pdf.artifact.id,
      executable: true,
    });
    return PrepareRecommendedSubmissionIntentOutputSchema.parse({ selection, intent });
  }

  return { recommend, prepare };
}

function sendError(res: Response, error: unknown): void {
  if (writeCommonRestError(res, error)) return;
  if (error instanceof CareerNotFoundError || error instanceof ResumeNotFoundError) {
    writeRestError(res, 404, 'NOT_FOUND', error.message); return;
  }
  if (error instanceof CareerConflictError) {
    writeRestError(res, 409, 'CONFLICT', error.message); return;
  }
  if (error instanceof ResumeArtifactCapabilityError) {
    writeRestError(res, 503, 'RESUME_ARTIFACT_UNAVAILABLE', error.message); return;
  }
  if (error instanceof ResumeArtifactIntegrityError) {
    writeRestError(res, 500, 'RESUME_ARTIFACT_INTEGRITY_FAILED', error.message); return;
  }
  if (error instanceof CareerApplicationError) {
    writeRestError(res, 400, error.code, error.message); return;
  }
  writeInternalRestError(res);
}

function route(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => { void handler(req, res).catch((error) => sendError(res, error)); };
}

export function registerJobResumeApi(app: Express, service: JobResumePreparationService, apiPrefix: string): void {
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.jobResumeRecommendations, route(async (req, res) => {
    res.json(await service.recommend(String(req.params.jobId ?? '').trim()));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.prepareRecommendedSubmissionIntent, route(async (req, res) => {
    const input = PrepareRecommendedSubmissionIntentInputSchema.parse(req.body ?? {});
    res.status(201).json(await service.prepare(String(req.params.jobId ?? '').trim(), input));
  }));
}
