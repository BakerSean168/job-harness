# Roadmap

## Current checkpoint — Standalone V1 proven / host integration contract

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


### Production proof — 2026-09-16

- [x] Oracle2 durable deployment with Tailnet Web `20900` and bearer-protected REST/MCP `20901`
- [x] restart/persistence and official-SDK MCP verification against real state
- [x] JobSync reconciliation: `66/66` Jobs resolved, `37/37` applied records mapped, `0` unresolved
- [x] Resume Registry artifacts moved to durable `/data/resumes/` with 5/5 SHA-256 verification
- [x] Oracle2 runtime backup v5 + restore drill includes SQLite, env/Compose/revision and all Resume artifacts
- [x] retired JobSync `20800` only after archive + reconciliation gates passed
- [x] Digital Biome production navigation cut over to Job Harness
- [x] **CH-0004:** narrow `CareerGateway` + host-owned Goal -> Campaign `CareerIntegrationBinding` frozen; REST host parity added for Pipeline and Discovery lifecycle
- [x] Cross-repository REST contract artifact: canonical route registry + generated OpenAPI 3.1 + `/openapi.json` + drift gate

**Next:** Resume merge track (`JH-R000+`). MemoFlow CH-0005 owner integration is paused until the current Goal/Task/Schedule/AI convergence lands on a stable integration baseline.

Deferred intentionally:

- [ ] MemoFlow runtime integration (CH-0005+; paused while MemoFlow owner models converge)
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
16. [x] **JH-W407:** responsive phone layout plus production-mode Playwright Chromium coverage for auth, Jobs, Application transition, Settings export and mobile containment.

The standalone Web V1 hardening plan is complete and production evidence now satisfies the proof gate. CH-0004 freezes the host-neutral gateway/binding contract; CH-0005 is the next implementation slice before any MemoFlow runtime adapter is wired.

## Resume merge track — 2026-09-17

- [x] **JH-R000:** freeze the dirty standalone Resume baseline without modifying it; validation 45/45; five Profile IDs and five PDF hashes recorded; private recovery snapshot verified; credentials excluded.
- [x] **JH-R001:** freeze Resume Domain v2 contracts for localized canonical content, Profile recipes, explicit project presentations, resolved snapshots, immutable Revisions, immutable Artifacts and stable-ID reference validation.
- [x] **JH-R002:** port the existing Nunjucks/HTML/CSS renderer behind `ResolvedResume`; add strict resolver + legacy importer; real dirty Resume source reaches 5/5 exact HTML SHA parity with 0 migration findings.
- [x] **JH-R003:** add SQLite v5 Resume persistence plus atomic legacy catalog import; GCP historical-copy verification preserves 100 Jobs / 41 Applications / 5 legacy refs / 82 Companies, imports 1 Library + 5 Profiles, remains idempotent and keeps 5/5 exact HTML SHA parity.
- [x] **JH-R004:** replace the Registry-only Resumes page with structured/source editing, scope-separated Profile/Library saves, optimistic concurrency, unsaved-draft live preview, and navigation-loss protection.
- [x] **JH-R005:** publish immutable Revision history with canonical content hashes, retry-safe reuse, optimistic Profile/Library version guards, and previous/current structured diff.
- [x] **JH-R006:** immutable HTML/PDF/JSON artifact pipeline with private Chromium sidecar, SHA-verified durable storage/download, production-shaped restart smoke, and Oracle2 ARM64 renderer proof.
- [x] **JH-R007:** first-class ApplicationSubmission -> ResumeRevision/Artifact linkage with conservative historical backfill, idempotent command semantics, export v2, and auditable Application UI.
- [x] **JH-R008:** Submission-first Profile/Revision usage analytics with distinct Application counts, exact Submission counts, legacy evidence fallback, and non-causal Web projections.
- [x] **JH-R009:** Oracle2 cutover completed with 104 Jobs / 41 Applications / 84 Companies preserved, five Profile/PDF parity proven, durable editor/preview/publish/export smoke passed, and `oracle2-runtime-backup-v6` restore-drilled against every first-class Resume Artifact.
- [x] **JH-R010:** standalone Resume runtimes archived and retired after cutover proof; old `4173`/`20400` services and Tailnet routes removed, dirty source preserved for research/history, and Job Harness `/resumes` is the single canonical runtime entry.

### Workspace and AI integration follow-up

Detailed design: `docs/resume/agent-workflow-and-workspace-plan.md`.

- [ ] **JH-R011:** scalable Applications Board with viewport layout, lane-local scrolling and lane-aware pagination/cursors; Table remains server-paginated.
- [ ] **JH-R012:** Resume Content Composer exposing migrated skill/work-bullet/project-presentation/project-highlight/summary/certificate selections without requiring source mode.
- [ ] **JH-R013:** exact unsaved Draft PDF preview through the production Chromium renderer with real A4 page boundaries.
- [ ] **JH-R014:** explicit Web entry points for Add Job and Record Application, reusing canonical application services and idempotency/identity rules.
- [ ] **JH-R015:** Resume MCP semantic authoring tools, including authoring context and narrow Profile mutation operations.
- [ ] **JH-R016:** ChatGPT integration packaging: Skill/workflow policy plus authenticated MCP/App connectivity without direct database exposure.
- [ ] **JH-R017:** SubmissionIntent + durable outbox + reconciliation for external automated applications.

See `docs/resume/` for the benchmark, domain model, baseline, migration plan and implementation plan.
