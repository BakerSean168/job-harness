# SQLite v10 — review snapshots and submit authorization

R019 deliberately separates **form preparation** from the one irreversible browser action: submitting an application to an external recruiting site. A worker may fill a page and hand it to a human, but it must not gain submit permission merely because it owns a browser session or an `ExecutionAttempt` lease.

Schema v10 adds two append-oriented safety records:

- `execution_review_snapshots`: an immutable, redacted description of the reviewed form state. It binds the frozen ApplyBundle hash, retained browser-session reference, local form-state SHA-256, FormIR/catalog versions, site-adapter version and aggregate validation counts. It cannot store applicant field values.
- `submit_authorizations`: a short-lived user/system authorization bound to one ReviewSnapshot hash. It is idempotent, has an explicit expiry, is single-active-per-attempt, and becomes `consumed` or `revoked`.

The supervised submit protocol is:

```text
worker fills deterministic fields
  -> compute local formStateHash
  -> persist ReviewSnapshot under the current worker lease
  -> retain browser session
  -> waiting_for_user (worker lease released)

human reviews exact live session
  -> global/user control plane issues short-lived SubmitAuthorization
  -> explicit attempt resume
  -> worker reclaims + reconnects exact retained session
  -> recompute formStateHash
  -> begin-submit(formStateHash, authorization)
       1. validate lease + active authorization + exact review/form/browser hashes
       2. move SubmissionIntent to external_in_progress
       3. atomically consume authorization + mark ExecutionAttempt external-effect boundary crossed
       4. only then return permission to the worker
  -> one external site submit action
  -> exact success/failure/uncertain evidence
  -> SubmissionIntent confirm/fail
  -> ExecutionAttempt terminal result
```

`begin-submit` is intentionally **not** a blind retry token. If its response is lost, the worker does not click and does not repeat the site action. A crossed/expired technical attempt is recovered to manual review instead. This chooses a harmless false-positive review over a duplicate real-world application.

The worker-only bearer may create ReviewSnapshots and report begin/success/failure while holding a valid attempt lease. It **cannot issue SubmitAuthorization**; authorization stays on the global/user control plane. ChatGPT MCP still has no recruiting-site external-side-effect tool.

Raw cookies, browser storage, passwords, applicant field values and Resume bytes are excluded from both new tables. Exact Resume bytes remain available only through the existing lease-scoped immutable PDF Artifact grant.
