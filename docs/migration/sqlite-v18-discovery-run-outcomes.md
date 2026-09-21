# SQLite v18 — DiscoveryRun Outcomes

Date: 2026-09-21

## Purpose

SQLite schema v18 makes DiscoveryRun execution outcome explicit instead of inferring success/failure from `completedAt` and result counts.

Each DiscoveryRun now carries:

- `status`: `running | succeeded | failed | aborted`
- `failureCode`: bounded machine-readable failure code, nullable
- `failureReason`: bounded human-readable failure reason, nullable

## Migration

The migration is additive.

For existing databases:

- rows with `completed_at IS NOT NULL` become `succeeded`;
- rows with `completed_at IS NULL` remain `running`;
- `failure_code` and `failure_reason` start as null;
- an index on `(status, started_at DESC, id)` is created.

No existing DiscoveryRun counts, timestamps, JobObservation links or Campaign links are rewritten.

## Completion invariants

New completions use the application service as the semantic boundary.

- `succeeded` requires null failure evidence.
- `failed` requires both `failureCode` and `failureReason`.
- `aborted` requires both `failureCode` and `failureReason`.
- `running` is not a legal terminal completion status.

Existing callers that omit outcome fields remain backward-compatible and complete as `succeeded`.

## Worker behavior

The first updated producer is `@job-harness/discovery-worker`:

- normal provider completion records `succeeded`;
- a thrown provider error records `failed / provider_error` before rethrowing.

Other producers may continue to use the default successful completion until they have a meaningful failure/abort signal.

## Export

Career logical export advances to schemaVersion **5** because DiscoveryRun now carries durable outcome fields.

## Operational follow-up

Historical open canaries are not automatically classified as failures during migration because the database cannot infer why they stopped.

After deployment, known stale runs may be completed explicitly as `failed` or `aborted` only when external evidence identifies the reason.
