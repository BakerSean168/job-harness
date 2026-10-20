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

The bootstrap can be installed once anywhere convenient, for example under `~/.local/share/job-harness/get-jobs-runtime/start.sh`. Each invocation fetches the current Runtime Channel manifest, verifies the manager SHA-256, and hands control to the current manager. The supported default is manual start. On Windows + WSL, `integrations/get-jobs-runtime/windows/install-get-jobs-runtime-startup.ps1` only adds a user Startup launcher when it is explicitly invoked with `-EnableAutoStart`; running the helper without that flag removes a legacy `JobHarnessGetJobsRuntime.cmd` launcher if present and leaves auto-start disabled. The manager then:

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
JOB_HARNESS_GET_JOBS_RUNTIME_URL=http://127.0.0.1:18851 \
  pnpm --filter @job-harness/server get-jobs:runtime status zhilian

JOB_HARNESS_GET_JOBS_RUNTIME_URL=http://127.0.0.1:18851 \
  pnpm --filter @job-harness/server get-jobs:runtime login zhilian

JOB_HARNESS_GET_JOBS_RUNTIME_URL=http://127.0.0.1:18851 \
  pnpm --filter @job-harness/server get-jobs:runtime start zhilian

JOB_HARNESS_GET_JOBS_RUNTIME_URL=http://127.0.0.1:18851 \
JOB_HARNESS_AUTH_TOKEN=... \
  pnpm --filter @job-harness/server get-jobs:runtime sync zhilian

JOB_HARNESS_GET_JOBS_RUNTIME_URL=http://127.0.0.1:18851 \
  pnpm --filter @job-harness/server get-jobs:runtime stop zhilian
```

`login` and `start` both refuse to call their upstream endpoint unless the runtime marker confirms `collectOnly=true`. `login` only opens the upstream browser login flow; it does not begin collection or delivery. The Job Harness overlay also makes interactive login singleton-per-platform: repeated `/login` requests while a Camoufox login window is already active reuse that in-flight login instead of spawning more browser windows. A completed login or collection run still closes its Camoufox process by design; the next bounded run starts a fresh Camoufox context and restores the saved cookies.

## Job Harness MCP control surface

When the long-running Job Harness server is configured with `JOB_HARNESS_GET_JOBS_RUNTIME_URL`, it exposes four coarse tools instead of raw upstream endpoints:

```text
recruitment_collection_runtime_status
recruitment_collection_runtime_start
recruitment_collection_runtime_stop
recruitment_collection_runtime_sync
```

`start` requires an active Campaign with `automation.collection.enabled=true`; the caller chooses only a site and optionally one Campaign-approved city. Job Harness derives the concise search keywords from Campaign target roles, resolves the upstream city code, verifies the Runtime's `collectOnly=true` marker, and refuses a login-required Runtime. `sync` imports upstream cached rows through canonical Job Harness upsert/dedupe; upstream `delivered` remains metadata and never creates Application truth. The login endpoint is intentionally not exposed as an autonomous MCP tool because QR/CAPTCHA/account verification remains a human gate.

### Zhilian native search filters (collect-only)

The Zhilian site exposes **single-select** native experience bands, so Job Harness
derives a finite list of searches from the active Campaign's experience policy:
`经验不限 / 无经验 / 应届生 → we=-1`,
`1年以内 / 1年以下 → we=0001`, and `1-3年 → we=0103`.
These are the values verified in the live Zhilian UI on 2026-10-20.
The worker always adds `et=2` (**全职**) and refuses unsupported senior bands.
It executes the selected bands separately for each Campaign keyword and the
explicitly selected city; no applicant-facing action is permitted.

Job Harness configures `PUT /api/zhilian/collection-filters` and verifies
`GET /api/zhilian/collection-filters` **before** configuring keywords/city or
starting a collection. Both old runtimes that lack the endpoint and new
runtimes without a filter configuration fail closed. The current Zhilian
search page redirects from `/sou/` to `/jobs/` after a keyword is entered,
**dropping the original experience and full-time parameters**. The worker
checks that the redirect is same-origin and retains the exact requested
keyword and city, reapplies `we` and `et` on `/jobs/`, then validates both
the resulting URL and the **visible selected search filter labels**. Any
mismatch stops that query before a candidate can be collected. The site's
`we=-1` option can still display explicit 3+ year listings; these senior
cards are rejected before opening their details.
The prior maximum cards-per-keyword budget is split across its allowed
experience bands (default 20 cards for each of three bands, rather than
60 unfiltered cards). Later strong listing-identity deduplication and
job-page verification remain mandatory.

The website's company-size filter is intentionally not set: the Campaign's
0–499 employee preference is **ranking**, not a hard exclusion. Site-side
filters reduce browsing but do not replace JD-based role, experience,
company legal name, outsourcing and application-status checks.
Searches for different Campaign cities are initiated **sequentially**, not
in parallel against one shared authenticated browser runtime.

## Promotion gate

The first live canary must be one site only and collection-only. Recommended order:

1. Zhilian;
2. Liepin;
3. 51job.

For the first canary, success means: login works, upstream searches/jobs are collected, Job Harness imports canonical listings, no recruiter-facing delivery occurs, and stop/restart is recoverable.

Only after that proof should a separate policy-gated delivery mode be designed around exact Resume binding and durable external success evidence.
