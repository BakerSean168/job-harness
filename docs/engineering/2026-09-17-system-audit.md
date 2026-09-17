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
