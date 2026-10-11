# BOSS Copilot compatibility runtime

This integration intentionally preserves the mature BOSS-specific automation from the retired `job-application-copilot` project while Job Harness owns applicant data, Resume Profiles, scoring, deduplication and records.

## Production shape

```text
Dedicated Edge/Chrome profile
  -> unpacked Job Harness BOSS Copilot compatibility extension
     -> proven legacy BOSS search/detail/chat/resume DOM workflow
        -> Job Harness BOSS Outreach Bridge
           -> ApplicantProfile / ResumeProfile ranking / DiscoveryRun / Job + Listing + OutreachEvent
```

The dedicated browser is isolated from the user's normal browser profile and exposes localhost CDP for debugging only. The compatibility extension is built from `../boss/legacy-copilot.user.js`; it does not require Tampermonkey. A tiny MV3 background transport exposes the old `GM.xmlHttpRequest` / `GM_xmlhttpRequest` contract to the copied script and permits requests only to `https://oracle.taile92a8e.ts.net:10444`. This avoids public-page -> Tailnet Private Network Access/CORS restrictions without restoring a general-purpose network proxy. The legacy script also retains a normal CORS `fetch` fallback for non-extension embedding.

## Start on Windows

The production path is now the self-updating Recruitment Browser Supervisor under `integrations/recruitment-browser/windows`. It distributes the complete BOSS extension bundle, reuses the existing BOSS profile during migration, and starts/restarts the dedicated browser without a manual extension reload. The older launcher remains a bootstrap/recovery fallback:

```powershell
.\windows\start-boss-copilot.ps1
```

The fallback launcher prefers Edge, falls back to Chrome, stores the persistent profile at:

```text
%LOCALAPPDATA%\JobHarness\BossCopilot\Profile
```

and loads the unpacked extension from `extension/`. Before launch it refreshes only the generated `boss-copilot.js` runtime from the Tailnet bridge and validates expected markers before atomically replacing the local copy; if the bridge is temporarily unavailable it keeps the last known-good local runtime. Pass `-SkipRuntimeSync` to suppress that refresh. Manifest/background/shim changes still require updating the extension bundle itself.

The page overlay still starts paused when no Job Harness Site Runtime task exists, so the fallback remains usable manually. Under the production Supervisor, the userscript polls coarse `runtime-control` state: a running task starts the existing Copilot loop, a paused task pauses it, and no per-click DOM commands are introduced. Each task also has a bounded server-side TTL (one hour by default), and a live BOSS login/security-challenge page automatically pauses an active task instead of trying to work through platform verification. The Job Harness bridge supplies current target roles, scores every job across active Resume Profiles, returns the selected BOSS resume index and policy-gates greeting/inbox/resume follow-up plus the per-run external-effect budget. Every inspected BOSS detail is normalized into the canonical Job/Listing ledger; `greet_sent`, recruiter reply, resume send, and previously-contacted evidence are recorded as durable `JobOutreachEvent` rows rather than being misrepresented as formal Application submissions.

First-contact copy is normally generated in the ChatGPT control plane rather than stored as one fixed greeting. For jobs that pass the outreach threshold, the bridge creates a short-lived `chatgpt-assisted` greeting request containing the current JD plus a privacy-reduced view of the selected Resume Profile. If ChatGPT does not resolve it before the bounded deadline, the bridge may use the existing truthful deterministic fallback so an authorized automatic run does not stall. That fallback is still blocked if the Runtime has been paused, the Campaign disables greeting, or the task's external-effect budget is exhausted.

Control endpoints used by the ChatGPT/operator loop are split into coarse Runtime control and greeting resolution:

```text
GET  /api/runtime/descriptor
GET  /api/runtime/health
GET  /api/runtime/control
GET  /api/runtime/events
POST /api/runtime/tasks/start
POST /api/runtime/tasks/:taskId/pause

GET  /api/greetings/pending
POST /api/greetings/resolver-ready
POST /api/greetings/claim
POST /api/greetings/:requestId/release
POST /api/greetings/:requestId/resolve
```

