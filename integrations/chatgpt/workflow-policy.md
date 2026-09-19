# Job Harness ChatGPT workflow policy

This is the normative orchestration policy for a ChatGPT/custom-MCP client. It is not a database migration and it is not permission to bypass Job Harness application services.

## Global invariants

1. Load durable context before proposing mutations.
2. Treat Job Harness as the source of truth for Career/Resume state; never invent IDs or silently replace missing records.
3. Use semantic MCP tools only. Never request raw SQL, raw SQLite, direct filesystem writes, or edits to Resume source files.
4. Preserve optimistic versions for Resume Profile mutations. On a version conflict, reload authoring context and re-plan; do not blindly replay a stale patch.
5. Do not claim an external job application succeeded unless durable external-success evidence has been recorded on a `SubmissionIntent`.
6. Never repeat a recruiting-site side effect merely because the subsequent Job Harness call failed. Recover from the durable intent first.
7. `needs_manual_review` means “unknown/needs verification”, not success and not failure.
8. Keep discovery and storage incremental. Upsert candidates in bounded batches instead of retaining an entire search session only in conversation state.
9. `boss_greeting_resolve(action=send)` is the only MCP tool allowed to trigger an external recruiting-site effect. It may only release an already-waiting BOSS Compatibility Runtime greeting; it is not permission to submit an application or perform arbitrary browser actions.

## Discovery workflow

```text
career_context_get
  -> career_discovery_begin
  -> web/search executor gathers candidates outside Job Harness
  -> career_job_duplicate_check (when useful)
  -> career_jobs_upsert_batch (incremental batches)
  -> career_discovery_complete
  -> career_pipeline_stats
```

Rules:

- `career_jobs_search` searches durable known Jobs, not the public web.
- Store source URL/external identity when available so Job/Listing dedupe stays deterministic.
- A DiscoveryRun should be completed with truthful candidate/inserted/duplicate/rejected counts even when the conversation later changes topic.

## Resume authoring workflow

```text
resume_profiles_list
  -> resume_authoring_context_get(profileId, optional jobId)
  -> resume_profile_patch_selection and/or resume_profile_patch_overrides
  -> reload context on optimistic conflict
  -> resume_revision_publish
  -> resume_revision_artifact_materialize(kind=pdf)
```

Rules:

- Prefer Profile-local selections/overrides for tailoring. Shared Library facts are not exposed as a broad AI mutation tool.
- Do not publish a Revision until the desired saved Profile state is resolved successfully.
- A published Revision is immutable evidence. Never rewrite it to represent a later submission.
- When preparing an application, bind the exact Revision/Artifact whenever available.

## BOSS greeting workflow

When the user has explicitly asked Job Harness to continue BOSS outreach and the Compatibility Runtime is already running:

```text
boss_greetings_pending(limit <= 10)
  -> inspect each request's JD, match data and true candidate context
  -> boss_greeting_resolve(action=send, message=...) OR boss_greeting_resolve(action=skip, reason=...)
  -> re-read boss_greetings_pending while the active run still has work
```

Rules:

- `boss_greetings_pending` is read-only and sends nothing.
- For `send`, write only a natural 1-3 sentence greeting grounded in the provided Resume facts and current JD. Do not invent experience, years, employers, awards or proficiency.
- Use `skip` when the JD has an explicit hard requirement the candidate does not meet, or when the core role does not match the supplied evidence.
- `boss_greeting_resolve(action=send)` is a bounded external side effect: it releases the already-waiting Compatibility Runtime, which sends exactly that greeting to the current BOSS recruiter. Do not call it outside an explicit BOSS-outreach task.
- Do not spin indefinitely. Process a bounded batch during the active ChatGPT run; if there are no pending requests, stop cleanly.
- A BOSS greeting is recruiter contact, not a completed job application. Durable outreach evidence and Application/Submission state remain separate.

## External application workflow

Except for the bounded BOSS greeting release above, the MCP app itself **does not click or submit on recruiting sites**. A separate user/browser executor performs application side effects.

Before any external action:

```text
career_submission_intent_prepare
  -> career_submission_intent_begin
  -> external browser/site action
```

After the external action:

- success proven: `career_submission_intent_confirm`
- failure proven: `career_submission_intent_fail`
- uncertain browser/session loss: leave the durable intent for reconciliation/manual review; do not guess.

If confirmation returns `persistence_pending`, the external action is already considered confirmed. Use `career_submission_intent_reconcile` or `career_submission_intents_reconcile_pending`; **do not submit again externally**.

At the beginning of a resumed application session, inspect recoverable state:

```text
career_submission_intents_list(
  statuses=[external_in_progress, external_confirmed, persistence_pending, needs_manual_review]
)
```

Resolve those records before launching duplicate browser work for the same Job/Listing.

## Pipeline maintenance

Use `career_application_transition` for recruitment-stage changes and preserve the real event time. Rejection/withdrawal are lifecycle states, not deletion. Use `career_job_state_set` for Opportunity triage; do not infer an Application transition from Job triage alone.

## Tool failure policy

- Validation error: correct the request from canonical context; do not weaken schema constraints.
- Not found: reload/search canonical state; do not synthesize the missing ID.
- Version conflict: reload and rebase the Resume patch.
- Idempotency conflict: stop and inspect the existing durable operation; never generate a new idempotency key merely to force a duplicate side effect.
- MCP/network loss during external submission: inspect `SubmissionIntent` after reconnecting before doing anything on the recruiting site.
- Unknown/unclassified external result: move toward manual verification, not automatic success/failure.
