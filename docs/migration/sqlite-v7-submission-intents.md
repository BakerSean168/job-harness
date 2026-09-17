# SQLite v7 — durable SubmissionIntent / outbox

## Why

An external recruiting-site application is not an atomic database command. A browser executor can successfully submit a form and then crash, lose its tool session, or fail while recording the corresponding `ApplicationSubmission`. Re-running the browser action blindly can create a duplicate real-world application.

Schema v7 introduces `SubmissionIntent` as the durable boundary around that side effect. Job Harness records the planned action **before** an external executor touches a recruiting site, preserves external-success evidence **before** local reconciliation, and can retry only the local persistence step after a restart.

Job Harness still does not click recruiting sites itself. Browser automation remains an external executor. The durable protocol exists so that the executor and Job Harness can recover safely when either side fails.

## Lifecycle

The normal lifecycle is:

```text
planned
  -> external_in_progress
  -> external_confirmed
  -> committed
```

Recovery branches are explicit:

```text
external_confirmed -> persistence_pending -> committed
external_in_progress --stale--> needs_manual_review
persistence_pending --retry budget exhausted--> needs_manual_review
planned/external_in_progress -> external_failed
```

`needs_manual_review` is intentionally not treated as evidence that an application succeeded or failed. A human/executor may later provide real success evidence through `confirm`, or explicit failure evidence through `fail` when no success has already been recorded.

## Durable fields

`submission_intents` stores:

- owning Job and optional Listing;
- normalized submission channel;
- Resume Profile / immutable Revision / Artifact evidence when available;
- executor kind and optional executor session identifier;
- target URL;
- lifecycle status;
- external start/confirmation timestamps and effective application time;
- optional external reference plus structured external evidence;
- reconciled Application and ApplicationSubmission IDs;
- prepare idempotency key;
- last local/external error, retry count, note, and timestamps.

The table has indexes for status/update recovery scans and Job-local history. Resume Profile ID remains a stable cross-context identifier rather than a foreign key to the legacy Registry; immutable Revision and Artifact relationships continue to be validated through the Resume evidence port.

## Protocol

The external executor follows this sequence:

1. `prepare` — persist the complete intended Job/Listing/Resume target and receive an intent ID.
2. `begin` — mark the intent `external_in_progress` immediately before performing the real browser/site side effect.
3. Perform the external action outside Job Harness.
4. On confirmed success, call `confirm` with the timestamp and durable site evidence. Job Harness then records the canonical `ApplicationSubmission` using idempotency key `submission-intent:<intentId>`.
5. On confirmed failure, call `fail` with evidence.
6. If local persistence fails after external success, the intent remains `persistence_pending`; `reconcile` or the background reconciler retries only local persistence.

A repeated confirmation must carry the same immutable success evidence. Conflicting retry evidence is rejected instead of overwriting the first durable truth.

## Reconciliation

The Server owns a bounded recovery loop. By default it runs on startup and every five minutes:

```text
JOB_HARNESS_SUBMISSION_RECONCILE_INTERVAL_MS=300000
JOB_HARNESS_SUBMISSION_STALE_AFTER_MS=7200000
JOB_HARNESS_SUBMISSION_MAX_AUTOMATIC_RETRIES=8
JOB_HARNESS_SUBMISSION_RECONCILE_BATCH_SIZE=100
```

The loop:

- retries `external_confirmed` / `persistence_pending` local commits oldest-first;
- never repeats the external recruiting-site action;
- moves items over the automatic retry budget to `needs_manual_review`;
- marks stale `external_in_progress` items for manual verification instead of guessing whether the site submission succeeded;
- has a reentrancy guard so an interval tick cannot overlap the previous sweep.

Set the interval to `0` to disable automatic sweeps while retaining explicit REST/MCP reconciliation.

## API and MCP boundary

REST exposes list/get/prepare/begin/confirm/fail/singular reconcile plus bounded `reconcile-pending`. MCP exposes the same semantic intent operations. Every MCP tool still declares `externalSideEffect: false`: none of them clicks or submits on a recruiting site.

This separation is deliberate:

```text
AI / external browser executor
          |
          | prepare / begin / confirm / fail
          v
      Job Harness
          |
          | durable intent + evidence + local reconcile
          v
 Application / ApplicationSubmission
```

Raw SQLite/file mutation is not part of the integration contract.

## Export and backup

Logical Career export advances to schema version **3** and includes all `submissionIntents`, including pending/manual-review records. A portable export therefore retains unfinished external-side-effect recovery state instead of silently losing it.

The existing WAL-safe SQLite backup naturally includes the v7 table and remains the primary exact restore mechanism.

## Verification

Automated coverage includes:

- v6 -> v7 schema migration, index/column and SQLite integrity checks;
- prepare-before-side-effect and prepare idempotency;
- exact confirmation evidence and conflicting-confirmation rejection;
- successful confirmation -> idempotent `ApplicationSubmission` reconciliation;
- first-class Resume Profile-only evidence without requiring a legacy Registry row;
- persistence failure -> durable `persistence_pending`;
- bounded retry budget -> `needs_manual_review`;
- restart/startup background reconciliation without redoing the external action;
- stale `external_in_progress` -> manual review without invented success;
- manual confirmation after stale review;
- REST client filters/reconcile payloads, MCP surface, logical export v3, OpenAPI drift, and full repository checks.
