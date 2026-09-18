# Job Harness engineering audit — 2026-09-17

Status: implementation audit before the final R019 live-submit validation.

Audit baseline:

- source: `da465e9` (`main` at audit start)
- runtime: Node 24 / TypeScript 5.9 / Next.js 16 / React 19 / Zod 4 / SQLite / Playwright / Manifest V3
- production schema: SQLite v11
- production state before this audit: 115 Jobs / 41 Applications / 41 ApplicationSubmissions / 0 SubmissionIntents / 0 ExecutionAttempts
- existing verification: 79 test files / 160 tests, TypeScript, boundary check, OpenAPI no-drift, Browser Bridge check, Web production build, deployment smoke, Playwright E2E

This review follows the reusable `engineering-guardrails` baseline plus the `typescript-fullstack-guardrails` supplement. The browser extension / operational scripts are additionally checked against `javascript-runtime-guardrails`.

## 1. Executive assessment

The current architecture is directionally strong and is **not** a monolithic copy of the retired application copilot. The highest-risk invariants are already explicit:

- Job Harness owns Career/Application/SubmissionIntent truth.
- ResumeRevision/Artifact and ApplicantProfile/AnswerSet revisions are immutable evidence at execution time.
- browser execution is behind ports and capability-scoped workers.
- the external submit boundary is durable, human-authorized and one-shot.
- a lost `begin-submit` response grants zero clicks.
- ChatGPT MCP contains no recruiting-site external-side-effect tool.
- SQLite migrations, foreign keys, idempotency and backup integrity have executable evidence.

No P0 correctness defect was found in the reviewed state. The remaining weaknesses are mostly **boundary trust, frozen-snapshot authority, configuration/runtime reliability, and engineering-governance ratchets**. They should be resolved before enabling a real submit-capable production adapter.

## 2. Source-of-truth and ownership audit

### What is already good

| Concept | Semantic owner | Projection / adapter | Assessment |
| --- | --- | --- | --- |
| Job / Listing / Application | Career domain + SQLite schema | REST/MCP/Web projections | Good |
| external application side effect | SubmissionIntent | ExecutionAttempt coordinates technical work only | Strong |
| browser execution state | ExecutionAttempt | Worker + BrowserBackend | Strong |
| Resume content | Resume Library/Profile | immutable ResumeRevision + Artifact | Strong |
| common candidate facts | ApplicantProfile | immutable ApplicantProfileRevision | Strong |
| recurring ATS answers | ApplicationAnswerSet | immutable AnswerSetRevision | Strong |
| final submit permission | ReviewSnapshot + SubmitAuthorization | Apply worker consumes once | Strong |
| ChatGPT workflow | MCP contracts | tunnel/custom app | Strong and intentionally non-submit-capable |

### Finding A1 — caller-owned snapshot identity leaks into dispatch contract (P1)

`DispatchExecutionAttemptInputSchema` still accepts `applicantCatalogVersion`, `answerSetVersion`, and `answerSetHash`. `createApplyBundleFactory()` uses those values as fallbacks when durable Applicant revisions are absent.

That is no longer aligned with the v11 ownership model. The control plane should be the only authority that derives applicant/answer snapshot identity from durable immutable revisions. A caller should request **an execution**, not tell the server what the frozen identity is.

Accepted failure mode today: production always has the Applicant store, so normal Web dispatch is not currently forging durable facts. The contract nonetheless permits an invalid future integration and weakens the stated invariant.

**Required change:** remove caller-controlled snapshot identity from the public dispatch schema and from `ApplyBundleFactoryPort`. Always derive it in the server composition/application adapter; if no durable snapshot exists, use null facts and let the lease-scoped applicant grant fail closed rather than accepting an asserted identity.

## 3. Trust-boundary audit

### Finding A2 — Steel provider responses are statically cast, not runtime-decoded (P1)

`packages/apply-browser/src/steel.ts` has a generic `requestJson<T>()` that parses arbitrary provider JSON and returns `data as T`. Session creation/list/context therefore trusts external runtime data only because TypeScript says it has a shape.

This conflicts with the project’s otherwise schema-first boundary style. A malformed or upgraded Steel response can become a partially trusted session record and fail later in unrelated browser code.

**Required change:** define strict runtime schemas for Steel health/session/list/context responses; make `requestJson` return `unknown`; parse at each provider adapter method. Keep session-context payload deliberately open only where Steel’s structure is provider-owned.

### Finding A3 — REST error envelope is only partially runtime-trusted on the client (P2)

Successful operation payloads are generally parsed through operation-specific Zod schemas, which is good. Error payloads are currently detected through `'error' in payload` and cast to `JobHarnessRestErrorPayload`; the shared REST contract schema also permits any string code.

**Required change:** introduce/derive a stable JSON-safe error envelope schema and parse it in the client. Full domain-specific error registry can remain a later refactor; do not duplicate every domain error immediately.

### Finding A4 — SQLite JSON is parsed generically in infrastructure (monitor, not immediate blocker)

Persistence helpers use generic `JSON.parse`/row casts. Most important rows are subsequently passed through domain/runtime schemas (`ExecutionAttemptSchema`, Resume schemas, Applicant schemas), so the unsafe parse is usually contained within the persistence adapter. This is acceptable as an infrastructure impedance boundary **only while every outward row mapper validates**.

**Guardrail:** add/retain tests proving malformed durable JSON fails rather than silently becoming a trusted domain value. Do not spread `json<T>()` results directly into application code.

## 4. Applicant data correctness audit

### Finding A5 — AnswerSet `valueType` does not constrain `value` shape (P1)

`ApplicationAnswerEntrySchema` validates `valueType` and `value` independently. It currently admits states such as:

```json
{ "valueType": "boolean", "value": "no" }
```

or a multi-choice type with a scalar. The downstream planner chooses browser behavior from `valueType`, while the resolver returns the literal value. This can turn a configuration mistake into a manual/incorrect form operation.

**Required change:** make AnswerSet entries a discriminated union or add exhaustive cross-field validation so boolean/number/multi-choice/scalar types match their literal values. Legal/protected answers stay literal-only.

### Finding A6 — `siteHost` is not canonicalized/validated as a host (P1)

`siteHost` is a free trimmed string and later compared with `new URL(listingUrl).hostname.toLowerCase()`. User-entered `https://jobs.example.com/`, a trailing dot, or whitespace/case variants can silently fail to scope the answer.

**Required change:** canonical hostname parser/normalizer at the AnswerSet boundary; store only lower-case hostnames without scheme/path/port. Reject URL-shaped or invalid host values instead of guessing.

### Finding A7 — frozen applicant catalog identity is derived but not asserted on read (P2)

The lease-scoped applicant grant recomputes `applicant-snapshot:<sha256>` from the frozen revisions. It validates individual revision hashes but does not explicitly assert that the recomputed catalog version equals the frozen ApplyBundle catalog version.

**Required change:** if a bundle carries a catalog version, require exact equality before exposing a catalog/value. This detects composition drift and makes the frozen identity executable.

## 5. State, transactions, concurrency, retry and idempotency

### What is already strong

- Career writes use SQLite transactions and durable idempotency receipts.
- Application stage read/check/write occurs inside `BEGIN IMMEDIATE`, serializing SQLite writers; it is not the classic unprotected read-check-write race.
- one active ExecutionAttempt per intent is backed by a partial unique index.
- worker leases store only the token hash and re-check ownership before writes.
- ReviewSnapshot and SubmitAuthorization are durable and tied to exact form state.
- the external-effect boundary is crossed before a worker receives one-click permission.
- lost-response semantics are explicitly tested: no successful boundary response => no click.
- stale post-boundary work moves to manual review rather than automatic resubmit.

### Finding A8 — provider/browser HTTP calls lack bounded request deadlines in some adapters (P1)

