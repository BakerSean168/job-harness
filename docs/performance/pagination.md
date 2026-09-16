# Pagination and workspace query performance

W404 keeps offset pagination for Web V1, but hardens the read path before the corpus grows.

## Why offset pagination remains

The current product needs:

- deterministic first/previous/next pages;
- human-readable query parameters;
- at most 200 rows per request;
- stable sorting by durable timestamps plus ID tie-breakers;
- a corpus currently around hundreds, not millions, of Opportunities/Applications.

Changing to cursor pagination now would add contract/UI complexity without evidence that offset scanning is the active bottleneck. Cursor pagination should be reconsidered when real production traces show deep offsets or sustained corpus sizes where indexed offset scans are materially expensive.

## Stable ordering

Jobs use:

```text
last_seen_at DESC, id
```

Application workspaces use their existing stable update ordering. The ID tie-breaker prevents rows with identical timestamps from moving between adjacent pages.

The shared page contract caps `limit` at 200. Requests above that are rejected at the contract boundary before SQL execution.

## W404 batch projections

The Jobs Table previously projected each row by separately loading:

- Application;
- Resume reference;
- Campaign memberships.

W404 batches those relations once per page.

The Applications Board similarly batches page-level:

- Job/company metadata;
- JobListing rows;
- Campaign memberships;
- Resume references;
- ApplicationEvent timelines.

Business behavior and REST/read-model contracts are unchanged; only the persistence projection strategy changed.

## SQLite schema v4 indexes

Schema v4 adds current workspace hot-path indexes:

```text
jobs(last_seen_at DESC, id)
jobs(state, last_seen_at DESC, id)
applications(updated_at DESC, id)
applications(current_stage, updated_at DESC, id)
applications(resume_profile_id, applied_at DESC, id)
discovery_runs(started_at DESC, id)
discovery_runs(campaign_id, started_at DESC, id)
job_observations(job_id, discovery_run_id)
```

The regression suite uses `EXPLAIN QUERY PLAN` to verify that the representative deep Jobs/Application queries select the intended indexes. It deliberately does not use a brittle wall-clock threshold in CI.

## Regression corpus

The deterministic performance/pagination test seeds:

- 600 Opportunities;
- 600 Listings/Observations;
- 300 Applications;
- one Campaign and Resume reference.

It verifies first/deep Jobs pages, Campaign/Source/State filtering, a deep Applications page, page uniqueness, the 200-row cap, and the SQLite query plan.

A separate real-data smoke uses a consistent backup of the local historical database and verifies schema v4 migration with 100 Jobs / 41 Applications / 5 Resume references and `PRAGMA integrity_check = ok`.
