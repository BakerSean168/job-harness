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

## Self-updating WSL runtime

The runtime is intended to run inside the user's WSL/WSLg environment so the upstream Camoufox windows are isolated from the normal Windows browser while still being visible for login when needed. The Job Harness Runtime Channel publishes both a tiny stable bootstrap and a content-addressed manager script plus the exact integration overlays.

The bootstrap can be installed once anywhere convenient, for example under `~/.local/share/job-harness/get-jobs-runtime/start.sh`. Each invocation fetches the current Runtime Channel manifest, verifies the manager SHA-256, and hands control to the current manager. The manager then:

- clones the exact pinned upstream commit rather than relying on the stale local Job Harness checkout;
- downloads and hash-verifies only the Job Harness integration overlays;
- runs `git apply --check` before applying them;
- verifies the collect-only markers and Python syntax;
- keeps versioned source/venv directories and a persistent runtime DB outside the checkout;
- uses `uv` when available;
- exposes the upstream FastAPI service only on `127.0.0.1:18851` by default;
- starts it with `JOB_HARNESS_GET_JOBS_COLLECT_ONLY=1` and refuses readiness unless `/api/job-harness-runtime` confirms that mode.

Typical bootstrap commands are:

```bash
./start.sh sync
./start.sh provision
./start.sh start
./start.sh status
./start.sh stop
```

`sync` and `provision` do not visit recruiting websites. `start` launches only the local collect-only runtime service; an explicit per-site collection start is still required before the upstream browser begins a search.

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
