# vvvsrx/get_jobs External Recruitment Runtime

Status: integration candidate; not promoted to production.

This integration deliberately reuses the upstream `vvvsrx/get_jobs` platform workers instead of translating their selectors and browser state machines into Job Harness adapters.

## Ownership boundary

Upstream runtime owns:

- Camoufox / Playwright browser execution;
- Zhilian, Liepin and 51job page/search state machines;
- upstream cookies and short-lived runtime cache;
- platform-specific pacing, paging and stop conditions.

Job Harness owns:

- Campaign policy;
- canonical Job / Listing / Observation state;
- Resume truth;
- SubmissionIntent / Application truth;
- external-effect authorization and evidence.

The upstream SQLite data is never treated as Job Harness truth.

## Materialize the pinned runtime

```bash
pnpm upstream:sync vvvsrx-get-jobs
pnpm upstream:test vvvsrx-get-jobs
```

The full pinned source tree is created under:

```text
.tmp/upstreams/vvvsrx-get-jobs/<commit>/candidate
```

No third-party runtime source is copied into Job Harness domain packages.

## Thin integration overlay

The candidate applies only integration-level patches:

- `/api/job-harness-runtime` reports whether the process is really in Job Harness collect-only mode;
- `JOB_HARNESS_GET_JOBS_COLLECT_ONLY=1` suppresses delivery/contact actions while preserving upstream search and collection logic;
- list response schemas expose fields already stored by upstream, including job URL, city/area, experience/education and company metadata.

The overlay does not replace the upstream locators or page state machines.

## Read-only Job Harness adapter

`apps/server/src/get-jobs-runtime.ts` provides:

- immutable upstream provenance descriptors;
- health/login normalization;
- collect-only marker verification;
- explicit collection start/stop;
- cached-job listing;
- canonical Job/Listing normalization;
- bounded pagination into `jobs.upsertJobsBatch`.

An upstream row with `delivered=1` is imported only as metadata. It does not create a Job Harness Application or ApplicationSubmission.

Operator CLI:

```bash
JOB_HARNESS_GET_JOBS_RUNTIME_URL=http://127.0.0.1:8000 \
  pnpm --filter @job-harness/server get-jobs:runtime status zhilian

JOB_HARNESS_GET_JOBS_RUNTIME_URL=http://127.0.0.1:8000 \
  pnpm --filter @job-harness/server get-jobs:runtime start zhilian

JOB_HARNESS_GET_JOBS_RUNTIME_URL=http://127.0.0.1:8000 \
JOB_HARNESS_AUTH_TOKEN=... \
  pnpm --filter @job-harness/server get-jobs:runtime sync zhilian

JOB_HARNESS_GET_JOBS_RUNTIME_URL=http://127.0.0.1:8000 \
  pnpm --filter @job-harness/server get-jobs:runtime stop zhilian
```

`start` refuses to call the upstream start endpoint unless the runtime marker confirms `collectOnly=true`.

## Promotion gate

The first live canary must be one site only and collection-only. Recommended order:

1. Zhilian;
2. Liepin;
3. 51job.

For the first canary, success means: login works, upstream searches/jobs are collected, Job Harness imports canonical listings, no recruiter-facing delivery occurs, and stop/restart is recoverable.

Only after that proof should a separate policy-gated delivery mode be designed around exact Resume binding and durable external success evidence.
