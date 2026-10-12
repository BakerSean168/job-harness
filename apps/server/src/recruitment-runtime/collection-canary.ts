import type {
  BeginDiscoveryInput,
  CompleteDiscoveryInput,
  DiscoveryRun,
} from '@job-harness/contracts';
import type { RecruitmentRuntimeHealth } from '@job-harness/recruitment-runtime-contracts';
import type { GetJobsRuntimeSite } from './get-jobs/model';

export interface RecruitmentCollectionCanaryRuntimeStatus {
  readonly descriptor: {
    readonly runtimeId: string;
    readonly runtimeVersion: string;
  };
  readonly health: RecruitmentRuntimeHealth;
  readonly integration: 'job-harness';
  readonly collectOnly: true;
  readonly mode: 'collect-only';
}

export interface RecruitmentCollectionCanaryRuntimeAction {
  readonly site: GetJobsRuntimeSite;
  readonly success: boolean;
  readonly message: string;
  readonly status: string | null;
  readonly reused: boolean;
  readonly campaignId: string | null;
  readonly city: string | null;
  readonly keywords: readonly string[];
}

export interface RecruitmentCollectionCanarySyncResult {
  readonly site: GetJobsRuntimeSite;
  readonly upstreamTotal: number;
  readonly scanned: number;
  readonly normalized: number;
  readonly normalizationRejected: number;
  readonly inserted: number;
  readonly updated: number;
  readonly duplicate: number;
  readonly persistenceRejected: number;
}

export interface RecruitmentCollectionCanaryPort {
  now(): Date;
  sleep(ms: number): Promise<void>;
  getApplicationCount(): Promise<number>;
  beginDiscovery(input: BeginDiscoveryInput): Promise<DiscoveryRun>;
  completeDiscovery(input: CompleteDiscoveryInput): Promise<DiscoveryRun>;
  runtimeStatus(site: GetJobsRuntimeSite): Promise<RecruitmentCollectionCanaryRuntimeStatus>;
  runtimeStart(input: {
    site: GetJobsRuntimeSite;
    campaignId: string;
    city?: string;
  }): Promise<RecruitmentCollectionCanaryRuntimeAction>;
  runtimeStop(site: GetJobsRuntimeSite): Promise<RecruitmentCollectionCanaryRuntimeAction>;
  runtimeSync(input: {
    site: GetJobsRuntimeSite;
    discoveryRunId: string;
    pageSize: number;
    maxPages: number;
  }): Promise<RecruitmentCollectionCanarySyncResult>;
}

export interface RunRecruitmentCollectionCanaryInput {
  readonly site: GetJobsRuntimeSite;
  readonly campaignId: string;
  readonly city?: string;
  readonly runForMs?: number;
  readonly pollEveryMs?: number;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly idempotencyKey?: string;
}

export interface RecruitmentCollectionCanaryResult {
  readonly accepted: boolean;
  readonly run: DiscoveryRun;
  readonly baselineApplications: number;
  readonly finalApplications: number;
  readonly observedRunning: boolean;
  readonly runtimeBefore: RecruitmentCollectionCanaryRuntimeStatus;
  readonly runtimeAfter: RecruitmentCollectionCanaryRuntimeStatus | null;
  readonly start: RecruitmentCollectionCanaryRuntimeAction | null;
  readonly stop: RecruitmentCollectionCanaryRuntimeAction | null;
  readonly sync: RecruitmentCollectionCanarySyncResult | null;
  readonly failureCode: string | null;
  readonly failureReason: string | null;
}

function boundedInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const candidate = value ?? fallback;
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(candidate)));
}

function boundedReason(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/\s+/g, ' ').trim().slice(0, 1000) || 'Unknown collection canary error';
}

function deriveIdempotencyKey(site: GetJobsRuntimeSite, now: Date): string {
  return `recruitment-collection-canary:${site}:${now.toISOString()}`;
}

function completionCounts(sync: RecruitmentCollectionCanarySyncResult | null): Pick<
  CompleteDiscoveryInput,
  'candidateCount' | 'insertedCount' | 'duplicateCount' | 'rejectedCount'
> {
  if (!sync) {
    return { candidateCount: 0, insertedCount: 0, duplicateCount: 0, rejectedCount: 0 };
  }
  return {
    candidateCount: sync.scanned,
    insertedCount: sync.inserted,
    duplicateCount: sync.updated + sync.duplicate,
    rejectedCount: sync.normalizationRejected + sync.persistenceRejected,
  };
}

function acceptanceFailure(
  sync: RecruitmentCollectionCanarySyncResult,
  baselineApplications: number,
  finalApplications: number,
): { code: string; reason: string } | null {
  if (finalApplications !== baselineApplications) {
    return {
      code: 'application_count_changed',
      reason: `Collect-only canary changed global Application count from ${baselineApplications} to ${finalApplications}`,
    };
  }
  if (sync.persistenceRejected > 0) {
    return {
      code: 'canonical_sync_rejected',
      reason: `Canonical sync rejected ${sync.persistenceRejected} normalized candidate(s); inspect identity/persistence evidence before promotion`,
    };
  }
  if (sync.scanned === 0 || sync.normalized === 0) {
    return {
      code: 'no_normalized_candidates',
      reason: `Collect-only canary produced no usable canonical candidates (scanned=${sync.scanned}, normalized=${sync.normalized})`,
    };
  }
  return null;
}