Start/pause is business-task control. The browser still executes the mature upstream-derived search/detail/chat/resume state machine locally. Runtime start derives permissions from Campaign `automation.outreach`; callers cannot widen them in the request.

Greeting resolution is leased. An interactive ChatGPT Web session may first call `POST /api/greetings/resolver-ready` to announce bounded readiness. Greeting requests created during that readiness receive a short interactive-priority interval; background resolver claims are withheld during that interval. After it expires, the background provider may claim the same request. Any resolver then calls `POST /api/greetings/claim` with an owner and bounded lease duration, receives one request plus an unguessable lease token, and must include that token in `resolve`. A second resolver cannot claim the same request while the lease is active. A failed provider can release the lease without sending anything so another resolver may retry before the original deadline. The lease never extends the overall greeting deadline.

The resolver supports two outcomes. Use `{ "action": "send", "leaseToken": "...", "message": "...", "source": "chatgpt-web" }` to return a single 12-320 character greeting. Use `{ "action": "skip", "leaseToken": "...", "reason": "...", "source": "chatgpt-web" }` when the JD has a core requirement that the real Resume evidence does not support; the bridge then returns a below-threshold compatibility decision so the legacy runtime moves on without contacting the recruiter. A late `send` is revalidated against the current Runtime state and can be converted into a policy skip after pause/expiry/budget exhaustion. `JOB_HARNESS_BOSS_GREETING_WAIT_MS` controls the bounded greeting wait, `JOB_HARNESS_BOSS_GREETING_THRESHOLD` defaults to `58`, and `JOB_HARNESS_BOSS_RUNTIME_TASK_TTL_MS` defaults to one hour. Early-career campaigns also fail closed on explicit 3+ year minimum-experience requirements before a greeting request is created.

`apps/server/scripts/boss-greeting-resolver-worker.ts` is the provider-neutral independent worker entrypoint. Its preferred mode is now the built-in OpenAI-compatible HTTP provider, configured with `JOB_HARNESS_BOSS_GREETING_PROVIDER_KIND=openai-compatible`, `..._BASE_URL`, `..._API_KEY`, `..._MODEL`, and optional `..._SOURCE`. This covers Groq/DeepSeek/OpenAI/OpenRouter/GLM-style Chat Completions endpoints without adding an SDK dependency. The worker still supports `JOB_HARNESS_BOSS_GREETING_PROVIDER_KIND=command` plus `JOB_HARNESS_BOSS_GREETING_RESOLVER_COMMAND` as an extension point. In either mode it claims one request, resolves under the lease, and releases the lease on provider failure. It refuses to start when the selected provider lacks required credentials; Job Harness does not invent an LLM provider or silently substitute an unrelated credential.

Use `apps/server/scripts/boss-greeting-provider-smoke.ts` to validate provider auth, model name, structured output, and latency without creating a BOSS runtime task or sending any recruiter-facing message. Oracle2 currently uses Groq with `qwen/qwen3.8-27b` as the background fallback after the ChatGPT interactive-priority interval; deterministic Job Harness copy remains the final 35-second fallback.

## Compatibility boundary

The following legacy browser behavior is intentionally retained rather than rewritten:

- keyword rotation and search-page traversal;
- BOSS job card/detail extraction;
- first-greeting chat creation;
- cross-tab search/detail/chat coordination;
- unread recruiter-message scanning;
- BOSS resume chooser handling;
- resume-sent detection and retry behavior.

The following old ownership is not restored:

- stale `profile-bundle.json` or copied applicant values;
- the old standalone companion server / ledger as source of truth;
- LLM multi-turn recruiter chat;
- automatic portfolio sending;
- automatic rejection messages.

The original browser-provider sources are preserved under `legacy/` for behavioral reference and fallback, but production scoring/configuration comes from Job Harness.

## Build

```bash
pnpm build:boss-copilot-compat
pnpm check:boss-copilot-compat
```

Do not edit `extension/boss-copilot.js` by hand; it is generated from the canonical vendored userscript.
