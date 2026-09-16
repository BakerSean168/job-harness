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

### JH-W102 — Web shell + i18n ✅

Implemented as a Next.js App Router workspace with persistent sidebar/topbar, stable IA routes, `zh-CN` default + `en`, semantic light/dark tokens, localized loading/error/404 primitives, and production-build CI gating. Business pages remain placeholders until W201/W202.

## Phase W2 — Primary vertical slice

### JH-W201 — Inbox + Jobs Table + Job Side Panel ✅

End-to-end path:

```text
external MCP discovery -> SQLite -> REST -> Inbox/Jobs Table -> Side Panel -> shortlist/ignore -> persisted state
```

This is the first UI acceptance slice.

### JH-W202 — Applications Board ✅

Implemented as a presentation-ready Board/Table workspace over the same Application read model. Main lanes are Applied → Screening → Assessment → Interview → Offer; Rejected/Withdrawn live behind the outcome filter. Drag/drop and keyboard stage controls call a Next Server Action → typed REST client → Application Service, append `stage_changed`, and reconcile the Board from server truth. Campaign/Resume/date/outcome filters run in SQLite before pagination, and Application Side Panel/full detail share one contract.

## Phase W3 — Search-management surfaces

### JH-W301 — Dashboard ✅

Implemented as an operational projection over the same workspace ports: Campaign selector/context, scoped KPI links, hiring funnel, deterministic Needs Attention rules, seven-day activity, recent Discovery runs, Resume correlation, and Listing-source association. Weekly shortlisting intentionally renders unavailable until Job triage becomes event-sourced; source metrics are Listing associations rather than submission-channel attribution.

### JH-W302 — Campaigns / Resumes / Discovery ✅

Implemented as three live management surfaces: Campaign list/create/edit over the existing Campaign application port; Resume Registry/usage with optional Campaign scope and no resume-content ownership leakage; and paginated DiscoveryRun history with Campaign/Executor filters, URL-addressable side panel/full detail, context snapshot, observation count and affected Jobs.

### JH-W303 — Companies + Analytics ✅

Implemented as canonical Company list/detail plus a Campaign-scoped deterministic Analytics workspace. Company projections expose Job/shortlist/Application/active-pipeline counts, cities, Listing sources and related Jobs without UI-side joins. Analytics keeps Job state and Application stage distributions separate and compares Company, Campaign, Listing-source and Resume associations without introducing AI scoring or causal attribution.

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
