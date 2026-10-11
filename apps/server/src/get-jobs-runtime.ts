export {
  GET_JOBS_RUNTIME_DESCRIPTORS,
  GET_JOBS_RUNTIME_VERSION,
  GET_JOBS_UPSTREAM_COMMIT,
  GET_JOBS_UPSTREAM_REPOSITORY,
  GetJobsRuntimeSiteSchema,
  SITE_BASE_URLS,
  SITE_LABELS,
  type GetJobsRuntimeRow,
  type GetJobsRuntimeSite,
} from './recruitment-runtime/get-jobs/model';

export {
  getJobsRuntimeRowToCandidate,
  normalizeGetJobsListingUrl,
  stableZhilianExternalId,
  type GetJobsRuntimeImportInput,
} from './recruitment-runtime/get-jobs/mapper';

export {
  createGetJobsRuntimeClient,
  type GetJobsRuntimeClient,
  type GetJobsRuntimeClientOptions,
  type GetJobsRuntimeListInput,
} from './recruitment-runtime/get-jobs/client';

export {
  syncGetJobsRuntimeCache,
  type GetJobsCanonicalJobSink,
  type SyncGetJobsRuntimeCacheOptions,
  type SyncGetJobsRuntimeCacheResult,
} from './recruitment-runtime/get-jobs/sync';

export {
  createGetJobsCollectionRuntimeMcpPort,
  deriveCampaignCollectionKeywords,
} from './recruitment-runtime/get-jobs/mcp-port';
