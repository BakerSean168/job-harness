import type { UpsertJobsBatchInput, UpsertJobsBatchOutput } from '@job-harness/contracts';
import { GetJobsRuntimeSiteSchema, type GetJobsRuntimeSite } from './model';
import type { GetJobsRuntimeClient } from './client';
import { getJobsRuntimeRowToCandidate } from './mapper';

export interface GetJobsCanonicalJobSink {
  upsertJobsBatch(input: UpsertJobsBatchInput): Promise<UpsertJobsBatchOutput>;
}

export interface SyncGetJobsRuntimeCacheOptions {
  readonly site: GetJobsRuntimeSite;
  readonly discoveryRunId?: string | null;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly status?: 'pending' | 'delivered';
  readonly observedAt?: string;
}

export interface SyncGetJobsRuntimeCacheResult {
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

export async function syncGetJobsRuntimeCache(
  runtime: GetJobsRuntimeClient,
  jobs: GetJobsCanonicalJobSink,
  options: SyncGetJobsRuntimeCacheOptions,
): Promise<SyncGetJobsRuntimeCacheResult> {
  const site = GetJobsRuntimeSiteSchema.parse(options.site);
  const pageSize = Math.max(1, Math.min(1000, Math.trunc(options.pageSize ?? 100)));
  const maxPages = Math.max(1, Math.min(100, Math.trunc(options.maxPages ?? 20)));
  const observedAt = options.observedAt ?? new Date().toISOString();
  let upstreamTotal = 0;
  let scanned = 0;
  let normalized = 0;
  let normalizationRejected = 0;
  let inserted = 0;
  let updated = 0;
  let duplicate = 0;
  let persistenceRejected = 0;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await runtime.list(site, {
      limit: pageSize,
      offset: pageIndex * pageSize,
      ...(options.status ? { status: options.status } : {}),
    });
    upstreamTotal = page.total;
    scanned += page.items.length;
    const candidates = page.items.flatMap((row) => {
      const candidate = getJobsRuntimeRowToCandidate(site, row as unknown as Record<string, unknown>, {
        observedAt,
        discoveryRunId: options.discoveryRunId ?? null,
      });
      if (!candidate) {
        normalizationRejected += 1;
        return [];
      }
      return [candidate];
    });
    normalized += candidates.length;

    for (let index = 0; index < candidates.length; index += 100) {
      const batch = candidates.slice(index, index + 100);
      if (!batch.length) continue;
      const result = await jobs.upsertJobsBatch({ jobs: batch });
      for (const item of result.items) {
        if (item.status === 'inserted') inserted += 1;
        else if (item.status === 'updated') updated += 1;
        else if (item.status === 'duplicate') duplicate += 1;
        else persistenceRejected += 1;
      }
    }

    if (page.items.length < pageSize || scanned >= page.total) break;
  }

  return {
    site,
    upstreamTotal,
    scanned,
    normalized,
    normalizationRejected,
    inserted,
    updated,
    duplicate,
    persistenceRejected,
  };
}
