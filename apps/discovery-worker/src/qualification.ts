import type {
  Job,
  JobDetail,
  ListSubmissionIntentsInput,
  ListSubmissionIntentsOutput,
  PrepareRecommendedSubmissionIntentInput,
  PrepareRecommendedSubmissionIntentOutput,
  RecommendJobResumesOutput,
  SetJobStateInput,
  DiscoveryRunDetail,
  JobSearchCampaign,
} from '@job-harness/contracts';
import { matchesCampaignEducation, matchesCampaignExperience, titleLooksLikeEntryLevelDeveloper } from './qualification-policy';

export interface DiscoveryQualificationClientPort {
  readonly campaigns: { get(campaignId: string): Promise<JobSearchCampaign | null> };
  readonly workspace: {
    getDiscoveryRunDetail(runId: string): Promise<DiscoveryRunDetail | null>;
    getJobDetail(jobId: string): Promise<JobDetail | null>;
  };
  readonly jobs: {
    recommendResumes(jobId: string): Promise<RecommendJobResumesOutput>;
    setJobState(input: SetJobStateInput): Promise<Job>;
    prepareRecommendedSubmission(jobId: string, input: PrepareRecommendedSubmissionIntentInput): Promise<PrepareRecommendedSubmissionIntentOutput>;
  };
  readonly submissionIntents: {
    list(input?: ListSubmissionIntentsInput): Promise<ListSubmissionIntentsOutput>;
  };
}

export interface DiscoveryQualificationPolicy {
  readonly minScore?: number;
  readonly titleOnlyMinTitleScore?: number;
  readonly maxJobs?: number;
  readonly autoPrepare?: boolean;
  readonly dryRun?: boolean;
}

export interface DiscoveryQualificationResult {
  readonly runId: string;
  readonly evaluated: number;
  readonly qualified: number;
  readonly stateChanges: number;
  readonly preparable: number;
  readonly prepared: number;
  readonly existingIntents: number;
  readonly skippedApplication: number;
  readonly skippedTerminalState: number;
  readonly skippedLowMatch: number;
  readonly skippedNonExecutable: number;
  readonly skippedChannel: number;
  readonly skippedTitleOnlyPrepare: number;
  readonly truncated: number;
  readonly dryRun: boolean;
  readonly qualifiedSamples: readonly { jobId: string; title: string; sourceKind: string | null; experience: string | null; profileId: string; score: number; titleOnly: boolean }[];
  readonly failures: readonly { jobId: string; error: string }[];
}

const NON_FORMAL_SOURCES = new Set(['boss', 'email', 'manual']);

export class DiscoveryQualificationProcessor {
  private readonly minScore: number;
  private readonly titleOnlyMinTitleScore: number;
  private readonly maxJobs: number;
  private readonly autoPrepare: boolean;
  private readonly dryRun: boolean;

  constructor(
    private readonly client: DiscoveryQualificationClientPort,
    policy: DiscoveryQualificationPolicy = {},
  ) {
    this.minScore = clampInt(policy.minScore ?? 58, 1, 100);
    this.titleOnlyMinTitleScore = clampInt(policy.titleOnlyMinTitleScore ?? 28, 1, 100);
    this.maxJobs = clampInt(policy.maxJobs ?? 250, 1, 1000);
    this.autoPrepare = policy.autoPrepare ?? true;
    this.dryRun = policy.dryRun ?? false;
  }

