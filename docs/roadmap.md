# Roadmap

## Current checkpoint — Standalone alpha

Completed:

- [x] Independent public `job-harness` repository bootstrap
- [x] CH-0001 — canonical Career domain vocabulary and lifecycle
- [x] CH-0002 — transport-neutral application ports and runtime-validated contracts
- [x] CH-0003 — stable MCP tool contract for job-search memory workflows
- [x] SQLite persistence for Company, Job, JobObservation, Application, ApplicationEvent, Campaign, DiscoveryRun, ResumeProfileRef
- [x] Durable idempotency receipts for Agent retry safety
- [x] Application service with transaction + lifecycle enforcement
- [x] Real SQLite vertical-slice tests for dedupe, timeline, Resume Registry, and campaign pipeline stats
- [x] Transport-neutral MCP runtime backed only by application ports
- [x] Standalone MCP Streamable HTTP server using the official SDK
- [x] Bearer-token guard for non-loopback deployment
- [x] Idempotent `job-apply-copilot` history/pool migration adapter
- [x] Real migration verification against the existing historical dataset
- [x] Core-boundary guard preventing `@memoflow/*` dependencies
- [x] GitHub CI baseline

Deferred intentionally:

- [ ] MemoFlow runtime integration
- [ ] dynamic plugin loader / marketplace
- [ ] built-in AI provider
- [ ] built-in general web search
- [ ] external job-application submission automation

## Product benchmark / IA checkpoint

Completed before Web UI implementation:

- [x] Open-source product benchmark covering opportunity-centric trackers, CareerPulse/JobSync, Twenty/Plane, and Reactive Resume
- [x] Web V1 domain map and ownership boundary
- [x] Information architecture and route map
- [x] Dashboard, Jobs workspace, and Application pipeline specifications
- [x] Design-language and i18n baseline
- [x] Execution-ready Web V1 plan

## Next standalone slice

1. [x] **JH-W001:** `JobListing` domain/persistence migration with conservative Opportunity dedupe.
2. [x] **JH-W002:** aggregate UI read models behind `CareerWorkspaceReadPort` (`JobListItem`, `JobDetail`, Application Board/Detail, Dashboard, Discovery, Resume usage).
3. [x] **JH-W101:** versioned REST v1 facade backed by the same application/workspace ports, with bearer auth and HTTP contract tests.
4. [x] **JH-W102:** Next.js Web shell with stable IA routes, `zh-CN`/`en`, semantic light/dark theme tokens, localized state primitives, and production build gate.
5. [x] **JH-W201:** Inbox + Jobs Table + Job Side Panel with typed REST client and server-only triage mutations.
6. [x] **JH-W202:** Applications Board/Table + Application Side Panel/detail, server-validated drag/keyboard stage transitions, outcome filtering, and retry-safe `stage_changed` writes.
7. [x] **JH-W301:** Operational Dashboard with scoped KPI/funnel navigation, deterministic attention rules, seven-day activity, recent discovery, Resume correlation, and Listing-source association.
8. [x] **JH-W302:** Campaign create/edit, Resume Registry/usage, and paginated Discovery history/detail surfaces.
9. [x] **JH-W303:** Company-centric workspace plus deterministic Company/Campaign/Source/Resume analytics with Campaign scope.
10. [x] **JH-W401:** optional single-user Web session authentication; REST/MCP bearer stays server-only.
11. [x] **JH-W402:** versioned Career JSON export and WAL-safe standalone SQLite backup with Web download proxy and restore guidance.
12. [x] **JH-W403:** persistent typed Saved Views for Jobs and Applications, stored in SQLite schema v3 rather than browser-local state.
13. [x] **JH-W404:** batch Jobs/Application projections, stable max-200 offset pagination, and SQLite schema v4 hot-path indexes verified with query-plan regression.
14. [x] **JH-W405:** skip navigation, semantic landmarks/tables, visible keyboard focus, reduced-motion, and modal side-panel focus trapping/Escape/focus restore.
15. [x] **JH-W406:** Docker/Compose self-host packaging with private REST networking, loopback Web default, persistent SQLite bind mount, container health checks, restart smoke, and CI image/deployment validation.
16. Next: **JH-W407 Responsive + Browser E2E** for primary Web paths.

Only after standalone usage is proven should a separate MemoFlow adapter be implemented.
