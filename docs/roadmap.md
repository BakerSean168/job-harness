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
- [x] Core-boundary guard preventing `@memoflow/*` dependencies
- [x] GitHub CI baseline

Deferred intentionally:

- [ ] MemoFlow runtime integration
- [ ] dynamic plugin loader / marketplace
- [ ] built-in AI provider
- [ ] built-in general web search
- [ ] external job-application submission automation

## Next standalone slice

1. Minimal REST/API read/write surface backed by the same application ports.
2. Minimal Web UI for Jobs, Applications, Campaigns, Resumes, and pipeline dashboard.
3. Import/migration adapter for the existing historical job-application dataset.
4. Resume Harness registry sync adapter.
5. Auth hardening, export/backup, and deployment packaging.

Only after standalone usage is proven should a separate MemoFlow adapter be implemented.
