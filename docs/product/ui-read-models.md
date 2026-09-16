# Web V1 UI read models

JH-W002 introduces presentation-ready, read-only projections above the Career application boundary. Web/API adapters consume these contracts instead of importing SQLite repositories or rebuilding cross-domain joins in the UI.

## Workspace port

`CareerWorkspaceReadPort` exposes:

```text
searchJobListItems
getJobDetail
listApplicationBoard
getApplicationWorkspaceDetail
getDashboardSnapshot
getDiscoveryRunDetail
listResumeUsage
```

The port is host-neutral. A future REST adapter, server-rendered Web route, CLI, or MemoFlow adapter may all consume the same read semantics.

## JobListItem

Optimized for the dense Jobs/Inbox table:

- Opportunity identity, company, role, city, Job state;
- current Application summary when present;
- deterministic primary JobListing;
- listing count and distinct source kinds;
- Campaign references;
- actual Resume reference when an Application has one;
- first/last seen timestamps.

Primary Listing selection is deterministic and explainable: active before unknown/closed, usable URL before no URL, first-party/ATS sources before discovery aggregators, then most recently seen.

## JobDetail

The side panel and `/jobs/:id` full page use the **same** `JobDetail` contract:

- canonical Job/Opportunity + every Listing;
- primary Listing;
- Campaign memberships;
- Application, timeline, Resume, latest event and submission count;
- Listing-linked JobObservation history.

This prevents side-panel and full-page behavior from drifting into separate data models.

## Application workspace projections

The existing MCP-compatible `ApplicationListItem` / `ApplicationDetail` contracts remain unchanged. Web workspace needs are additive:

- `ApplicationBoardItem`: company/role/location, Job state, primary Listing, Campaigns, Resume, latest event, stage-entered time and submission count;
- `ApplicationWorkspaceDetail`: the same pipeline context plus the full ApplicationEvent timeline.

`stageEnteredAt` is derived from lifecycle events, not from client clock arithmetic. `submission_recorded` does not move the pipeline stage.

## DashboardSnapshot

The first reliable dashboard projection contains only facts supported by current domains:

- selected Campaign reference;
- Known Jobs / Inbox / Shortlisted / Applications / Active Pipeline / Interview-stage KPIs;
- current funnel counts;
- recent DiscoveryRuns;
- Resume usage grouped by current Application stage.

The initial snapshot intentionally does **not** fabricate:

- source performance by application channel (JobListing discovery source is not yet Application submission channel);
- interview-round counts before the InterviewRound domain exists;
- weekly shortlist history before explicit triage/decision events exist;
- LLM-generated “needs attention” recommendations disguised as deterministic facts.

Those projections land only when their source-of-truth domains exist.

## DiscoveryRunDetail

Provides one run, its Campaign, affected `JobListItem`s, and observation count. This is sufficient for the first Agent activity/run-detail UI without exposing persistence joins.

## ResumeUsageSummary

Provides one Resume registry entry, current Application counts by stage, and the latest Application date visible through the current Resume projection. Exact per-submission material history remains a V1.1 `ApplicationMaterial` concern.

## Scope and filtering

JH-W002 freezes the read shapes, not the final filter builder. Jobs inherit the existing durable search filters. Application Board is globally scoped in this ticket; campaign/resume/date filtering is added with the Applications Board slice (JH-W202). Dashboard and Resume usage already support Campaign scope because their product semantics require it from the first render.