Steel HTTP calls use bare `fetch`, and the shared Job Harness REST client also has no default request deadline. A half-open connection can hold a worker cycle indefinitely; the worker’s retry/backoff loop cannot recover from a Promise that never settles.

**Required change:** add default bounded request timeout support to the REST client and Steel adapter, preserving any explicitly supplied caller signal. Long-running endpoints may override the default. Polling/stream-like calls must use a timeout longer than their server wait budget.

### Finding A9 — Steel persisted context/handoff corruption silently degrades to empty state (P2)

`readSavedContext()` and `readRetainedRecords()` catch all file/JSON failures and return `null`/`[]`. Missing files are normal, but corruption is different:

- corrupted saved context silently loses login/session state;
- corrupted handoff registry can prevent reaping retained sessions.

**Required change:** distinguish ENOENT from malformed/unreadable persisted state. Missing file => empty. Corruption => explicit error / degraded backend state, with no silent claim of normal operation.

### Finding A10 — browser extension bridge fetch can hang the MV3 run loop (P2)

`bridgeFetch()` has no deadline. If register/poll/result delivery hangs at the network layer, `loopRunning` remains true and subsequent alarms cannot recover the service worker loop.

**Required change:** bounded fetch signal per operation. Poll timeout must exceed `waitMs`; register/result use a shorter request budget.

## 6. Architecture and module boundaries

### What is already good

The R019 extraction follows a useful split:

```text
apply-contracts  <- no DOM / persistence
apply-core       <- deterministic planning/state helpers
apply-runtime    <- use-case orchestration through ports
apply-browser    <- browser backend/driver adapters
apply-adapters   <- site/form adapters
apply-worker     <- technical process using scoped REST authority
server           <- composition root / transports / concrete persistence wiring
```

Resume and Applicant are also split into contracts/application/persistence adapters instead of being embedded in the browser extension.

### Finding A11 — new Applicant layers are not covered by executable boundary rules (P2)

`check-boundaries.mjs` explicitly protects Apply packages, but the newly introduced Applicant packages have no corresponding dependency-direction assertions.

**Required change:** add checks that applicant-contracts cannot import persistence/server/transport; applicant-application cannot import SQLite/server/browser; persistence remains the adapter that depends inward on applicant application/contracts.

### Finding A12 — ApplyBundle factory depends on a concrete SQLite Resume store type (P2)

`createApplyBundleFactory()` is correctly located in the server composition layer, but its parameter type names `SqliteResumeStore` directly while Applicant already uses a read port. This unnecessarily couples the bundle adapter to one persistence implementation.

**Required change:** define a narrow `ResumeApplyEvidenceReader` interface containing only `getRevision/getArtifact` and accept that interface. No new generic repository abstraction is needed.

## 7. TypeScript / JavaScript implementation audit

### Finding A13 — strict compiler ratchet is available at zero migration cost (P2)

The base config has `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`, but not:

- `noImplicitReturns`
- `noFallthroughCasesInSwitch`
- `noUncheckedSideEffectImports`

A dry run over every workspace package/app passed all three flags with zero errors.

**Required change:** enable all three globally now, while the ratchet is free.

### Finding A14 — select values in Web components still use local casts (P3)

A handful of UI selects cast `event.target.value` into finite unions. The allowed options are rendered from closed values in most cases, so risk is low, but a reusable parser is safer where the value later drives a state mutation.

**Follow-up:** migrate high-value state-changing selects to runtime schema parsing as touched; no bulk rewrite required.

### Finding A15 — JavaScript browser bridge command envelope validation is distributed (P3)

The extension relies on the server’s authenticated/scoped command queue plus page-driver command rejection. This is already a strong authority boundary. The MV3 code itself could additionally use a small explicit command-envelope validator before dispatch, mainly for fault localization.

**Follow-up:** implement when extending the command set; not a blocker for R019.

## 8. Public failures and error mapping

### Finding A16 — server REST error mapping is duplicated across feature routers (P2)

`api.ts`, `resume-api.ts`, `apply-api.ts`, `applicant-api.ts`, browser bridge and validation each own a local `sendError` and repeat codes like `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`.

The behavior is currently readable, but adding domains increases drift risk.

**Required change:** first centralize the common envelope writer and Zod/internal-error mapping; keep feature-specific domain-error-to-status projection local or registered. Avoid a giant global exception hierarchy.

## 9. Delivery and provenance

### What is good

- CI has verify, deployment-image smoke, and browser E2E lanes.
- OpenAPI is generated and checked for drift.
- boundary and ChatGPT integration gates are executable.
- migrations are tested from old versions and production-shaped backups are taken before production upgrades.
- runtime/infra revisions are recorded separately.

### Finding A17 — CI verifies and rebuilds rather than promoting one immutable artifact (P3 / accepted for current scale)

The `verify` job proves source/tests; the `deployment` job independently builds Docker images. Production also rebuilds locally from a pinned source revision. This does not preserve one exact CI-built digest into production.

For a single-user self-hosted system this is an acceptable current tradeoff. Before Job Harness becomes multi-user/shared infrastructure, move toward build-once + immutable digest promotion and signed provenance.

## 10. Objective verification matrix

| Risk | Current evidence | Gap |
| --- | --- | --- |
| duplicate external submit | submit-runtime + submit-safety integration | live site canary still pending |
| lease loss/stale worker | Apply persistence/runtime tests | good |
| migration safety | v2-v11 longitudinal tests + production backup | good |
| response runtime trust | Job Harness client operation Zod schemas | Steel/provider boundary gap |
| Applicant immutable snapshot | v11 revisions + ApplyBundle hashes | caller identity fields / version assertion gap |
| legal/protected answers | explicit literal policy + no AI mapping | value/type and host validation gap |
| browser bridge authority | HMAC agent + worker lease + policy gate | network timeout only |
| module dependency direction | Apply executable boundary checks | Applicant checks missing |
| TS exhaustiveness | strict TS + schemas | three free compiler ratchets not enabled |
| production artifact identity | source revisions + local image | no exact CI digest promotion |

## 11. Implementation order

### Wave 1 — before any real submit-capable adapter

1. Remove caller-owned applicant/answer snapshot identity from dispatch.
2. Enforce AnswerSet value/type consistency and canonical site host.
3. Runtime-validate Steel provider responses and add bounded provider HTTP deadlines.
4. Add default REST-client deadline so worker/Web control-plane calls cannot hang forever.
5. Assert recomputed applicant snapshot version equals the frozen bundle value.
6. Make corrupted Steel context/handoff state fail observable instead of silently empty.
7. Add Applicant package dependency guards.
8. Enable `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`.

### Wave 2 — maintainability hardening

9. Centralize common REST error envelope serialization/parsing.
10. Add browser-extension network deadlines and explicit envelope validation.
11. Ratchet high-value UI union selects away from unchecked casts.

### Wave 3 — delivery maturity, only when scale warrants it

12. Build once in CI and promote immutable image digest to Oracle2.
13. Add stronger release provenance/signing if the system becomes shared/multi-user.

## 12. Completion criteria for this audit cycle

- Wave 1 changes implemented with regression tests.
- `pnpm check` green.
- migration remains v11 (no schema change needed for Wave 1).
- synthetic submit-safety proof remains one submit / zero duplicates.
- production counters unchanged after deployment.
- both Steel and Windows Chrome workers return `ready` after restart.
- ChatGPT MCP remains 32 tools with zero external-side-effect tools.
- this document is updated with implementation evidence and intentionally deferred findings.

## 13. Follow-up finding discovered while implementing Wave 1

### Finding A18 — MV3 page-driver errors can accidentally retry the browser action (P1)

