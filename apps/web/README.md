# @job-harness/web

Next.js App Router workspace for Job Harness.

Current slice: **W303 Companies + Analytics complete**.

Implemented foundation:

- persistent Twenty/Plane-inspired sidebar workspace shell;
- stable top-level routes matching the frozen information architecture;
- `zh-CN` default + `en` cookie-based locale catalogs;
- light/dark semantic design tokens with system fallback and local preference;
- reusable WorkspaceHeader, EmptyState, LoadingState, InlineError primitives;
- localized loading/error/not-found surfaces;
- production build as part of the repository quality gate.

W201 now connects `/jobs`, `/inbox`, and `/jobs/:jobId` to live Job Harness data through `@job-harness/client`:

- dense Jobs Table + server-side filters and pagination;
- Inbox as the `discovered` triage projection (no duplicate Inbox lifecycle state);
- URL-addressable right-side Job detail panel plus full detail deep link;
- Listing/Application/Timeline/Observation detail sections;
- shortlist / ignore / close / rediscover actions through Next Server Actions;
- bearer token remains server-only.

W202 also connects `/applications` and `/applications/:applicationId`:

- five-lane active hiring Board (Applied, Screening, Assessment, Interview, Offer);
- Rejected/Withdrawn outcome view without inflating the main funnel;
- native drag/drop plus keyboard-accessible stage select fallback;
- optimistic card movement with rollback on domain rejection;
- Table view using the same Application workspace projection;
- Company/Stage/Campaign/Resume/date/outcome filters applied server-side before pagination;
- URL-addressable Application Side Panel and full detail page sharing one read model;
- optional transition notes, including rejected/withdrawn reasons;
- retry-safe Server Actions: one user intent carries one stable idempotency key and event timestamp.

W301 replaces the Overview placeholder with an operational Dashboard:

- active Campaign selector with an explicit all-campaign aggregate;
- Campaign-scoped KPI and funnel links back into Jobs/Applications;
- deterministic attention rules for stale applications, unapplied shortlists, closed listings, stale discovery, and Resume artifacts;
- seven-day observation/insert/application/stage-change activity;
- recent Discovery runs;
- Resume outcome correlation and Listing-source association views;
- source metrics deliberately do not claim to identify the actual submission channel;
- weekly shortlisting stays unavailable until Job triage gets an auditable event domain.

W302 connects the search-management surfaces:

- `/campaigns`: list plus create/edit of target roles, cities, graduation years, experience, keywords, exclusions, discovery sources, Resume lanes and lifecycle status;
- Campaign create/edit uses the existing upsert application port with a stable form-generated ID, so retries update the same Campaign;
- `/resumes`: Resume Harness/external registry metadata and application-stage usage, optionally scoped by Campaign; raw server artifact paths are not surfaced;
- `/discovery` and `/discovery/:runId`: paginated Discovery history, Campaign/Executor filters, context snapshot, observation count, and affected Jobs;
- all three surfaces continue through the server-only typed REST client; browser HTML never receives the bearer token.

W303 completes the primary product surfaces:

- `/companies` and `/companies/:companyId`: canonical Company table/detail with optional Campaign scope, Job/shortlist/Application/active-pipeline counts, aliases, cities, Listing sources and related Jobs;
- `/analytics`: optional Campaign scope, separate Job-state and Application-stage distributions, Company/Campaign comparisons, Listing-source associations and Resume correlations;
- Analytics keeps Source association distinct from actual submission-channel attribution and keeps Resume metrics explicitly correlational;
- real historical data currently projects 82 Companies, 100 Jobs, 41 Applications and 5 Resume references without exposing the server bearer token.

The next phase is hardening rather than another primary product surface.

Run locally:

```bash
pnpm web
```

The Web process is independent from `@job-harness/server`; the latter owns `/api/v1` and `/mcp`.


Server-side Web configuration:

```bash
JOB_HARNESS_API_URL=http://127.0.0.1:3000/api/v1
JOB_HARNESS_AUTH_TOKEN=... # only when the standalone server requires it
```

Never expose `JOB_HARNESS_AUTH_TOKEN` with a `NEXT_PUBLIC_` prefix.
