# SQLite v11 — Applicant Profile and Application AnswerSet

R019 needs repeatable application autofill facts that are not owned by the browser extension and are not all appropriate to store in a role-specific Resume. SQLite v11 therefore adds two small first-class aggregates with immutable revision history.

## Tables

- `applicant_profiles`: mutable operator-facing base facts (identity/contact/education/preferences), with exactly one default profile.
- `applicant_profile_revisions`: immutable content-addressed snapshots used by ApplyBundle.
- `application_answer_sets`: mutable explicit reusable ATS answers, with exactly one default set.
- `application_answer_set_revisions`: immutable snapshots used by ApplyBundle.

The migration is additive. It does not rewrite Career, Resume, SubmissionIntent, ExecutionAttempt, ReviewSnapshot or ApplicationSubmission rows.

## Bootstrap

On the first server start after migration, if no Applicant Profile exists, Job Harness derives one initial profile from the existing first-class Resume Domain. This is a one-time strangler bootstrap, not continued dual ownership. After that, Applicant Profile is the base-fact source for autofill while Resume remains responsible for role-specific document content. A default empty AnswerSet is created at the same time.

The bootstrap creates immutable revision 1 for each aggregate. Subsequent saves use optimistic concurrency and create a new revision only when semantic content changes; version/timestamp metadata alone does not change the content hash.

## Apply freeze boundary

When a prepared SubmissionIntent is dispatched, ApplyBundle freezes:

- `applicantProfileRevisionId` + `applicantProfileHash`;
- `answerSetRevisionId` + `answerSetHash`;
- the existing Resume Revision / PDF Artifact evidence.

The worker never reads the current mutable Applicant Profile directly. Its lease-scoped ApplicantDataGrant resolves values only from those frozen revisions. Editing Settings after dispatch therefore cannot silently alter an in-flight application.

## Merge and safety rules

The value-free applicant catalog merges three sources:

1. Resume Revision — role-specific positioning, work/project/skill/certificate facts;
2. Applicant Profile Revision — authoritative base identity/contact/education/preferences;
3. Application AnswerSet Revision — explicit recurring ATS answers, optionally host-scoped.

Later layers override the same canonical key. Legal/protected AnswerSet values are literal-only and are never eligible for AI semantic mapping. Missing legal/protected answers remain manual blockers rather than guessed values.

## Rollback / recovery

The v11 migration is additive. Full recovery uses the existing WAL-safe SQLite backup. Rolling application binaries back below schema v11 is intentionally refused by the schema-version guard; restore the pre-migration backup instead of attempting an in-place downgrade.