While tracing the Browser Bridge delivery protocol for timeout hardening, the extension-side `executePageDriver()` revealed a subtle retry-boundary bug. The first `chrome.tabs.sendMessage()` and `unwrapPageDriverResponse()` are inside the same `try`. Therefore a **remote page-driver error returned after executing the command** is caught by the same branch intended only for a missing/replaced content-script receiver; the extension reinjects the driver and sends the page action a second time.

The server bridge itself does not redeliver an in-flight command, so this is an extension-local retry bug rather than a queue bug. It is especially important for click-like commands: retries may only cover failure to deliver to a receiver, never an application-level/page-driver failure after the command was accepted.

**Required change before real submit work:** separate transport delivery from response unwrapping. Retry one injection/send only when `sendMessage` itself rejects because the receiver is absent/replaced; unwrap the returned application result outside that retry catch so a page-driver failure is surfaced exactly once. Add a regression check and keep final submit outside the generic extension click command regardless.

### Finding A19 — production CLI environment parsing is fragmented rather than schema-owned (P2)

A post-fix audit of runtime boundaries found that production CLIs validate some values (ports, positive intervals, worker phase/backend enums) but still parse other environment values ad hoc. In particular, the Apply Worker accepts several URL/boolean/path settings through direct string operations and the server/renderer CLIs each implement their own partial parsing rules. These values are operational input and should be treated as untrusted configuration at process startup, not discovered later through a browser/fetch failure.

**Follow-up:** move each production process to one explicit runtime-config parser with strict booleans/enums, bounded integers and URL/origin validation. Fail startup with a configuration-specific error. This is P2 because current invalid configuration fails before an external submit boundary, but it is a reliability/operability gap worth closing before enabling submit-capable workers.

### Finding A20 — immutable Revision rows validate shape but not envelope/hash integrity on read (P1)

ResumeRevision, ApplicantProfileRevision and ApplicationAnswerSetRevision are treated as immutable execution evidence. Their schemas validate field shapes, but a persisted row can still contain an internally inconsistent envelope (for example `profileVersion` differing from `snapshot.version`) or a snapshot whose stored `contentHash` no longer matches its canonical content. SQLite `integrity_check` and foreign keys do not detect this semantic corruption.

This matters directly to Apply Executor safety because an execution freezes revision ids/hashes and later resolves actual applicant/Resume values from those revision snapshots. The read adapter must not silently trust a stale or corrupted immutable payload.

**Required change:** add cross-field revision invariants to contracts and verify canonical content hashes when immutable Resume/Applicant revisions are loaded from SQLite. Add tamper tests proving corrupted snapshot JSON is rejected before it can become execution data.

## 14. Implementation evidence — audit remediation

The audit was deliberately written before remediation. The following changes were then implemented on `refactor/jh-engineering-guardrails-audit` without enabling a live recruiting-site submit path.

### 14.1 Frozen ownership and Applicant correctness

**A1 / A5 / A6 / A7 / A12 — fixed.** Public ExecutionAttempt dispatch no longer accepts caller-provided applicant/AnswerSet snapshot versions or hashes. `ApplyBundleFactory` derives them only from durable immutable revisions. A single `applicantSnapshotVersion()` helper now owns the canonical profile -> Resume -> AnswerSet evidence ordering for both bundle creation and lease-scoped resolution.

This change surfaced a real latent mismatch: the former bundle and grant code built the same catalog digest in different evidence orders when more than one source was present. The grant now asserts the recomputed snapshot identity equals the frozen bundle identity, so a composition-order drift becomes a hard conflict rather than an invisible disagreement.

`ApplicationAnswerEntry` now rejects value/type mismatches (for example a string stored under `boolean`), validates email/URL literals, and requires site scope to be an already-canonical lower-case bare hostname. The settings UI parses finite unions through runtime schemas, coerces literal shape when the answer type changes, and normalizes the host draft before persistence.

`ApplyBundleSchema` also asserts that immutable evidence travels atomically: Applicant profile revision id/hash together, complete AnswerSet revision/version/hash together, and Resume Artifact revision equality. The bundle factory now consumes a narrow `ResumeApplyEvidenceReader` port rather than naming `SqliteResumeStore`.

Regression evidence includes new Applicant contract and ApplyBundle invariant suites plus an integration assertion that the lease-scoped catalog version is exactly the frozen bundle value.

### 14.2 Runtime trust and transport reliability

**A2 / A3 / A8 / A9 / A10 / A16 / A18 — fixed.** The Steel adapter no longer uses generic `requestJson<T>` assertions. Health, session lists/records and context payloads are decoded through explicit runtime schemas. Steel HTTP requests have a bounded default deadline, and malformed provider JSON is rejected at the provider boundary.

Persisted Steel context and retained-session registries now distinguish a missing file from corruption. `ENOENT` means no saved state; malformed or unreadable durable state is an operational failure instead of silently becoming an empty context/registry.

The shared Job Harness REST client has a bounded default request deadline and combines it with a caller-provided cancellation signal. Successful operation payloads still use operation-specific schemas; error payloads now use the canonical `RestErrorEnvelopeSchema` rather than an unchecked cast. Server feature routers share one common envelope/Zod/internal-error writer while retaining local domain-error-to-status mapping.

The MV3 Browser Bridge now bounds register/result requests to 15 seconds and long-poll requests to 30 seconds. It validates command agent, expiry and enabled command capability before page execution. Most importantly, page-driver response unwrapping was moved **outside** the one-time content-script delivery retry boundary. A page action accepted by the page driver is never replayed merely because that action reports an application error. A behavioral VM test proves one accepted error produces one send, while a missing receiver may retry delivery once.

### 14.3 Dependency direction and TypeScript ratchets

**A11 / A13 / high-value A14 / A15 — fixed for the audited surface.** `check-boundaries.mjs` now protects the new Applicant contracts/application packages in addition to Apply boundaries. The TypeScript base config globally enables:

- `noImplicitReturns`
- `noFallthroughCasesInSwitch`
- `noUncheckedSideEffectImports`

All workspaces passed these flags before they were made mandatory. Application-stage and Resume-header mutation selects now parse through runtime schemas instead of unchecked finite-union casts. The Browser Bridge has explicit local command-envelope validation in addition to its server-side HMAC-agent/ExecutionAttempt-lease/policy authorization.

### 14.4 Immutable evidence integrity

**A20 — fixed.** ResumeRevision, ApplicantProfileRevision and ApplicationAnswerSetRevision contracts now assert envelope/snapshot ids and versions agree. SQLite read adapters recompute the canonical content hash before returning immutable revisions. Raw SQLite tamper tests modify snapshot JSON while leaving the stored hash unchanged and prove reads fail before corrupted evidence can reach the Apply pipeline.

Before production deployment, the new read path was also run against the existing production database without exposing candidate values: **9 Resume Revisions + 1 ApplicantProfile Revision + 1 AnswerSet Revision all passed semantic hash verification**.

### 14.5 Startup configuration

**A19 — fixed.** Server, Apply Worker and Resume Renderer now have explicit runtime-config parsers. Ports/intervals use strict digit-only parsing instead of permissive `parseInt`; worker booleans accept only explicit `true`/`false`; URLs/origins are validated at startup; public server/renderer binds require their corresponding authentication tokens.

The worker additionally enforces operational cross-field constraints at startup: lease duration must remain inside the control-plane 30..300 second contract, attempt heartbeat must be shorter than its lease, executor heartbeat must remain below the server stale window, and extension command timeout must stay within the browser bridge contract.

### 14.6 Intentionally retained/deferred items

**A4 — retained as an infrastructure boundary with executable guards.** Generic JSON decoding remains inside selected SQLite/import adapters, but immutable/high-value rows are runtime-decoded before leaving persistence and now have semantic hash checks where they represent frozen evidence. It is not being replaced by a speculative generic serialization framework.