export async function runRecruitmentCollectionCanary(
  port: RecruitmentCollectionCanaryPort,
  input: RunRecruitmentCollectionCanaryInput,
): Promise<RecruitmentCollectionCanaryResult> {
  const runForMs = boundedInt(input.runForMs, 60_000, 5_000, 10 * 60_000);
  const pollEveryMs = boundedInt(input.pollEveryMs, 2_000, 500, 15_000);
  const pageSize = boundedInt(input.pageSize, 100, 1, 1000);
  const maxPages = boundedInt(input.maxPages, 20, 1, 100);
  const runtimeBefore = await port.runtimeStatus(input.site);

  if (!runtimeBefore.collectOnly || runtimeBefore.mode !== 'collect-only') {
    throw new Error(`${input.site} runtime is not collect-only`);
  }
  if (runtimeBefore.health.state !== 'ready') {
    throw new Error(`${input.site} runtime is not ready: ${runtimeBefore.health.state}${runtimeBefore.health.detail ? ` (${runtimeBefore.health.detail})` : ''}`);
  }
  if (runtimeBefore.health.browserConnected) {
    throw new Error(`${input.site} runtime already has a collection task running; refusing to attach a canary to shared work`);
  }

  const baselineApplications = await port.getApplicationCount();
  const startedAt = port.now();
  const run = await port.beginDiscovery({
    campaignId: input.campaignId,
    executor: 'other',
    contextSnapshot: {
      kind: 'recruitment-collection-canary-v1',
      site: input.site,
      city: input.city ?? null,
      collectOnly: true,
      runtimeId: runtimeBefore.descriptor.runtimeId,
      runtimeVersion: runtimeBefore.descriptor.runtimeVersion,
      boundedRunForMs: runForMs,
      baselineApplications,
    },
    startedAt: startedAt.toISOString(),
    idempotencyKey: input.idempotencyKey ?? deriveIdempotencyKey(input.site, startedAt),
  });

  let start: RecruitmentCollectionCanaryRuntimeAction | null = null;
  let stop: RecruitmentCollectionCanaryRuntimeAction | null = null;
  let sync: RecruitmentCollectionCanarySyncResult | null = null;
  let runtimeAfter: RecruitmentCollectionCanaryRuntimeStatus | null = null;
  let finalApplications = baselineApplications;
  let observedRunning = false;
  let failureCode: string | null = null;
  let failureReason: string | null = null;
  let ownsRuntimeTask = false;

  try {
    start = await port.runtimeStart({
      site: input.site,
      campaignId: input.campaignId,
      ...(input.city ? { city: input.city } : {}),
    });
    if (!start.success) {
      failureCode = 'runtime_start_failed';
      failureReason = start.message;
    } else if (start.reused) {
      failureCode = 'runtime_task_reused';
      failureReason = 'Runtime start reused an existing collection task; canary refuses to stop or claim evidence from shared work';
    } else {
      ownsRuntimeTask = true;
    }

    if (!failureCode) {
      const deadline = port.now().getTime() + runForMs;
      while (port.now().getTime() < deadline) {
        await port.sleep(Math.min(pollEveryMs, Math.max(1, deadline - port.now().getTime())));
        const current = await port.runtimeStatus(input.site);
        if (current.health.state !== 'ready') {
          failureCode = 'runtime_left_ready_state';
          failureReason = `Runtime entered ${current.health.state}${current.health.detail ? `: ${current.health.detail}` : ''}`;
          break;
        }
        if (current.health.browserConnected) {
          observedRunning = true;
        } else if (observedRunning) {
          break;
        }
      }
    }

    if (ownsRuntimeTask) {
      stop = await port.runtimeStop(input.site);
      if (!stop.success && !failureCode) {
        failureCode = 'runtime_stop_failed';
        failureReason = stop.message;
      }
      ownsRuntimeTask = false;
    }

    if (!failureCode) {
      sync = await port.runtimeSync({
        site: input.site,
        discoveryRunId: run.id,
        pageSize,
        maxPages,
      });
      finalApplications = await port.getApplicationCount();
      const acceptance = acceptanceFailure(sync, baselineApplications, finalApplications);
      if (acceptance) {
        failureCode = acceptance.code;
        failureReason = acceptance.reason;
      }
    }
    runtimeAfter = await port.runtimeStatus(input.site).catch(() => null);
  } catch (error) {
    failureCode = failureCode ?? 'canary_execution_error';
    failureReason = failureReason ?? boundedReason(error);
    if (ownsRuntimeTask) {
      stop = await port.runtimeStop(input.site).catch(() => null);
      ownsRuntimeTask = false;
    }
    finalApplications = await port.getApplicationCount().catch(() => baselineApplications);
    runtimeAfter = await port.runtimeStatus(input.site).catch(() => null);
  }

  const completedAt = port.now().toISOString();
  const counts = completionCounts(sync);
  const completed = await port.completeDiscovery({
    runId: run.id,
    completedAt,
    status: failureCode ? 'failed' : 'succeeded',
    failureCode,
    failureReason,
    ...counts,
  });

  return {
    accepted: !failureCode,
    run: completed,
    baselineApplications,
    finalApplications,
    observedRunning,
    runtimeBefore,
    runtimeAfter,
    start,
    stop,
    sync,
    failureCode,
    failureReason,
  };
}
