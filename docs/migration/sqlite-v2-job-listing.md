# SQLite v2 — JobListing migration

Job Harness v0.2 separates a durable Job/Opportunity from the source/ATS publications that expose it.

## Model change

```text
v0.1
Job
  canonicalUrl
  externalIdentities[]
  sources[]

v0.2
Job / Opportunity
  └── JobListing[]
        └── JobObservation[]
```

`Application.jobId` is unchanged. Applications continue to attach to the Opportunity rather than to an individual listing.

## Automatic migration

Opening a schema-v1 database with `SqliteCareerStore` runs an in-place transaction that:

1. creates `job_listings`;
2. backfills source rows, canonical URLs, and external identities as listings;
3. preserves semantic hash-router URLs such as Moka `#/job/<id>`;
4. adds `job_observations.listing_id` and backfills every historical observation;
5. advances `PRAGMA user_version` from `1` to `2` only after the transaction succeeds.

The legacy `jobs.canonical_url`, `job_sources`, and `job_external_identities` storage remains in the database as migration evidence, but application reads and writes use `job_listings` as the source of truth.

## Identity semantics

Strong listing identity is either:

- `external:<namespace>:<externalId>`; or
- normalized job-specific URL.

Generic careers pages use `identityKind = scoped`, so the same URL may legitimately be attached to several opportunities.

`company + title + city` is only a potential Opportunity match. It does not auto-merge records in v0.2.

## Verified corpus

Two validation paths are intentionally distinguished.

### In-place schema upgrade

The existing v0.1 database contained:

- 100 legacy Job rows;
- 41 legacy Application rows;
- 5 Resume profiles.

The v1 -> v2 SQLite migration is deliberately lossless and non-destructive. It preserved those row counts, backfilled 226 JobListings, and left zero historical JobObservations without a Listing reference. It does **not** silently merge old duplicate Opportunities during a schema migration.

### Fresh canonical import

Re-importing the same raw `job-apply-copilot` sources through the v0.2 application contract produced:

- 99 canonical Opportunities;
- 224 JobListings;
- 40 Application pipelines;
- 41 submission facts in total (`application_recorded` for pipeline creation plus `submission_recorded` for later confirmed channels);
- 5 Resume profiles.

The row-count difference is intentional. One legacy Coremail role existed under two company-name variants but shared the same strong listing URL. v0.2 canonicalizes that into one Opportunity and one pipeline while preserving both confirmed submissions (the later one through official email) as two auditable timeline events.

This distinction protects both invariants: schema upgrades never destroy legacy rows, while a fresh canonical import can reconcile known aliases without losing submission history.