**A17 — intentionally deferred.** CI/prod do not yet promote one signed immutable image digest end to end. The current single-user self-hosted deployment records source/runtime revisions, builds from a pinned clean revision and performs production backups/health checks. Build-once digest promotion becomes worthwhile if Job Harness becomes shared/multi-user infrastructure; it is not required to unlock the current supervised personal workflow.

## 15. Post-remediation objective verification

Repository gate after remediation:

- `pnpm check`: **PASS**
- Vitest: **85 test files / 181 tests PASS**
- TypeScript with the new strict ratchets: **PASS**
- package boundary guard: **PASS**
- Browser Extension static/authority gate: **PASS**
- OpenAPI no-drift: **PASS**
- Next.js production build: **PASS**
- ChatGPT integration gate: **32 tools / 18 required workflow tools / 0 external-side-effect tools**

Synthetic supervised-submit proof also remains green after the changes: five safe fields filled, legal field left blank, exact PDF filename preserved, review-hash drift detected, and exactly **one** synthetic submit with one success reference. This remains synthetic evidence; it is not evidence that a live recruiting-site submit adapter is production-ready.

### Final audit position

No P0 defect was found. The P1 issues discovered by this review have been remediated in code and tests before any real submit-capable production adapter is enabled. The architecture remains appropriately separated:

```text
Career / Resume / Applicant truth
        -> SubmissionIntent
        -> immutable ApplyBundle evidence
        -> ExecutionAttempt lease/control plane
        -> BrowserBackend + SiteAdapter
        -> ReviewSnapshot
        -> explicit short-lived SubmitAuthorization
        -> one external-effect boundary
```

The principal remaining validation risk is now **site-specific behavior**, not a missing generic control-plane safety boundary. R019 should therefore continue with real-site pre-submit canaries and one explicitly user-authorized live submit canary rather than more generic framework expansion.

### Finding A21 — scan-generated DOM references can collide after dynamic insertion (P1)

A second pass over the deterministic browser-driver contract found that both the MV3 page driver and the Playwright driver assign missing control/action references from the element's **current array index** (`jh-${index}`, `jha-${index}`). Existing elements keep their previously assigned data attribute. On a dynamic SPA, inserting a new field/action before an already-scanned element can therefore assign the newcomer an id that is already retained by the old element. The resulting CSS selector matches more than one element, and the driver may write/click the first match rather than the originally classified element.

This is a deterministic-automation correctness bug, not a theoretical style issue. Recruitment forms frequently insert conditional controls after a previous answer.

**Required change before live form-fill promotion:** allocate document-scoped unique refs independent of current array position; preserve an existing ref only when it is unique, repair pre-existing duplicates, and keep radio-group ids unique per group. Add a live DOM mutation regression test proving insertion/reordering cannot create duplicate `controlRef` / `actionRef` values in either browser backend.

### Finding A22 — Browser Bridge result-ack transport failure is conflated with page-action failure (P1)

After separating page-action delivery from page-driver application errors, the result-return leg still has a second ambiguity. `executeEnvelope()` currently wraps both the page action and the `POST /results` acknowledgement in one `try/catch`. If the browser action succeeds, the server processes the success result, but the HTTP response is lost/times out, the extension enters the catch branch and attempts to report the **same executed command as a failure**. Conversely, if the first result POST never reaches the server, the extension does not have an idempotent retry contract for the success result.

This does not currently permit a final recruiting-site submit because the generic extension bridge has no final-submit command, but it can misclassify a successful fill/application-entry action and can encourage a later operator retry of a pre-submit side effect.

**Required change:** separate command execution from result delivery. Produce one immutable result record (`ok/result` or `ok=false/error`) exactly once, then retry only that result acknowledgement with the same `commandId`. Make the server result endpoint idempotently acknowledge duplicate delivery for a short bounded receipt window. Never re-execute the page action merely because result acknowledgement is uncertain.

### Finding A23 — post-boundary failure can mutate SubmissionIntent before lease authorization is proven (P1)

A control-plane ordering review found that `attempts.fail()` currently calls `intentSafety.markManualReview()` whenever the caller reports `externalEffectState !== not_crossed`, and only afterwards enters `requireLease()` for the ExecutionAttempt mutation. A scoped worker therefore can present a known `attemptId` plus an invalid/expired lease and still cause the business `SubmissionIntent` to move to manual review before the technical failure request is rejected.

This cannot cause an external site submit, but it violates the core authority invariant that an Apply Worker may mutate execution/business state only while it owns the current attempt lease. It can also create a false manual-review incident detached from a valid worker action.

**Required change:** prove the current lease before any business-side failure mutation. Add a regression test where a wrong lease reports `uncertain`: the request must fail with `LEASE_LOST`, the ExecutionAttempt must stay in its prior state, and the SubmissionIntent must remain unchanged. Keep post-boundary fail-closed behavior once lease authority is established.

### Finding A24 — safety-reconciliation persistence failures are intentionally suppressed but operationally invisible (P2)

Two recovery paths deliberately ignore errors from `intentSafety.markManualReview()`: abandoned post-boundary attempts discovered during claim, and a `beginSubmit` coordination failure after the SubmissionIntent has entered `external_in_progress`. Suppressing the secondary error is correct for duplicate-submit safety — the system must not turn a failed recovery write into permission to retry an external effect — but a bare `.catch(() => {})` makes the safety incident invisible to operators until a later stale-intent reconciliation happens to surface it.

**Required change:** preserve the fail-closed outcome while adding an explicit safety-persistence incident hook/structured log. The recovery call remains best-effort and must never authorize/retry a site action, but its failure must be observable with attempt/intent/reason metadata. Add tests proving the hook is invoked and that normal claim/submit behavior remains conservative.

### Finding A25 — generic failure reporting can self-declare the external-effect boundary (P1)

The same `attempts.fail()` review exposed a second state-machine gap: `FailExecutionAttemptInput` accepts an arbitrary `externalEffectState`, and the generic fail path writes that value directly. A valid pre-submit worker lease can therefore move an Attempt from `not_crossed` to `crossed` or `uncertain` without going through `ReviewSnapshot -> SubmitAuthorization -> begin-submit`.

This does not itself click a recruiting site, but it breaks the model's strongest invariant: **the irreversible boundary has one semantic owner**. It can create false post-submit/manual-review state and makes audit evidence ambiguous.

**Required change:** generic `fail` may preserve the Attempt's already-durable external-effect state, but it must never advance it. A caller-provided effect state must exactly match the current Attempt state; crossing remains owned exclusively by the authorized `begin-submit` transaction, and post-boundary outcome changes remain owned by the dedicated submit-success/submit-failure protocol. Add a regression test proving a valid pre-submit lease cannot report `crossed`/`uncertain` through generic failure.

### Finding A26 — reviewed form hash does not bind page identity, and submit resolution trusts the frozen listing URL rather than the live page (P1)

The submit-safety pass found that both browser backends currently hash only visible form controls/values. `ReviewSnapshot.formStateHash` therefore proves the reviewed **form values**, but not the URL/page identity on which those values existed. During authorized resume, `SubmitExecutionEngine` resolves the submit-capable adapter from the frozen Listing URL and calls that adapter against the retained live browser without first proving that the current page still belongs to that adapter. The extension driver's cached `currentUrl()` can also be stale after a user-controlled navigation during handoff.

A different page with an equivalent form shape/values could therefore reproduce the reviewed hash. No production adapter currently has `submit=true`, so this is dormant today, but it must be closed before a live submit adapter is promoted.

**Required change:** make form-state hashing include exact current page identity (at minimum `location.href`) so post-review navigation invalidates authorization. Refresh the extension driver's cached URL when computing that hash. Immediately before adapter submit, probe the **live** current URL with the already-selected/frozen adapter and reject any mismatch. Add regression tests for URL drift with unchanged form values and for a submit engine refusing a live page outside the adapter family.

