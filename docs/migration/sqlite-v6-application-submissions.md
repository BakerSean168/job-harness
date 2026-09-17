# SQLite v6 — first-class ApplicationSubmission

## Why

`Application` is the recruitment pipeline for one Opportunity. A user can submit to that Opportunity more than once (official site, referral, email, etc.), and each submit can use a different immutable Resume Revision/Artifact. Encoding those facts only as `application_recorded` / `submission_recorded` timeline events loses the exact submitted evidence.

Schema v6 therefore introduces `application_submissions` as the durable submit-action aggregate while preserving the existing Application lifecycle and event timeline.

## Table

Each Submission stores:

- stable `id` and owning `application_id`;
- optional `listing_id` and normalized submission `channel`;
- actual `submitted_at`;
- optional stable `resume_profile_id` (cross-context identifier, deliberately not a foreign key to the legacy Registry table);
- optional `resume_revision_id` and `resume_artifact_id` with restrictive foreign keys to the immutable Resume context;
- actor, idempotency key, note, and creation time.

`resume_artifact_id` is only valid together with a Revision. New commands verify that a Revision belongs to the supplied Profile and an Artifact belongs to that Revision before writing Career state. The Career application package owns only a narrow evidence port; it does not depend on Resume contracts or storage.

## Historical migration

The v5 → v6 migration backfills one Submission for each historical `application_recorded` / `submission_recorded` event. It is intentionally conservative:

- the first `application_recorded` may inherit the Application row's legacy Resume Profile reference;
- later `submission_recorded` events keep Resume Profile/Revision/Artifact unknown because the old event model did not preserve exact evidence;
- Listing and channel remain unknown unless future migration evidence proves them;
- Revision/Artifact are never guessed;
- deterministic IDs are derived from historical event IDs so migration is repeatable.

A defensive migration guard also supports minimal historical SQLite fixtures that omit `application_events`: the new table is created, but no synthetic rows are invented.

## Compatibility

`applications.resume_profile_id` remains temporarily as a compatibility projection for existing filters/UI. New Submission evidence is authoritative for actual submit actions. A Revision-derived Profile does not require a matching legacy `resume_profile_refs` row; the compatibility column remains null when no old Registry row exists.

`ApplicationEvent` remains the recruitment/audit timeline. Submission creation continues to emit `application_recorded` for the first submit and `submission_recorded` for later submits, so existing activity projections remain stable while `submissionCount` now derives from `application_submissions`.

## Export

The logical Career export advances to schema version 2 and includes `submissions` alongside each Application timeline. This prevents first-class submission evidence from disappearing in portable exports.

## Verification

Automated migration and runtime tests cover:

- conservative historical backfill with unknown later Resume evidence;
- one Application with multiple idempotent Submission records;
- exact Listing / channel / Resume Revision / Artifact linkage;
- Revision/Profile and Artifact/Revision mismatch rejection;
- retry without duplicate Submission;
- Application and Job workspace `submissionCount` derived from Submission rows;
- export schema v2 preserving Submission rows;
- SQLite foreign-key and integrity checks.
