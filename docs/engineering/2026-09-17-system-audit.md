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