### Finding A27 — reviewed adapter identity/version is not immutable across handoff/resume (P1)

The submit-path audit found that `ReviewSnapshot.siteAdapterId/siteAdapterVersion` are worker-provided but are not asserted against the adapter already bound to the `ExecutionAttempt`. On resume, `attempts.start()` can also overwrite `adapterId`, `adapterVersion`, and `browserBackend` even when the same retained browser session has already been inspected/reviewed. Finally, `SubmitExecutionEngine` resolves by adapter id but does not require the runtime adapter implementation version to equal the version that was bound/reviewed.

This permits a deploy or worker mismatch during a human-review window to submit with adapter code different from the implementation that produced the reviewed snapshot, weakening provenance and deterministic replay.

**Required change:** once an Attempt has a concrete adapter/backend binding, later starts must preserve the exact id/version/backend. ReviewSnapshot creation must match that binding. Immediately before submit, the resolved runtime adapter version must equal the frozen Attempt adapter version. Add regression tests for adapter-version drift at resume, mismatched review snapshots, and submit-engine runtime version drift.

### Finding A28 — submit permission has a small post-boundary TOCTOU window and the authorized-submit phase does not heartbeat its lease (P1/P2)

After binding the review hash to page identity, one final timing window remains: the worker computes `currentFormStateHash`, receives durable `begin-submit` permission, and only then resolves/probes/calls the submit adapter. A human-controlled tab can still mutate between those steps. The adapter-family probe catches cross-site drift, but same-family URL/form changes are not re-hashed after permission is granted. In addition, the authorized-submit path does not run the attempt heartbeat loop used by readiness/form-fill, so a slow retained-session reconnect or site confirmation can let the lease expire while a permitted external action is in progress.

**Required change:** carry the exact hash used for `begin-submit` into `SubmitExecutionEngine` and re-compute/compare the full URL+form hash immediately before calling the site adapter. After the boundary, drift must fail closed to the existing uncertain/manual-review path without clicking. Run the attempt heartbeat through the authorized-submit phase and surface heartbeat failure before the boundary whenever possible. Add a regression test proving post-boundary hash drift never reaches the submit adapter.

### Finding A29 — a few secondary HTTP/runtime boundaries still bypass the hardened client rules (P2)

The post-remediation trust-boundary scan found several smaller bypasses outside the primary REST/Steel path: Local CDP health uses an unbounded raw `fetch`, Resume Renderer health casts `response.json()` instead of decoding it, the shared REST client accepts an unvalidated base URL, and a handful of server-side Web/extension pairing calls use raw fetches without a bounded deadline. These paths are not external recruiting-site submit boundaries, but a half-open dependency or malformed private-service response can still hang UI/worker readiness or fail far from the actual boundary.

**Required change:** validate the shared REST base URL as HTTP(S), put Local CDP health behind a short deadline, runtime-decode the renderer health payload, and give the remaining Web/extension pairing/download bridge calls explicit request deadlines. Keep file-download streaming semantics intact; the timeout should bound connection/response establishment rather than reinterpret payload bytes.

## 16. Second-pass remediation evidence

A second deterministic-automation / submit-safety pass was executed after the first audit closure. Findings A21-A29 are now implemented before any production adapter is allowed to advertise `submit: true`.

### 16.1 Browser action identity and result transport

**A21 — fixed.** MV3 and Playwright drivers no longer derive persistent field/action refs from the current DOM index. They allocate document-scoped unique refs, preserve a ref only while it remains unique, repair collisions, and allocate radio-group refs independently. Live DOM mutation tests insert new controls/actions before previously scanned elements and prove old refs stay stable, every ref remains unique, and subsequent writes still reach the intended element.

**A22 — fixed.** Browser command execution now produces one immutable result record exactly once. Only result acknowledgement is retried after transport uncertainty. The Bridge keeps a bounded completed-result receipt window and idempotently acknowledges duplicate result delivery for the same agent/command id. Tests prove a lost first acknowledgement causes a result retry without re-executing the page action.

### 16.2 External-effect authority and safety observability

**A23 / A25 — fixed.** Generic attempt failure reporting now proves the active lease before any business-side mutation and cannot advance `externalEffectState`. The caller-supplied effect state must equal the already-durable Attempt state; only the dedicated submit-boundary protocol can move `not_crossed -> crossed`, and only dedicated submit outcome reporting can move to `uncertain`. Wrong-lease and forged-boundary REST regression tests prove SubmissionIntent and Attempt truth remain unchanged.

**A24 — fixed.** Best-effort manual-review recovery failures remain fail-closed but are no longer silent. `ApplyRuntimeOptions.onSafetyPersistenceError` emits structured incident metadata (`attemptId`, `intentId`, reason, operation, message); the server logs the incident without letting observability failure authorize or replay a site action. A runtime test proves the incident hook fires while claim behavior stays conservative.

### 16.3 Review provenance and last-moment submit validation

**A26 — fixed.** Both browser backends include the exact current `location.href` in the reviewed form-state hash. The Extension driver refreshes its cached URL when hashing. Before adapter submit, `SubmitExecutionEngine` refreshes the live URL and requires the frozen adapter to still support that page family. URL drift with unchanged form values now changes the review hash in both backends.

**A27 — fixed.** Adapter id/version/backend become immutable once an Attempt binds them. Human-review resume cannot silently switch adapter implementation or backend. `ReviewSnapshot.siteAdapterId/siteAdapterVersion` must exactly match the bound Attempt, and submit execution refuses a runtime adapter version different from the frozen reviewed version. Regression tests cover review mismatch, resume-time version drift and runtime submit-adapter drift.

**A28 — fixed.** The hash accepted by `begin-submit` is carried into the submit engine and re-computed immediately before the site adapter is called. Same-family page/form drift after permission therefore fails closed without invoking submit. The authorized-submit worker path now keeps the Attempt lease alive with the same bounded heartbeat discipline used by readiness/form-fill, and surfaces heartbeat failure before crossing the boundary whenever possible.

### 16.4 Remaining secondary HTTP/runtime boundaries

**A29 — fixed.** The shared REST client validates an HTTP(S) base URL up front. Local CDP health has a bounded request deadline. Resume Renderer health is runtime-decoded through a schema rather than statically cast. Raw server-side Web download/Bridge calls now bound response establishment without aborting a returned download stream later, and Browser Extension pairing has an explicit timeout. New tests cover invalid REST schemes, half-open Local CDP health and malformed renderer health payloads.

### 16.5 Final repository verification for this pass

- `pnpm check`: **PASS**
- Vitest: **87 test files / 195 tests PASS**
- TypeScript strict build: **PASS**
- package dependency guard: **PASS**
- Browser Extension authority/static gate: **PASS**
- OpenAPI no-drift: **PASS**
- Next.js production build: **PASS**
- ChatGPT integration: **32 tools / 18 required workflow tools / 0 external-side-effect tools**
- synthetic supervised submit: **PASS**, one submit action, one external reference, legal field left blank, exact PDF filename preserved, review drift detected

No production site adapter advertises `submit: true`; these changes harden the generic control plane and deterministic browser contract without enabling unattended external submission.

### Finding A30 — production image can lazily download pnpm at container startup (P1 deployment reliability)

The hardened image built successfully, but the recreated Web container exposed a deployment flaw that the source/test gates did not catch: its `pnpm ... next start` command entered Corepack's lazy-download path as the non-root runtime user (`Corepack is about to download ... pnpm-10.15.1.tgz`) and the service never reached its health endpoint. The build stage had prepared pnpm, but that does not guarantee the package-manager payload is present in the runtime user's Corepack cache. Production startup therefore depended on outbound npm availability even though the image had already been built.

