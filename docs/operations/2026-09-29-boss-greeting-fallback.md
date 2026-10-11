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

### P1 — concurrent greeting resolver — implemented

The greeting protocol now has explicit short-lived single-writer leases. A resolver claims the oldest available request, receives an unguessable lease token, and must present that token to resolve. Another resolver cannot claim or resolve the same request while the lease is active. Provider failure may release the lease without sending anything. The lease never extends the original 35-second deadline, so deterministic fallback and policy-based skip remain the final safety net.

A provider-neutral independent worker entrypoint now exists at `apps/server/scripts/boss-greeting-resolver-worker.ts`. The production follow-up now uses a three-stage resolver order: a ready ChatGPT Web session gets a short interactive-priority interval, then the background OpenAI-compatible provider may claim the request, and the deterministic Job Harness fallback remains at the original 35-second deadline. Oracle2 is configured for Groq `qwen/qwen3.8-27b`; the private API credential is deployment state and is not committed to the repository.

### P1 — durable generation provenance — implemented

New BOSS `greeting_sent` outreach events now carry these fields in durable metadata:

- `runtimeTaskId`;
- `greetingRequestId`;
- `greetingGenerationSource` (`chatgpt-web-mcp`, `job-harness-fallback`, provider-specific source, etc.);
- `greetingResolutionReason` when applicable.

The runtime JSONL remains the fine-grained event log, while `job_outreach_events` now preserves the generation provenance needed for canonical Job-level audit.

## Production follow-up validation

The production follow-up was completed later on 2026-09-29:

- ChatGPT Web MCP now exposes `boss_greeting_resolver_ready`; production MCP catalog count is 51 tools.
- The interactive priority window is 10 seconds and the total greeting deadline remains 35 seconds.
- Groq `qwen/qwen3.8-27b` is the background provider through the OpenAI-compatible adapter.
- A container-local provider smoke completed in about 360 ms and produced a truthful `send` greeting from matched Vue3/TypeScript evidence.
- The Groq key is mounted from `/home/ubuntu/.config/job-harness/groq-api-key` as a read-only secret file rather than committed or passed in the service command line.
- `job-harness-boss-greeting-resolver-1` started successfully with zero restarts and reports provider `groq:qwen/qwen3.8-27b`.
- The BOSS Runtime remained paused/expired during validation, so these checks created no recruiter-facing external effects.

## Assessment

The safety and evidence path worked correctly. The incident exposed an orchestration/observability gap rather than a recruiter-facing correctness failure.
