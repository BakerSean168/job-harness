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
5. [x] **JH-W201:** Inbox + Jobs Table + Job Side Panel with typed REST client and server-only triage mutations. Next: **JH-W202 Applications Board**.
6. Resume Harness continuous registry sync adapter, dashboard/analytics, auth hardening, export/backup, and deployment packaging.

Only after standalone usage is proven should a separate MemoFlow adapter be implemented.