**Required change:** make the runtime images contain an actual pinned pnpm executable/package available to the non-root user without network access, disable Corepack download prompts/fallback at runtime, and extend deployment-image smoke to prove `pnpm --version` plus service startup succeed with networking disabled. A built image must be self-contained at promotion time.

### Finding A31 — deployment smoke duplicated an obsolete schema-version constant (P1 delivery correctness)

While hardening the runtime image, the deployment smoke itself exposed a stale assertion: the script still requires `PRAGMA user_version === 6` even though the canonical persistence package is at schema v11. That duplicates migration truth outside the persistence owner and lets the deployment lane fail for a historical constant rather than the schema version the code actually supports.

**Required change:** resolve the expected schema version from `@job-harness/persistence-sqlite` inside the built image instead of hard-coding it in Bash/JavaScript. The same deployment smoke should also execute `pnpm --version` for server and renderer images under `--network none`, so runtime package-manager availability is proven independently of npm/network access before Compose startup.

### 16.6 Deployment image self-containment and schema-source cleanup

**A30 — fixed.** Runtime and renderer images now install the pinned `pnpm@10.15.1` package into the image itself rather than relying on Corepack to hydrate pnpm after container start. Runtime download prompts are disabled, and the image build verifies pnpm as the non-root runtime user. Deployment smoke additionally runs both built images with `--network none` and requires `pnpm --version` to succeed before Compose is started. This reproduces and closes the production Web startup failure that originally exposed the flaw.

**A31 — fixed.** Deployment smoke no longer duplicates a historical SQLite schema number. It resolves `SQLITE_SCHEMA_VERSION` from the built `@job-harness/persistence-sqlite` package and compares the durable database `PRAGMA user_version` against that canonical value after restart. The current canonical schema is v11, but the smoke now follows the semantic owner automatically instead of embedding `6` in delivery code.

Validation evidence for the final deployment-image pass:

- `pnpm check:deployment`: **PASS**
- Bash syntax validation: **PASS**
- `job-harness:audit` with `--network none` -> `pnpm 10.15.1`: **PASS**
- `job-harness-renderer:audit` with `--network none` -> `pnpm 10.15.1`: **PASS**
- full isolated Compose deployment smoke: **PASS**
- renderer/API/Web health ordering: **PASS**
- authenticated persistence + PDF materialization/download: **PASS**
- server restart + durable Saved View/Artifact verification: **PASS**
- post-restart database schema comparison against canonical `SQLITE_SCHEMA_VERSION`: **PASS**

## 17. Oracle2 production rollout evidence — 2026-09-18

The hardened runtime was promoted from the exact images that passed the isolated deployment smoke rather than rebuilt after acceptance:

- Job Harness server/Web image: `sha256:bf3565ba96970fdadda6c9c336613f9e59c5c8c0323fc1535e9a23c79791cf5f`
- Resume Renderer image: `sha256:bd0564e59233b940ae6166664995199967ced921100f87a3f28a6d003fa63e61`
- runtime source revision represented by those images: `af034c6`
- Browser Bridge source release after hardening: `0.1.1` (`4f6dd55`)

Production renderer, API and Web all returned healthy after forced recreation. Their startup logs contain no Corepack runtime-download prompt. Both form-fill executors were restarted from the hardened source and returned `ready`; both remain `fill_only` with no submit capability. ChatGPT MCP smoke returned 32 tools, all 18 required workflow tools present, 0 SubmissionIntents and 5 Resume Profiles. The dedicated ChatGPT tunnel verifier also passed its control-plane poll and `/readyz` check.

The production database remained at schema v11 with `PRAGMA integrity_check = ok` and no foreign-key violations. Applications / ApplicationSubmissions / SubmissionIntents / ExecutionAttempts remained `41 / 41 / 0 / 0`. The Job count changed from the pre-rollout backup's 115 to 133 during the rollout window; inspection showed an independent `chatgpt-web` daily DiscoveryRun (`f75646ef-eecb-4cd0-9d7e-4dfc85d305d1`) started at `2026-09-18T00:44:40Z` and durably inserted exactly 18 discovered jobs. Those concurrent Career writes were preserved and were not rolled back as deployment noise.

The user's unpacked Windows Browser Bridge source directory was also synchronized byte-for-byte for the hardened `background.js`, `page-driver.js` and `options.js`, with `manifest.json` advanced to 0.1.1. The currently running Chrome extension agent still advertised 0.1.0 at the immediate post-sync check, so a Chrome extension reload remains an explicit rollout gate before relying on the client-side A21/A22/A29 hardening in a real-browser canary. This does not expose a live final-submit path: production site adapters remain `submit: false`.

### Finding A32 — submit-authorization actor provenance is caller-asserted instead of authority-derived (P1 audit correctness)

The authorization boundary correctly requires the global/user bearer and rejects the scoped worker bearer, but `AuthorizeSubmitInput` still lets that caller choose `actor: user | system`. The runtime then persists the supplied label into the immutable `SubmitAuthorization` and includes it in the idempotency request hash. A user-authorized HTTP request can therefore claim it was issued by `system`, making the audit trail less trustworthy even though it does not widen execution permission.

**Required change before live-submit promotion:** remove `actor` from the public authorization request and derive `actor = user` inside the user-authorized control-plane path. If a future internal/system authorization workflow is ever introduced, give it a separate authority path rather than reusing a caller-selectable label. Update OpenAPI/client/Web/tests so actor provenance is owned by the server boundary.

### 17.1 Submit-authorization provenance follow-up

**A32 — fixed.** `AuthorizeSubmitInput` no longer exposes an `actor` field. The only current public/user-authorized control-plane path derives and persists `actor = user` server-side; the idempotency request hash likewise excludes any caller-asserted actor label. A future system authorization, if ever required, must use a separate authority path rather than impersonating provenance through the same request contract.

Regression evidence now proves the scoped worker bearer still cannot authorize, a global caller attempting to send `actor: system` is rejected as a strict validation error, and a valid authorization is persisted as `actor: user`. OpenAPI/client/Web were regenerated/updated from the canonical contract. The full repository gate remains green at **87 test files / 195 tests**, with production Web build and synthetic one-submit safety smoke passing.

### 17.2 A32 production promotion

The A32 authority-derived actor change was built into `job-harness:a32`, passed the same isolated Compose deployment smoke and offline-pnpm runtime check, then promoted as the production server/Web image without rebuilding. Production server/Web now run image `sha256:209a896ce397d72c3eec932d1d95831376aa484a367777fab45e6c044eeef672`, representing runtime source revision `389ca71`; the renderer remains on the previously accepted image because A32 does not touch renderer code.

Post-promotion verification: server/Web healthy, no runtime Corepack download, both Apply executors `ready` and `fill_only`, MCP 32 tools / all required tools present / 0 SubmissionIntents, SQLite v11 integrity OK with 133 Jobs / 41 Applications / 41 ApplicationSubmissions / 0 SubmissionIntents / 0 ExecutionAttempts, and the dedicated ChatGPT tunnel verifier passed.

### Finding A33 — reviewed form hash does not bind uploaded file bytes (P1 immutable-evidence correctness)

The URL+form review hash now catches navigation and ordinary field drift, but file inputs are still represented by `element.value` (normally a browser fake path such as `C:\\fakepath\\resume.pdf`). Replacing the uploaded Resume with different bytes under the same filename can therefore preserve the reviewed hash even though `ApplyBundle` and ApplicationSubmission are intended to prove the exact immutable Resume Artifact that was sent.

**Required change before live-submit promotion:** include every selected file's content SHA-256 plus stable metadata in the browser form-state material for both MV3 and Playwright drivers. Review, begin-submit and the final post-boundary re-check must therefore fail if uploaded bytes change, even when filename/MIME type remain identical. Add cross-backend regression tests that replace a PDF with different bytes under the same filename and require the hash to change.

