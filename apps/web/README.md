# @job-harness/web

Next.js App Router workspace for Job Harness.

Current slice: **W405 Accessibility / Keyboard hardening complete**.

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

W402 adds Settings → Data & backup: logical versioned Career JSON export and a WAL-safe standalone SQLite backup. Browser downloads proxy through Next so the REST bearer remains server-only. JSON is currently an export/audit format; full restore uses the SQLite backup and must be performed with the service stopped. See `docs/data/export-backup.md`.

Run locally:

```bash
pnpm web
```

The Web process is independent from `@job-harness/server`; the latter owns `/api/v1` and `/mcp`.


Server-side Web configuration:

```bash
JOB_HARNESS_API_URL=http://127.0.0.1:3000/api/v1
JOB_HARNESS_AUTH_TOKEN=... # only when the standalone server requires it

# Optional single-user browser login
JOB_HARNESS_WEB_PASSWORD=...
JOB_HARNESS_WEB_SESSION_SECRET=... # >=32 random characters
JOB_HARNESS_WEB_SESSION_TTL_HOURS=168
JOB_HARNESS_WEB_COOKIE_SECURE=true
```

Never expose `JOB_HARNESS_AUTH_TOKEN`, the Web password, or the session secret with a `NEXT_PUBLIC_` prefix. When Web auth is enabled, `/login` uses a signed HttpOnly/SameSite=Strict session cookie and the workspace fails closed if the signing configuration is invalid. See `docs/security/self-hosted-web-auth.md`.

W403 adds persistent Saved Views to Jobs and Applications:

- definitions store only canonical workspace filter/view fields;
- pagination offsets and selected side-panel IDs are never persisted;
- create, overwrite, apply and delete all go through the server-only typed REST client and CareerSavedViewsPort;
- names are case-insensitively unique per workspace;
- Saved Views live in SQLite schema v3, not browser `localStorage`;
- logical Career JSON export excludes UI preferences, while the physical SQLite backup preserves them.

See `docs/product/saved-views.md`.

W404 keeps offset pagination intentionally while hardening the read path:

- Jobs and Applications page projections batch related Application/Resume/Campaign/Listing/Timeline data instead of issuing row-by-row reads;
- the shared contract continues to cap page size at 200;
- SQLite schema v4 adds indexes for the actual Jobs/Application/Discovery ordering and filter paths;
- CI verifies representative query plans instead of relying on unstable wall-clock thresholds;
- cursor pagination remains deferred until real production traces show deep indexed offsets are a material bottleneck.

See `docs/performance/pagination.md`.

W405 establishes the keyboard/accessibility baseline:

- skip-to-content and named main/navigation landmarks;
- visible `:focus-visible` treatment and reduced-motion support;
- shared modal side-panel primitive for Job/Application/Company/Discovery with automatic focus, Tab trapping, Escape close, and focus restoration;
- accessible names and explicit column-header scope for primary data tables;
- Application stage changes retain the non-drag keyboard control.

See `docs/accessibility/web.md`.

W406 packages the standalone product for self-hosting:

- one Docker image is reused by the REST/MCP Server and Next.js Web containers;
- Server stays on the private Compose network and publishes no host port;
- Web binds to `127.0.0.1` by default and keeps the API bearer server-side;
- `/data/job-harness.db` is a persistent host bind mount;
- both containers have health checks, Web waits for Server health, and the runtime runs as the non-root `node` user with `no-new-privileges`;
- CI performs a fresh image build plus Compose runtime smoke including a Server restart to verify schema-v4 reopen and SQLite persistence.

See `docs/deployment/self-hosted.md`.

W407 completes the standalone Web V1 hardening baseline:

- desktop keeps the persistent sidebar; tablet keeps the icon rail; phone widths use a fixed horizontally scrollable bottom navigation;
- workspace headers and Settings controls stack on phone widths without page-level horizontal overflow;
- dense tables remain horizontally scrollable inside their own containers instead of mutating the information model;
- the Applications board uses viewport-sized snap lanes on phones;
- record Side Panels become full-viewport modal dialogs on phones;
- Playwright runs the production build against an isolated SQLite/API fixture and covers login, Job details, a real Screening → Assessment transition, Settings JSON export/logout, and a 390×844 responsive regression.

See `docs/testing/browser-e2e.md`.
