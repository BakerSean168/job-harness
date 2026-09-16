# Roadmap

## Current checkpoint — Phase 0 foundation

Completed:

- [x] Independent public `job-harness` repository bootstrap
- [x] CH-0001 — canonical Career domain vocabulary and lifecycle
- [x] CH-0002 — transport-neutral application ports and runtime-validated contracts
- [x] CH-0003 — frozen MCP tool contract for read/write job-search memory workflows
- [x] Core-boundary guard preventing `@memoflow/*` dependencies
- [x] GitHub CI baseline

Deferred intentionally:

- [ ] MemoFlow runtime integration
- [ ] dynamic plugin loader / marketplace
- [ ] built-in AI provider
- [ ] built-in general web search
- [ ] external job-application submission automation

## Next standalone slice

The next implementation milestone is standalone persistence and use cases:

1. SQLite persistence for Company, Job, JobObservation, Application, ApplicationEvent, Campaign, DiscoveryRun, ResumeProfileRef.
2. Application services implementing the frozen ports with transaction + idempotency semantics.
3. Contract tests for dedupe and application timeline projection.
4. MCP runtime adapter backed only by application ports.
5. Minimal web/API surface after the domain slice is proven.

MemoFlow remains a future host compatibility target, not a dependency or delivery blocker.