### 17.3 Uploaded-file evidence follow-up

**A33 — fixed.** MV3 and Playwright form-state hashing now represents file inputs as selected-file metadata plus a SHA-256 over the exact file bytes. The reviewed hash therefore binds the actual Resume payload rather than only the browser fake path/filename. A cross-backend regression test constructs two PDFs with identical filename, MIME type, size and `lastModified` metadata but different bytes; both backends produce the same hash for the same document and a different hash after the byte-only replacement.

The Browser Bridge release is advanced to 0.1.2 for this client-visible contract change. Full verification remains green at **87 test files / 196 tests**, strict TypeScript, Browser Extension guard, production Web build and the synthetic one-submit safety smoke.

### Finding A34 — submit authorization can be issued outside the supervised-submit policy boundary (P1 authorization correctness)

The generic submit-safety protocol previously bound an authorization to an exact ReviewSnapshot/hash, but the authorization service did not itself require `executionMode = review_then_submit`, `policySnapshot.submitAllowed = true`, or `ReviewSnapshot.summary.readyForSubmit = true`. A fill-only Attempt could therefore hold a syntactically valid ReviewSnapshot and receive a submit authorization even though the execution policy never enabled an external side effect. This had not produced a production submit because every live adapter still advertised `submit: false`, but it was an incorrect control-plane invariant.

**A34 — fixed.** `authorizeSubmit` now requires a supervised-submit Attempt, an explicit frozen `submitAllowed: true` policy, a ready ReviewSnapshot, a pre-submit `waiting_for_user` state, and `externalEffectState = not_crossed`. `beginSubmit` independently re-validates the supervised mode, policy and ready snapshot before moving the business SubmissionIntent into `external_in_progress`. The Web UI only exposes authorization for the same supervised policy boundary, while prepared-intent dispatch defaults to `fill_only` and can select `review_then_submit` only when a compatible executor explicitly advertises that mode. A regression test proves a fill-only Attempt cannot receive authorization even if a forged/otherwise-ready snapshot says `readyForSubmit = true`.

### Finding A35 — adapter/runtime drift is detected after begin-submit instead of before it (P1 side-effect boundary correctness)

The worker already re-checked adapter version, live URL and form-state hash immediately before invoking a site adapter, but that check lived inside `SubmitExecutionEngine.execute()` after the durable `begin-submit` permission call. An adapter version/capability drift could therefore consume the authorization and mark the external-effect boundary crossed before the worker discovered that it must not click.

**A35 — fixed.** `SubmitExecutionEngine.preflight()` now performs the complete read-only submit eligibility check — concrete submit-capable adapter, frozen adapter version, retained live URL family and current form-state hash — before `begin-submit`. Only that verified hash is sent to the control plane. After the durable boundary is crossed, `execute()` repeats the same checks and compares the form-state hash again immediately before the unique site submit action, retaining the existing TOCTOU protection. A worker-level regression test proves adapter version drift fails before `begin-submit` is called.

### 17.4 Real-site adapter promotion boundary

Observed production-site families are now explicit instead of falling through only to the generic ATS adapter:

- `zhilian-ats` recognizes current `zhaopin.com/jobdetail/*.htm` formal-application pages and the `立即投递` action.
- `liepin-ats` recognizes current `liepin.com/job/<id>.shtml` formal-application pages and distinguishes `投简历` from the separate `聊一聊` action.
- `boss-outreach` recognizes current BOSS job/company pages but is intentionally registered as `outreach`, not `formal_application`; its immediate-contact flow is not allowed to reuse the formal submit contract.

All three remain `submit: false`. In particular, the public 智联/猎聘 call-to-action may use a site-stored resume rather than exposing an upload of the exact frozen Job Harness PDF. The adapter is not promotable to `submit: true` until a logged-in real-browser canary proves the submitted artifact can be bound to the immutable Resume Artifact (or a separate, equally strong external-resume evidence contract is designed). This preserves the A33 exact-file guarantee instead of weakening it for convenience.

The Apply Worker now contains a dormant supervised-submit runtime switch, `JOB_HARNESS_APPLY_ENABLE_SUPERVISED_SUBMIT=true`. It is honored only in `form-fill` phase and is **off by default**. When off, production executors continue to advertise only `fill_only`; enabling the code in a deployment therefore does not itself enable an external recruiting-site submit path.

Verification after A34/A35 and the site-adapter pass:

- `pnpm check`: **PASS**
- Vitest: **87 test files / 201 tests PASS**
- strict TypeScript: **PASS**
- Browser Extension bridge/static gate: **PASS**
- OpenAPI no-drift: **PASS**
- Next.js production build: **PASS**

### Finding A36 — browser action discovery misses custom recruiting-site controls (P1 real-site compatibility)

The first two logged-in Zhaopin canaries (英维克 `AI应用工程师` and 深度制耀 `AI全栈工程师`) both reached the real job-detail page with `externalEffectState = not_crossed`, but `scan_actions` reported no apply CTA even though the page contained application-related DOM structure. Read-only characterization showed the Browser Bridge only treated `a[href]`, `button`, and `[role=button]` as actions. Modern recruiting sites can attach JavaScript listeners to `div`/`span` controls without using those semantic tags, so the adapter could incorrectly classify a real page as requiring an opaque human entry step.

**A36 — fixed.** Both MV3 Browser Bridge and Playwright/Steel action discovery now include visible custom interaction candidates only when they carry explicit interaction evidence (`onclick`, non-negative `tabindex`, or `cursor:pointer`) together with bounded action-like semantics (`apply`, `deliver`, `submit`, `chat`, `btn`, `button`, `action`, or the corresponding Chinese application/contact text). Standard anchors/buttons retain their previous behavior, candidates are deduplicated before stable `data-job-harness-action-id` allocation, and oversized non-action containers are excluded.

This change widens **read-only discovery only**. It does not widen browser write authority: the server-side extension bridge still independently gates every `click`, and Zhaopin remains unable to receive an automated click until a characterized site-specific entry/submit policy is explicitly implemented. Browser Bridge manifest version is advanced to **0.1.3**. A regression fixture proves a custom pointer-style `<div class="job-apply-trigger">立即投递</div>` is discovered as `tag=other` while stable action references remain intact.

Verification after A36:

- `pnpm check`: **PASS**
- Vitest: **87 test files / 201 tests PASS**
- strict TypeScript: **PASS**
- Browser Extension bridge/static gate: **PASS**
- OpenAPI no-drift: **PASS**
- Next.js production build: **PASS**

### Finding A37 — Zhaopin existing application relation is not reconciled from the live CTA (P1 duplicate-application safety)

After Browser Bridge 0.1.3 widened read-only action discovery, the logged-in 深度制耀 `AI全栈工程师` canary exposed a standard enabled `button` whose exact text is `继续沟通`. Job Harness had no local `Application` for that Job, so the previous generic preflight treated the page as a normal `job_detail` and could later retry a role that Zhaopin already considered applied/contacted. This is a cross-system ledger gap: local absence of an Application is not proof that the recruiting site has no existing application relation.

**A37 — fixed.** Preflight now treats an enabled exact `继续沟通` or `已投递` action as `submitted_state` **only on `zhaopin.com` hosts**, returning `submitted_state_requires_reconciliation` before any application-entry or submit path. The signal is intentionally not generalized to other ATS sites, where a chat action may have unrelated semantics. `zhilian-ats` is advanced to `2026-09-18.2`. Regression coverage proves the same `继续沟通` action remains an ordinary job-detail signal on a generic non-Zhaopin host.