  async run(runId: string): Promise<DiscoveryQualificationResult> {
    const discovery = await this.client.workspace.getDiscoveryRunDetail(runId);
    if (!discovery) throw new Error(`DiscoveryRun '${runId}' was not found`);
    const campaignId = discovery.campaign?.id ?? discovery.run.campaignId;
    const campaign = campaignId ? await this.client.campaigns.get(campaignId) : null;
    if (!campaign) throw new Error(`DiscoveryRun '${runId}' has no resolvable Campaign`);
    const jobs = discovery.affectedJobs.slice(0, this.maxJobs);
    let evaluated = 0;
    let qualified = 0;
    let stateChanges = 0;
    let preparable = 0;
    let prepared = 0;
    let existingIntents = 0;
    let skippedApplication = 0;
    let skippedTerminalState = 0;
    let skippedLowMatch = 0;
    let skippedNonExecutable = 0;
    let skippedChannel = 0;
    let skippedTitleOnlyPrepare = 0;
    const failures: Array<{ jobId: string; error: string }> = [];
    const qualifiedSamples: Array<{ jobId: string; title: string; sourceKind: string | null; experience: string | null; profileId: string; score: number; titleOnly: boolean }> = [];

    for (const item of jobs) {
      if (item.application) { skippedApplication += 1; continue; }
      if (!['discovered', 'shortlisted'].includes(item.state)) { skippedTerminalState += 1; continue; }
      try {
        const [jobDetail, recommendations] = await Promise.all([
          this.client.workspace.getJobDetail(item.jobId),
          this.client.jobs.recommendResumes(item.jobId),
        ]);
        if (!jobDetail) throw new Error(`Job '${item.jobId}' disappeared during qualification`);
        evaluated += 1;
        const top = recommendations.items[0] ?? null;
        if (!top || !isQualified(jobDetail, top, campaign, this.minScore, this.titleOnlyMinTitleScore)) {
          skippedLowMatch += 1;
          continue;
        }
        qualified += 1;
        if (qualifiedSamples.length < 20) {
          const listing = jobDetail.primaryListing ?? item.primaryListing;
          qualifiedSamples.push({
            jobId: item.jobId, title: jobDetail.job.title, sourceKind: listing?.sourceKind ?? null,
            experience: typeof listing?.metadataSnapshot?.experience === 'string' ? listing.metadataSnapshot.experience : null,
            profileId: top.profileId, score: top.score, titleOnly: !(jobDetail.job.description?.trim()),
          });
        }
        if (item.state === 'discovered' && !this.dryRun) {
          await this.client.jobs.setJobState({
            jobId: item.jobId,
            state: 'shortlisted',
            idempotencyKey: `qualification:${item.jobId}:shortlist`,
          });
          stateChanges += 1;
        }

        if (!top.executable) { skippedNonExecutable += 1; continue; }
        if (!(jobDetail.job.description?.trim())) { skippedTitleOnlyPrepare += 1; continue; }
        const listing = jobDetail.primaryListing ?? item.primaryListing;
        if (!isFormalHttpListing(listing)) { skippedChannel += 1; continue; }
        const intents = await this.client.submissionIntents.list({ jobId: item.jobId, limit: 1, offset: 0 });
        if (intents.total > 0) { existingIntents += 1; continue; }
        preparable += 1;
        if (!this.autoPrepare || this.dryRun) continue;
        await this.client.jobs.prepareRecommendedSubmission(item.jobId, {
          listingId: listing.id,
          preferredProfileId: top.profileId,
          executor: 'browser-extension',
          idempotencyKey: `qualification:${item.jobId}:${top.profileId}:prepare`,
          note: `Auto-prepared after DiscoveryRun ${runId}; deterministic match ${top.score}/100 (${top.decision}).`,
        });
        prepared += 1;
      } catch (error) {
        failures.push({ jobId: item.jobId, error: sanitizeError(error) });
      }
    }

    return {
      runId,
      evaluated,
      qualified,
      stateChanges,
      preparable,
      prepared,
      existingIntents,
      skippedApplication,
      skippedTerminalState,
      skippedLowMatch,
      skippedNonExecutable,
      skippedChannel,
      skippedTitleOnlyPrepare,
      truncated: Math.max(0, discovery.affectedJobs.length - jobs.length),
      dryRun: this.dryRun,
      qualifiedSamples,
      failures: failures.slice(0, 50),
    };
  }
}

function isQualified(
  detail: JobDetail,
  top: RecommendJobResumesOutput['items'][number],
  campaign: JobSearchCampaign,
  minScore: number,
  titleOnlyMinTitleScore: number,
): boolean {
  if (!matchesCampaignExperience(detail.primaryListing?.metadataSnapshot?.experience, campaign.experience)) return false;
  if (!matchesCampaignEducation(detail.primaryListing?.metadataSnapshot?.education, campaign.education)) return false;
  const description = detail.job.description?.trim() ?? '';
  if (description) return top.score >= minScore;
  if (top.riskSignals.length > 0 || !titleLooksLikeEntryLevelDeveloper(detail.job.title)) return false;
  return top.breakdown.titleScore >= titleOnlyMinTitleScore;
}

function isFormalHttpListing(listing: JobDetail['primaryListing']): listing is NonNullable<JobDetail['primaryListing']> {
  if (!listing?.url || NON_FORMAL_SOURCES.has(listing.sourceKind)) return false;
  try {
    const url = new URL(listing.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (listing.sourceKind === 'liepin' && !/^\/job\/\d+\.shtml$/i.test(url.pathname)) return false;
    return true;
  } catch { return false; }
}

function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}
function clampInt(value: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

