import { randomUUID } from 'node:crypto';
import type { JobSearchCampaign, UpsertJobCandidate } from '@job-harness/contracts';

export interface DiscoveryProviderResult {
  readonly candidates: readonly UpsertJobCandidate[];
  readonly queryCount: number;
  readonly failedQueryCount: number;
  readonly diagnostics: Readonly<Record<string, unknown>>;
}

export interface DiscoveryProviderPort {
  readonly id: string;
  readonly sourceKind: JobSearchCampaign['sources'][number];
  plan(campaign: JobSearchCampaign): Readonly<Record<string, unknown>>;
  discover(campaign: JobSearchCampaign): Promise<DiscoveryProviderResult>;
}

export interface DiscoveryWorkerClientPort {
  readonly campaigns: { get(campaignId: string): Promise<JobSearchCampaign | null> };
  readonly discovery: {
    begin(input: { campaignId: string; executor: 'other'; contextSnapshot: Record<string, unknown>; startedAt: string; idempotencyKey: string }): Promise<{ id: string }>;
    complete(input: { runId: string; completedAt: string; candidateCount: number; insertedCount: number; duplicateCount: number; rejectedCount: number }): Promise<unknown>;
  };
  readonly jobs: {
    upsertJobsBatch(input: { jobs: UpsertJobCandidate[] }): Promise<{ items: Array<{ index: number; status: 'inserted' | 'updated' | 'duplicate' | 'rejected'; jobId: string | null; reason: string | null }> }>;
  };
}

export interface DiscoveryWorkerRunResult {
  readonly runId: string;
  readonly providerId: string;
  readonly candidateCount: number;
  readonly insertedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
  readonly queryCount: number;
  readonly failedQueryCount: number;
  readonly changedJobIds: readonly string[];
}

export interface DiscoveryWorkerOptions {
  readonly client: DiscoveryWorkerClientPort;
  readonly provider: DiscoveryProviderPort;
  readonly campaignId: string;
  readonly now?: () => string;
  readonly idFactory?: () => string;
  readonly logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export class DiscoveryWorker {
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(private readonly options: DiscoveryWorkerOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.logger = options.logger ?? console;
  }

  async runOnce(): Promise<DiscoveryWorkerRunResult> {
    const campaign = await this.options.client.campaigns.get(this.options.campaignId);
    if (!campaign) throw new Error(`Discovery campaign '${this.options.campaignId}' was not found`);
    if (campaign.status !== 'active') throw new Error(`Discovery campaign '${campaign.id}' is '${campaign.status}', expected 'active'`);
    if (!campaign.sources.includes(this.options.provider.sourceKind)) {
      throw new Error(`Campaign '${campaign.id}' does not enable source '${this.options.provider.sourceKind}'`);
    }

    const startedAt = this.now();
    const run = await this.options.client.discovery.begin({
      campaignId: campaign.id,
      executor: 'other',
      contextSnapshot: {
        provider: this.options.provider.id,
        sourceKind: this.options.provider.sourceKind,
        worker: '@job-harness/discovery-worker',
        plan: this.options.provider.plan(campaign),
      },
      startedAt,
      idempotencyKey: `discovery:${this.options.provider.id}:${campaign.id}:${this.idFactory()}`,
    });

    let candidateCount = 0;
    let insertedCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;
    let queryCount = 0;
    let failedQueryCount = 0;
    const changedJobIds = new Set<string>();
    try {
      const result = await this.options.provider.discover(campaign);
      candidateCount = result.candidates.length;
      queryCount = result.queryCount;
      failedQueryCount = result.failedQueryCount;
      if (failedQueryCount > 0) this.logger.warn('Discovery provider completed with partial query failures', JSON.stringify({ provider: this.options.provider.id, runId: run.id, failedQueryCount, diagnostics: result.diagnostics }));

      for (const candidateBatch of chunkCandidates(result.candidates)) {
        const batch = candidateBatch.map((candidate) => ({ ...candidate, discoveryRunId: run.id }));
        const upserted = await this.options.client.jobs.upsertJobsBatch({ jobs: batch });
        for (const item of upserted.items) {
          if (item.status === 'inserted') insertedCount += 1;
          else if (item.status === 'rejected') rejectedCount += 1;
          else duplicateCount += 1;
          if ((item.status === 'inserted' || item.status === 'updated') && item.jobId) changedJobIds.add(item.jobId);
        }
      }
      this.logger.info('Discovery provider completed', JSON.stringify({ provider: this.options.provider.id, runId: run.id, candidateCount, insertedCount, duplicateCount, rejectedCount, queryCount, failedQueryCount }));
    } catch (error) {
      this.logger.error('Discovery provider failed', error instanceof Error ? error.message : String(error));
      rejectedCount += 1;
      throw error;
    } finally {
      await this.options.client.discovery.complete({
        runId: run.id,
        completedAt: this.now(),
        candidateCount,
        insertedCount,
        duplicateCount,
        rejectedCount,
      }).catch((error) => this.logger.error('DiscoveryRun completion failed', error instanceof Error ? error.message : String(error)));
    }

    return { runId: run.id, providerId: this.options.provider.id, candidateCount, insertedCount, duplicateCount, rejectedCount, queryCount, failedQueryCount, changedJobIds: [...changedJobIds] };
  }
}


export const DISCOVERY_UPSERT_BODY_BUDGET_BYTES = 64 * 1024;

export function chunkCandidates(
  candidates: readonly UpsertJobCandidate[],
  bodyBudgetBytes = DISCOVERY_UPSERT_BODY_BUDGET_BYTES,
): UpsertJobCandidate[][] {
  const batches: UpsertJobCandidate[][] = [];
  let current: UpsertJobCandidate[] = [];
  let currentBytes = Buffer.byteLength('{"jobs":[]}');
  for (const candidate of candidates) {
    const candidateBytes = Buffer.byteLength(JSON.stringify(candidate)) + (current.length ? 1 : 0);
    if (current.length > 0 && (current.length >= 100 || currentBytes + candidateBytes > bodyBudgetBytes)) {
      batches.push(current);
      current = [];
      currentBytes = Buffer.byteLength('{"jobs":[]}');
    }
    current.push(candidate);
    currentBytes += candidateBytes;
  }
  if (current.length) batches.push(current);
  return batches;
}
