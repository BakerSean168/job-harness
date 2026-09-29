# BOSS greeting fallback incident — 2026-09-29

## Summary

During the manually triggered BOSS outreach run `boss-runtime-30ff58bf-419c-4e4f-8557-60afa7daab8a`, the first eligible greeting for 鼎森电子科技 / 前端开发工程师 / 10-14K was not resolved by ChatGPT within the configured 35-second assistance window. Job Harness correctly used its deterministic role-aware fallback and sent the greeting successfully.

This was **not a model-generation latency incident**. The pending greeting had no concurrent ChatGPT resolver consuming it while the interactive ChatGPT session was occupied recovering and validating the Recruitment Browser runtime.

## Timeline (UTC)

- `03:55:18.769` — `greeting_requested`, request `0f367255-c7c3-4ebf-85c4-f1dce21db807`, score 63, selected profile `ai-frontend`.
- `03:55:53.806` — exactly ~35 seconds later, `greeting_assist_timeout_fallback` fired.
- Fallback copy: `您好，看到贵司的前端开发工程师岗位，项目和实践中涉及 TypeScript、Vue3，和岗位方向比较契合，希望有机会进一步沟通，谢谢。`
- `03:55:54.097` — greeting queued.
- `03:55:55.885` — message sent in BOSS chat.
- `03:55:56.021` — `greet_sent` recorded.

## Root cause

The current architecture exposes ChatGPT-assisted greetings as a bounded pending-request queue, but there is no independent concurrent resolver process attached to that queue.

The active ChatGPT session was performing operator work at the same time:

1. recovering the dedicated Recruitment Browser;
2. starting the self-updating Windows Supervisor;
3. validating BOSS runtime heartbeat and browser state;
4. checking that the campaign task had actually entered `running` / `ready`.

The session did not poll and resolve `/api/greetings/pending` until after the request had already expired. Therefore the 35-second timeout worked as designed and selected the deterministic fallback.

## Impact

- No duplicate outreach occurred.
- No incorrect Resume Profile was selected.
- No school/major information was injected into the greeting.
- The selected profile was `ai-frontend`.
- The message was sent once and durably recorded.
- The external-effect budget remained enforced by the BOSS runtime task.

## Durable Job Harness evidence

Canonical Job:

- Job ID: `0931ccd7-81c8-4256-9711-9f95e2c8a0de`
- Company: 鼎森电子科技
- Role: 前端开发工程师
- City: 深圳

Canonical Listing:

- Listing ID: `707e5741-a1b0-4fda-9e8c-b77507672493`
- Source: `boss`
- Label: `BOSS直聘`
- External BOSS job ID: `a9c56fe3cbee26981XF_3dS-EFBV`
- Score snapshot: 63 / threshold 58
- Recommended Resume Profile: `ai-frontend`

Durable Outreach Event:

- Channel: `boss`
- Type: `greeting_sent`
- Resume Profile: `ai-frontend`
- Actor: `system`
- Message: persisted verbatim
- Idempotency key: `boss-outreach:0931ccd7-81c8-4256-9711-9f95e2c8a0de:greeting_sent`

A BOSS greeting is intentionally **Outreach truth, not formal Application truth**. Job Harness must not create an `Application` / `ApplicationSubmission` solely because BOSS initiated a chat. Formal application state still requires concrete submit/resume-application evidence.

## Follow-up gaps

### P1 — concurrent greeting resolver

The ChatGPT-assisted greeting path should not depend on the same interactive session being free to poll within 35 seconds. Add a dedicated resolver orchestration path that can consume pending greetings concurrently while the operator session performs browser/runtime recovery or other work.

Requirements:

- preserve the 35-second bounded wait;
- preserve deterministic fallback when no resolver succeeds;
- preserve policy-based `skip` behavior;
- never create a second writer for the same greeting request;
- carry the exact resolver source into durable evidence.

### P1 — durable generation provenance

`job_outreach_events` currently records the BOSS channel, Job/Listing identity, selected Resume Profile, message and score, but does not persist the greeting request ID or whether the message came from ChatGPT vs deterministic fallback.

Add durable metadata such as:

- `greetingRequestId`;
- `greetingGenerationSource` (`chatgpt-web`, `job-harness-fallback`, etc.);
- optional resolution/skip reason.

The JSONL runtime log already contains this provenance, so this is a projection/durability gap rather than missing runtime evidence.

## Assessment

The safety and evidence path worked correctly. The incident exposed an orchestration/observability gap rather than a recruiter-facing correctness failure.