This finding also establishes a product requirement for future source-of-truth convergence: Browser-observed existing-application evidence should be reconciled into the durable Job/Application ledger instead of silently retrying or merely stopping forever. Until that reconciliation write path is implemented, duplicate prevention takes priority and the attempt stops without external side effects.

### Finding A38 — hidden resume inputs and Nowcoder final-submit semantics block exact-artifact automation (P1 live-submit readiness)

The first logged-in Nowcoder canary for 中城交（上海）科技有限公司 / `Agent开发工程师` proved that `立即申请` is a reversible application-entry action rather than the final side effect. The resulting modal exposes `选择投递简历`, the currently selected site resume, and a distinct final `投递简历` button. The modal also contains a hidden PDF file input that the old control scanner excluded because it required every form control to be visibly rendered.

A read-only/write-safe canary injected the exact frozen ForgeFlow Resume Artifact (`SHA-256 97677f49760fb7cffda6f4a9a436b2bbd3295588e3f72f2052826c4f5fd6764c`) into that hidden PDF input without clicking final submit. Nowcoder accepted the file and started its resume parser. The browser `formStateHash` remained stable at `843d43d5adde809599af76792cb03e40c69dca8a8efdae558f2583b8418e1f96` while binding the exact uploaded bytes, directly validating the A33 evidence model on a real recruiting site.

**A38 — fixed/promoted for supervised Nowcoder submit.** MV3 and Playwright control discovery now allow an otherwise-hidden file input only when it is enabled and carries document/resume evidence such as PDF/DOC, resume/CV/upload/file or 简历/附件 semantics; ordinary hidden controls remain excluded. `nowcoder-ats` deterministically binds the unique resume-document input to `documents.resume`, marks a review submit-ready only when that exact field was filled from the frozen Resume Artifact, and is promoted to `submit: true` at adapter version `2026-09-18.3`.

The characterized final action is exact enabled text `投递简历`. The Browser Extension server policy still denies that click before the durable external-effect boundary. It becomes legal only when the Attempt is `review_then_submit`, frozen policy has `submitAllowed=true`, a submit authorization is attached, and `beginSubmit` has already durably moved `externalEffectState` to `crossed`. This remains separate from the pre-submit `立即申请` entry permission.

A previously applied Nowcoder job was then sampled read-only and exposes exact button text `继续沟通`. Preflight now treats that signal as an existing/submitted application state only on Nowcoder hosts. The Nowcoder submit adapter clicks `投递简历` exactly once and records success only if the characterized post-submit `继续沟通` / `已投递` / `已申请` state is observed. If the confirmation state is absent, it returns `uncertain` rather than inventing success or retrying the click.

Browser Bridge is advanced to **0.1.4** for hidden resume-input discovery. Production's supervised-submit environment switch remains **off by default**; this code promotion alone therefore cannot trigger recruiting-site final submission.

Verification after A37/A38:

- `pnpm check`: **PASS**
- Vitest: **89 test files / 208 tests PASS**
- strict TypeScript: **PASS**
- architecture/package boundaries: **PASS**
- Browser Extension bridge/static gate: **PASS**
- OpenAPI no-drift: **PASS**
- Next.js production build: **PASS**

### Finding A39 — file-only application forms must not resolve an empty applicant-data key set

The first production `review_then_submit` Nowcoder canary reached the characterized resume-only modal and exposed a runtime contract mismatch before any external side effect: `fillGenericForm` always called the lease-scoped Applicant Data resolver even when every instruction was `attach_file`, producing `resolveApplicantData([])`. The resolver correctly rejects an empty key array, so the Attempt failed closed with `externalEffectState=not_crossed` and no submit authorization.

**A39 — fixed.** File-only fill plans now skip literal Applicant Data resolution entirely and use the already-frozen plan catalog version with an empty resolved-value set. A dedicated regression proves a resume-only form performs exactly the artifact upload without invoking `resolve()` at all. Mixed/text forms preserve the existing catalog-version guard.

Post-fix verification: `pnpm check` **PASS**, Vitest **89 files / 209 tests PASS**, strict TypeScript/OpenAPI/package boundaries/Browser Bridge checks and Next.js production build all PASS.

### Finding A40 — Nowcoder live modal exposes two hidden upload inputs; resume binding needs a site-specific primary-slot invariant

The second supervised live canary reached Review safely but reported `fieldCount=3`, `bindingCount=0`, `filled=0`, `readyForSubmit=false`. A retained-session control snapshot showed the real Nowcoder modal contains one ordinary search field plus **two** hidden document inputs with equivalent accepted extensions. Their generated semantic hints were `jsAttachUpload1_<dynamic>` and `jsAttachUpload2_<dynamic>`. The previous "unique resume file input" invariant therefore failed closed as designed.

A scoped live probe uploaded the exact frozen ForgeFlow Resume Artifact only to the `jsAttachUpload1_*` control. Nowcoder immediately changed the selected resume label to `卢楼豪-AI Agent应用开发工程师-ForgeFlow版` and started its resume parser (`大模型正在为您解析简历…`). The second input was not touched. This establishes `jsAttachUpload1_*` as the characterized primary resume slot for the observed Nowcoder modal family.

**A40 — fixed.** `nowcoder-ats@2026-09-18.4` now deterministically binds `documents.resume` to exactly one file field whose semantic hint matches `^jsAttachUpload1_`. The older unique-resume-input fallback remains only for structurally simpler Nowcoder variants. When two document inputs exist and no single characterized primary slot can be identified, the adapter still returns no binding and cannot become submit-ready. A regression fixture with both `jsAttachUpload1_*` and `jsAttachUpload2_*` proves only the primary slot is selected.

The manually probed Attempt was cancelled with `externalEffectState=not_crossed` and is explicitly ineligible for reuse as submit evidence. A fresh `2026-09-18.4` Attempt must produce the final ReviewSnapshot from an untouched automated run.

### Finding A41 — Nowcoder ReviewSnapshot was frozen before asynchronous resume parsing settled

The first user-authorized live Nowcoder submit canary failed closed during `submit-review-verify`: the retained page's current `formStateHash` no longer matched the authorized ReviewSnapshot, so `beginSubmit` returned a conflict before the external-effect boundary and **no final site click occurred**. The Attempt remained `externalEffectState=not_crossed`; the application ledger stayed unchanged.

Inspection of the live behavior showed the ReviewSnapshot had been created immediately after the exact Resume Artifact upload while Nowcoder was still displaying `大模型正在为您解析简历…`. Nowcoder asynchronously uploads/parses the selected resume and may rebuild its hidden file input afterwards. The generic hash correctly detected that DOM/FileList change, but the review was frozen too early.

**A41 — fixed in `nowcoder-ats@2026-09-18.5`.** The Nowcoder adapter now has a site-scoped `settleReviewState` hook. After deterministic resume upload, it waits for the parser signal to disappear and remain absent across consecutive samples before validation and ReviewSnapshot hashing. No global form-hash semantics were relaxed, and other ATS adapters do not inherit this hook.

### Finding A42 — known pre-boundary submit-review conflicts should terminate immediately and revoke stale authorization

The same live canary exposed a control-plane cleanup issue: a known 409 `Current form state no longer matches the authorized ReviewSnapshot` was logged by the Worker but left the Attempt `running` until its lease expired. This was safe but operationally noisy, and the abandoned Attempt retained an active authorization record until manually revoked.

**A42 — fixed.** The Worker now recognizes only that exact typed 409 conflict as a known pre-boundary stale-review result and reports `submit_review_stale` immediately. Ambiguous network/lost-response failures retain the existing conservative lease-expiry behavior because the durable boundary might have crossed without the response arriving. Separately, generic terminal failure handling now revokes any still-active SubmitAuthorization while `externalEffectState=not_crossed` before marking the Attempt failed, preventing stale authorization residue.
