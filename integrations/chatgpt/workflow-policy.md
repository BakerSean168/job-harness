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
9. Only three MCP tools may deliberately cross a bounded external-effect boundary: `boss_runtime_start` starts/reuses one Campaign-policy-bounded coarse BOSS Site Runtime task, `boss_greeting_resolve(action=send)` releases one already-waiting BOSS greeting, and `career_email_application_authorize_send` authorizes one exact immutable email draft for the independent delivery worker. None is permission to submit an ATS application or perform arbitrary browser actions.

## Campaign automation modules

Every automated discovery/application run must load the Campaign and obey `campaign.automation` before starting downstream work. The modules are deliberately independent:

```text
collection.enabled
  -> discover + dedupe + persist Job/Listing/Observation

outreach.enabled
  -> allows the coarse recruiting-platform Site Runtime
outreach.autoStartEnabled
  -> allows `boss_runtime_start(mode=automatic)`; false does not block an explicit/manual operator start
outreach.greetingEnabled / recruiterInboxEnabled / resumeFollowupEnabled
  -> become immutable policy on the active Runtime task
outreach.maxExternalEffectsPerRun
  -> bounds recruiter-facing effects performed under that Runtime task

officialSite.prepareEnabled
  -> choose configured Resume or deterministic recommendation
  -> career_submission_intent_prepare_recommended

officialSite.fillEnabled
  -> allows the separate planned-intent dispatcher to queue safe fill/upload work

officialSite.submitEnabled
  -> when a capable executor exists, dispatcher may use review_then_submit with submitAllowed=true
  -> the existing one-time ReviewSnapshot/submit-authorization boundary is still mandatory before any final click

email.draftEnabled
  -> choose configured Resume or deterministic recommendation
  -> generate JD-specific subject/body from true Resume facts
  -> career_email_application_prepare(subject, body, ...)

email.sendEnabled
  -> career_email_application_authorize_send(exact draftHash, short TTL)
  -> independent Email Delivery Worker performs the provider send when configured/running
```

Safe defaults are collection=true, outreach enabled=true, outreach auto-start=false, greeting/inbox/explicit resume-followup=true with a bounded per-run external-effect budget, official prepare=true, official safe fill=true, official final submit=false, email draft=true, email send=false. A preferred Resume Profile ID pins the selected Resume for that channel; null means use deterministic recommendation. Never turn on a later module implicitly because an earlier module is enabled.

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

## BOSS Site Runtime workflow

BOSS browser automation is a coarse upstream-backed Site Runtime, not a sequence of MCP/Bridge DOM commands. Read its state first:

```text
boss_runtime_status
  -> inspect browser/runtime health, active task and recent normalized events
  -> if an active task is already running, reuse it
  -> otherwise boss_runtime_start(mode=automatic|manual, stable idempotencyKey)
  -> runtime executes the mature upstream-derived search/detail/chat/resume state machine
  -> boss_runtime_status exposes normalized task/events
  -> boss_runtime_pause(taskId, reason) when the bounded run should stop
```

Rules:

- `boss_runtime_status` and `boss_runtime_pause` do not create recruiter-facing effects.
- `boss_runtime_start` is a bounded external-side-effect tool because a running Site Runtime may perform Campaign-authorized recruiter-facing work. It does not grant arbitrary browser control, ATS submit authority, or permission beyond the Campaign snapshot.
- `mode=automatic` is rejected unless `campaign.automation.outreach.autoStartEnabled=true`. Use `mode=manual` only when the user explicitly asked to start/continue BOSS outreach in the current interaction.
- The bridge derives greeting/inbox/resume-followup permissions and the external-effect budget from the active Campaign; callers do not supply or widen these permissions.
- The dedicated browser may have broad DOM/tab/upload capabilities internally, but Job Harness controls it at business-task granularity.
- Stop/pause on login/challenge/human-required state; do not attempt to bypass platform verification.

## BOSS greeting workflow

When a BOSS Site Runtime task is running and a greeting request is waiting:

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

## Recruiting-email workflow

For a discovered Job whose verified public source contains a recruiting mailbox, first persist the Job/Listing normally. If `campaign.automation.email.draftEnabled` is false, stop after collection. If enabled:

```text
career_job_resume_recommend
  -> choose campaign.automation.email.preferredResumeProfileId when non-null, otherwise the recommended Profile
  -> write a truthful JD-specific subject/body
  -> career_email_application_prepare(jobId, recipient, preferredProfileId, subject, body, idempotencyKey)
```

`career_email_application_prepare` freezes recipient, generated copy, exact Resume Revision/PDF Artifact and `draftHash`; it does **not** send email. Do not claim an Application exists at this stage.

If `campaign.automation.email.sendEnabled` is false, stop with the durable draft package. If true, and only after re-reading the exact package/draft hash, call:

```text
career_email_application_authorize_send(
  packageId,
  draftHash,
  expiresInSeconds <= 300,
  idempotencyKey
)
```

This authorization is a bounded external effect because a configured Email Delivery Worker may immediately claim it and send the exact frozen email. The server independently rejects authorization when no active associated Campaign enables email sending. Never authorize a different draft, silently regenerate copy after authorization, or treat an authorization as proof of send. Provider Message-ID + durable confirmation remain the success boundary.

## External application workflow

Except for bounded BOSS greeting release and bounded email-send authorization, the MCP app itself **does not click or submit on recruiting sites**. Official-site preparation freezes a SubmissionIntent/Resume; the separate dispatcher/browser executor performs safe fill/upload, and final submit remains behind its own authorization boundary.

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
