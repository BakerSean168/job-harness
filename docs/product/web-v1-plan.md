# Web V1 implementation plan

This plan starts after the benchmark/IA freeze. It intentionally fixes the data contract before the UI depends on the current V0.1 shortcut.

## Phase W0 — Domain correction before UI

### JH-W001 — Introduce JobListing ✅

**Goal:** Separate durable Opportunity identity from source/ATS publication identity.

**Why now:** Jobs UI needs to show multiple listings and source freshness. Building it on `Job.canonicalUrl + sources[]` would create an immediate migration trap.

**Scope:**
- canonical `JobListing` schema;
- listing persistence/table + migration from existing Job source fields;
- identity/dedupe service updates: external ID/URL resolve Listing; company/title/city becomes a conservative Opportunity candidate match rather than unconditional merge;
- read models expose listing summary;
- import adapter produces/upserts listings;
- MCP semantics remain Opportunity-oriented unless a listing-specific tool is required.

**Out of scope:** Contacts, InterviewRound, Assessment UI.

**Protected contracts:** In-place v1 -> v2 migration is lossless for the legacy 100 Job / 41 Application rows; a fresh canonical import may reconcile known aliases but must preserve every evidenced submission fact. Application continues to reference Job, not JobListing.

**Status:** implemented in v0.2 with SQLite v1→v2 migration and real 100 Job / 41 Application corpus validation.

**Acceptance:**
- one Job can have official + BOSS listings without becoming two Jobs;
- same company/title/city can remain separate when the evidence indicates different HC/BU/batches;
- two Moka hash-route job IDs remain distinct opportunities/listings where appropriate;
- old SQLite data migrates deterministically;
- `pnpm check` passes.

### JH-W002 — Define UI read models ✅

**Goal:** Return presentation-ready aggregate views without leaking SQL/table joins into the Web app.

Read models:
- `JobListItem` / `JobDetail`;
- existing MCP `ApplicationListItem` / `ApplicationDetail` plus Web-specific `ApplicationBoardItem` / `ApplicationWorkspaceDetail`;
- `DashboardSnapshot`;
- `DiscoveryRunDetail`;
- `ResumeUsageSummary`.

**Status:** implemented behind `CareerWorkspaceReadPort` with real SQLite projection tests. The initial Dashboard intentionally exposes only facts supported by existing domains; source-performance, InterviewRound, and historical triage metrics remain deferred until their authoritative data exists.

**Acceptance:** side panel/full page consume the same JobDetail; Board does not build joins client-side; no UI direct DB imports.

## Phase W1 — API + application shell

### JH-W101 — Minimal REST facade ✅

Expose the same Application/Workspace Services over versioned `/api/v1/*`; no duplicate business rules. Implemented with shared bearer auth, runtime validation, stable error mapping, and HTTP integration tests.

### JH-W102 — Web shell + i18n

Create Web app shell with sidebar, workspace header, `zh-CN` + `en`, light/dark semantic tokens and error/loading primitives.

## Phase W2 — Primary vertical slice

### JH-W201 — Inbox + Jobs Table + Job Side Panel

End-to-end path:

```text
external MCP discovery -> SQLite -> REST -> Inbox/Jobs Table -> Side Panel -> shortlist/ignore -> persisted state
```

This is the first UI acceptance slice.

### JH-W202 — Applications Board

Board drag -> Application Service transition -> ApplicationEvent -> refreshed board/timeline.

## Phase W3 — Search-management surfaces

### JH-W301 — Dashboard

Campaign context, funnel, attention list, weekly activity, recent discovery runs.

### JH-W302 — Campaigns / Resumes / Discovery

Read/manage campaigns, view resume registry and usage, inspect discovery run history.

### JH-W303 — Companies + Analytics

Company-centric view and deterministic source/resume/campaign projections.

## Phase W4 — Hardening

- auth/session appropriate for self-hosted deployment;
- export/backup;
- pagination/performance for larger corpora;
- saved system/user views;
- keyboard/ARIA pass;
- responsive behavior;
- Docker/deployment to durable host;
- E2E browser coverage for primary paths.

## Deferred after Web V1 evidence

- Contacts;
- InterviewRound + Calendar integration;
- JobAssessment UI;
- structured Notes/Decision domain;
- ApplicationMaterial beyond current resume projection;
- MemoFlow adapter;
- dynamic plugin runtime.
