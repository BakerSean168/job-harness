# Apply Executor architecture and migration plan

Status: **R019 design frozen for implementation**, revised 2026-09-17 after open-source benchmark.

Benchmark: `docs/execution/apply-executor-benchmark.md`.
Legacy compatibility baseline: `docs/execution/legacy-copilot-baseline.md`.

R018 legacy discovery convergence is complete. R019 must now turn the useful browser-automation pieces of `job-application-copilot` into a replaceable execution capability without importing its old ledger, resume ownership or monolithic browser logic into Job Harness.

## 1. Architectural goals

R019 has six hard goals:

1. Job Harness remains the canonical Career control plane and durable source of truth.
2. Browser execution can run on Oracle2, a user's real Chrome, or another future worker without changing Career domain code.
3. Adding a new ATS/platform is an adapter/playbook addition, not a cross-cutting rewrite.
4. Known sites run deterministically and model-free wherever practical; AI is a bounded fallback.
5. External submit is at-most-once by protocol: crashes, lease expiry and network loss cannot justify a blind second click.
6. The old `job-application-copilot` is strangled gradually behind contracts and characterization tests; no wholesale copy/paste migration.

Non-goals for R019:

- turning Job Harness into a general browser-agent framework;
- bypassing CAPTCHA, MFA, account locks or site anti-abuse controls;
- moving browser cookies/passwords into Job Harness;
- treating every BOSS greeting as a formal Application;
- exposing a ChatGPT MCP tool that can directly trigger a recruiting-site side effect;
- adopting Temporal, Skyvern or Stagehand as a mandatory runtime dependency before the lightweight architecture proves insufficient.

## 2. Problems in the previous R019 draft

The first draft had the right ownership direction but its executor boundary was too coarse:

```text
ApplyExecutorPort
  health()
  capabilities()
  execute(intentId)
  cancel?(intentId)
```

`execute(intentId)` hides too much. It collapses queue ownership, worker leasing, browser session management, platform routing, form interpretation, value resolution, review, submit and outcome verification into one black box. That would make the next ATS or browser backend expensive to add and would make crash recovery hard to reason about.

The revised design introduces explicit layers and durable execution attempts while keeping the existing `SubmissionIntent` business lifecycle.

## 3. Ownership map

```text
                              Job Harness control plane
┌─────────────────────────────────────────────────────────────────────┐
│ Career domain                                                        │
│ Company / Job / Listing / Observation                                │
│ Application / ApplicationSubmission                                  │
│ Resume Profile / Revision / immutable Artifact                       │
│ SubmissionIntent  <---- one intended real-world application          │
│                                                                     │
│ Apply orchestration                                                  │
│ ExecutorRegistration                                                 │
│ ExecutionAttempt / ExecutionEvent                                    │
│ ReviewSnapshot hash / SubmitAuthorization                            │
│ ExecutionQueuePort                                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ pull / claim / heartbeat / report
                               v
                        Apply Worker process
┌─────────────────────────────────────────────────────────────────────┐
│ Worker loop + lease                                                   │
│ AdapterRegistry                                                       │
│ SiteAdapter             ApplicantDataProvider                         │
│ FormEngine              EvidenceCollector                             │
│ BrowserBackendRegistry                                                │
└───────────────┬──────────────────────┬───────────────────────────────┘
                │                      │
        BrowserBackend          Site / ATS Adapter
     Steel / local CDP /       BOSS / Workday / Moka /
     extension bridge          Greenhouse / generic ATS
                │                      │
                └──────────────┬───────┘
                               v
                       external recruiting site
```

### 3.1 Durable ownership

Job Harness owns:

- Job/Listing identity and target URL;
- immutable Resume Revision/Artifact identity and hash;
- SubmissionIntent and its confirmed external evidence;
- execution attempts, lease state and sanitized progress events;
- review fingerprint and submit authorization state;
- final Application/ApplicationSubmission reconciliation;
- user-visible executor status projection and audit timeline.

Job Harness does **not** own:

- browser cookies or raw session storage;
- recruiting-site passwords;
- CAPTCHA/MFA secrets;
- a second copy of the old Copilot job ledger;
- arbitrary mutable Resume PDFs inside the executor.

Browser/session credentials remain in the browser backend or OS-local secret store. Candidate application values may be supplied by a local `ApplicantDataProvider`; Job Harness stores field keys/hashes and provenance as needed, not raw secrets merely for executor convenience.

## 4. Core domain split: Intent versus Attempt

### 4.1 `SubmissionIntent` remains the business aggregate

Existing schema-v7 `SubmissionIntent` continues to answer:

> “Do we intend to submit this specific Job/Listing with this Resume evidence, and what is the externally verified result?”

Its current lifecycle remains the authoritative external-effect lifecycle:

```text
planned
  -> external_in_progress
  -> external_confirmed
  -> committed

recovery:
  persistence_pending
  external_failed
  needs_manual_review
```

Do not turn this into a worker queue state machine.

### 4.2 New `ExecutionAttempt` is technical execution state

One intent may have more than one *technical* attempt because a browser can crash before reaching the irreversible boundary. This does **not** permit more than one external submit.

Proposed state:

```text
ExecutionAttempt
  id
  intentId
  executorId
  adapterId
  adapterVersion
  browserBackend
  executionMode: fill_only | review_then_submit | auto_submit
  state: queued | claimed | running | waiting_for_user | completed | failed | cancelled | abandoned
  leaseOwner
  leaseExpiresAt
  lastHeartbeatAt
  checkpoint
  externalEffectState: not_crossed | crossed | uncertain
  policySnapshotJson
  bundleHash
  reviewHash?
  submitAuthorizationId?
  errorCode?
  errorSummary?
  startedAt?
  completedAt?
  createdAt
  updatedAt
```

`ExecutionEvent` is append-oriented:

```text
ExecutionEvent
  id
  attemptId
  sequence
  type
  occurredAt
  checkpoint?
  payloadJson   # sanitized; no cookies/passwords/raw resume values
```

Representative event types:

- `attempt_claimed`
- `browser_session_ready`
- `listing_opened`
- `form_inspected`
- `fields_filled`
- `resume_attached`
- `validation_failed`
- `review_ready`
- `human_action_required`
- `submit_authorized`
- `submit_triggered`
- `external_success_observed`
- `external_failure_observed`
- `external_result_uncertain`
- `attempt_completed`

### 4.3 Why Attempts are separate

This separation fixes several problems:

- executor crashes no longer mutate the business meaning of SubmissionIntent;
- multiple workers can be coordinated with a lease without adding worker states to Career domain enums;
- adapter/browser versions are audit history, not intent identity;
- a pre-submit technical attempt can be safely replaced while a post-submit uncertain attempt cannot;
- Web UI can show operational progress without deriving it from generic application notes.

## 5. Pull worker, leases and recovery

Job Harness is the control plane. Executors are workers that **poll** for work rather than exposing arbitrary inbound HTTP endpoints.

This follows the durable-worker model used by systems such as Temporal while remaining lightweight in v1.

### 5.1 Worker protocol

```text
worker starts
  -> register executor descriptor
  -> heartbeat capabilities/status
  -> claim compatible queued attempt
  -> receive attempt-scoped capability token
  -> heartbeat lease + checkpoint while running
  -> report waiting/completed/failure/evidence
  -> claim next work
```

Advantages:

- a Windows/local-browser worker can sit behind NAT without an inbound route;
- Oracle2 Steel and local Chrome workers can coexist;
- backpressure is natural: a worker polls only when it has capacity;
- worker outage leaves durable queued state in Job Harness;
- task routing can use adapter/browser capabilities;
- adding a Temporal-backed `ExecutionQueuePort` later does not change adapter contracts.

### 5.2 Lease rules

Recommended initial defaults, configuration-backed rather than hard-coded:

- lease TTL: 90 seconds;
- worker heartbeat: 20 seconds;
- executor considered stale after 60 seconds without registration heartbeat;
- one active lease per Attempt;
- one active Attempt per SubmissionIntent unless the previous attempt is terminal or explicitly abandoned by recovery policy.

Lease expiry behavior is controlled by `externalEffectState`:

- `not_crossed`: attempt may be abandoned and safely requeued if the adapter declares its pre-submit steps resumable;
- `crossed`: never automatically re-dispatch the external submit;
- `uncertain`: force `SubmissionIntent.needs_manual_review` or adapter-specific evidence recovery; no new submit authorization.

A queue retry is therefore **not** synonymous with retrying the recruiting-site submit.

## 6. Executor registration and capability routing

`ExecutorRegistration` is operational metadata, not Career business truth.

Descriptor:

```text
executorId
name
version
hostLabel?
status: ready | busy | degraded | login_required | human_action_required | offline
browserBackends[]
adapterIds[]
executionModes[]
capabilities:
  resumeUpload
  humanControl
  persistentSession
  screenshots
  semanticMapping
maxConcurrency
lastHeartbeatAt
metadata   # sanitized runtime info only
```

Routing uses required capabilities from the Attempt plus user preference. It must fail closed when no compatible worker is ready.

The old `SubmissionIntent.executor` enum remains backward-compatible provenance/request metadata. Actual worker identity lives on `ExecutionAttempt.executorId`; do not overload the old enum with concrete machine identities.

## 7. Browser backend is independent from site adapter

The historical Copilot already has useful `SteelProvider` and `LocalCdpProvider` abstractions. Those are extracted/refined, not rewritten into ATS code.

### 7.1 `BrowserBackendPort`

Conceptual contract:

```ts
interface BrowserBackendPort {
  readonly id: string;
  describe(): BrowserBackendDescriptor;
  acquire(input: BrowserSessionRequest): Promise<BrowserSessionPort>;
}

interface BrowserSessionPort {
  readonly sessionId: string;
  readonly humanControlUrl?: string;
  driver(): Promise<BrowserDriverPort>;
  persist(): Promise<void>;
  release(): Promise<void>;
}
```

Initial implementations:

- `steel` — Oracle2 managed/persistent browser sessions;
- `local-cdp` — user-owned Chrome via CDP;
- later `extension` — normal Chrome via a local bridge/native messaging.

The WebExtension path should not require every site adapter to know Chrome extension message formats. Its transport implements the same browser-driver capability surface.

### 7.2 Deterministic driver plus optional semantic layer

Keep two interfaces rather than making every browser action an LLM call:

```text
BrowserDriverPort
  navigate / locate / read / fill / select / click / upload / screenshot / wait

SemanticBrowserPort?   # optional capability
  observe / classify / extract / actAtomic
```

Known adapters use `BrowserDriverPort`. Semantic operations are only fallback tools.

## 8. Site adapter protocol

Replace opaque `execute(intentId)` with an inspectable lifecycle.

```ts
interface ApplySiteAdapter {
  readonly id: string;
  readonly version: string;
  readonly capabilities: AdapterCapabilities;

  probe(ctx: ApplyContext, browser: BrowserDriverPort): Promise<AdapterProbe>;
  inspect(ctx: ApplyContext, browser: BrowserDriverPort): Promise<FormIR>;
  fill(ctx: ApplyContext, browser: BrowserDriverPort, plan: FillPlan): Promise<FillReport>;
  validate(ctx: ApplyContext, browser: BrowserDriverPort): Promise<ReviewSnapshot>;
  submit(ctx: ApplyContext, browser: BrowserDriverPort, permit: SubmitAuthorization): Promise<SubmitObservation>;
  verify(ctx: ApplyContext, browser: BrowserDriverPort, observation: SubmitObservation): Promise<SubmissionEvidence>;
  recover?(ctx: ApplyContext, browser: BrowserDriverPort, attempt: AttemptSnapshot): Promise<RecoveryDecision>;
}
```

Important invariants:

- `probe`, `inspect`, `validate`, and `verify` are observational;
- `fill` may mutate form fields but must not cross the final submit boundary;
- only `submit` may trigger the real application side effect;
- `submit` requires a valid one-time authorization;
- `verify` must not convert absence of an error into success;
- adapter code never writes Career SQLite directly.

### 8.1 Adapter routing ladder

```text
1. exact deterministic site/ATS adapter
2. validated ATS playbook
3. generic deterministic form engine
4. bounded semantic field mapper
5. human handoff
```

No full autonomous browser-agent loop is the default path.

## 9. Form engine: pure IR, plans and value separation

The largest maintainability improvement is to stop mixing DOM details with candidate data.

### 9.1 Pure core

New DOM-free concepts:

```text
FormIR
  pages[]
  sections[]
  fields[]

FieldIR
  id
  type
  label
  description?
  required
  options[]
  semanticHints[]
  sensitivityHint?

FieldBinding
  fieldId
  applicantKey
  confidence
  source: playbook | rule | semantic | user

FillInstruction
  fieldId
  applicantKey
  method
  expectedReadBack

FillPlan
  bindings[]
  pending[]
  prohibited[]
```

CI must enforce that the pure form/planning package does not import `document`, `window`, `HTMLElement`, Playwright or Steel.

### 9.2 Applicant data provider

Candidate values do not belong inside SiteAdapter.

```ts
interface ApplicantDataProviderPort {
  catalog(): Promise<ApplicantFieldCatalog>;       // keys/types/sensitivity, no values
  resolve(keys: readonly ApplicantFieldKey[]): Promise<ResolvedApplicantValues>;
}
```

Initial providers may include:

- Resume-derived facts from Job Harness;
- compatibility adapter over the existing local extension Profile V2 for non-resume application fields;
- future encrypted/private application-answer store.

The compatibility provider is intentionally temporary. It lets us migrate execution without pretending the old browser profile bundle is a new Job Harness domain.

### 9.3 Privacy and sensitive values

Field mapping and value resolution are separate:

```text
page metadata + field catalog names
        -> matcher / optional AI
        -> applicant field keys
        -> local deterministic value resolver
        -> browser fill
```

The optional AI mapper receives labels/options and canonical field keys, **not the values** for protected fields.

Work authorization, sponsorship, legal attestations, EEO/self-identification, identity-document fields and other configured sensitive categories are literal-only. They are never generated from an LLM. Unknown required sensitive fields become `waiting_for_user`.

## 10. ATS playbooks versus custom adapters

Do not create a large TypeScript class for every minor ATS variation.

Introduce versioned `ATSPlaybook` data for repeatable form mappings/actions:

```text
playbook id/version
host/detection rules
field selectors/signatures
page transitions
fill methods
option mappings
resume upload rule
validation rules
confirmation signals
fixture version
```

Use a code adapter only when the site has a meaningful state machine or behavior that cannot be expressed safely as data, e.g. Workday account/application stages or BOSS platform-specific flows.

Playbook tests run against sanitized fixtures. A playbook is not promoted to autonomous submit capability merely because structural fixture tests pass; real-site verification remains separate evidence.

## 11. Determinism ladder and AI boundary

Use the same rule throughout R019:

```text
known selector/state machine       -> deterministic code
known ATS with variations          -> playbook
unknown field semantics            -> bounded semantic mapper
unknown flow / unsupported control -> human
```

If Stagehand or another semantic browser layer is added later, it implements `SemanticBrowserPort`; it does not become the application-domain orchestrator.

AI may:

- classify a page field into a canonical applicant key;
- extract a bounded page signal;
- propose a free-text answer grounded in Resume/JD facts when policy allows.

AI may not:

- create a new legal/personal fact;
- choose a different Resume Artifact after the Attempt bundle is frozen;
- approve its own changed Review unless policy explicitly delegates that gate;
- click submit outside the SubmitAuthorization path;
- convert an ambiguous post-submit page into success.

## 12. Frozen Apply Bundle

Before a worker starts filling, Job Harness produces a stateless immutable `ApplyBundle`:

```text
intentId
attemptId
jobId
listingId
listingUrl
company/title/city snapshot
resumeProfileId?
resumeRevisionId?
resumeArtifact:
  id
  sha256
  byteSize
  mimeType
  short-lived download grant
applicantCatalogVersion
answerSetVersion/hash?          # when a durable answer store exists
policySnapshot
createdAt
bundleHash
```

The executor never asks “what is the latest Resume now?” after the bundle is created. If the user wants a different Resume, create/replace the planned Intent/Attempt before submission rather than mutating evidence underneath a running attempt.

### 12.1 Artifact access

Do not give a browser extension the global `JOB_HARNESS_AUTH_TOKEN`.

Claiming a task returns an attempt-scoped, expiring capability token. That token may access only:

- its Attempt heartbeat/report endpoints;
- the exact Resume Artifact bound to the ApplyBundle;
- the exact completion/failure endpoints for that Attempt.

It cannot enumerate all Resume data or mutate arbitrary Jobs/Applications.

## 13. Two-gate external-submit protocol

R017 already provides the first durable gate: `SubmissionIntent.prepare` freezes the intended target/evidence before browser work.

R019 adds a second, later submit gate.

### 13.1 Gate A — preflight / intent

Must exist before browser work:

- concrete Job and Listing;
- selected immutable Resume evidence when required;
- execution policy/mode;
- planned external target URL;
- ApplyBundle hash.

### 13.2 Review Snapshot

After filling but before Submit, adapter validation creates a redacted snapshot:

```text
required fields satisfied/pending
canonical field keys used
hashed read-back values for protected/private fields
non-sensitive visible values when policy permits
uploaded Artifact id + content hash
current URL / ATS stage
validation findings
page/form fingerprint
adapter id/version
bundleHash
```

Raw passwords, cookies, bearer tokens and unnecessary PII are never included.

### 13.3 Gate B — one-time `SubmitAuthorization`

Authorization binds at minimum:

```text
intentId
attemptId
listing identity/url hash
bundleHash
resume artifact hash
reviewHash
policyHash
expiresAt
oneTimeAuthorizationId
```

Authorization can be issued by:

- human review in `review_then_submit` mode;
- deterministic policy in `auto_submit` mode only for an adapter/site explicitly enabled by the user.

Immediately before the adapter triggers submit, Job Harness atomically consumes the authorization and marks the Attempt `externalEffectState=crossed` / intent in progress. A consumed authorization cannot be replayed.

If the click occurs and verification is inconclusive, outcome is **uncertain**, not retryable failure. No fresh submit authorization is issued automatically.

## 14. Evidence model

A successful external submission requires affirmative evidence, for example:

- explicit confirmation page text + URL;
- ATS application/reference ID;
- specific success network response when stable and safe to observe;
- site status page showing the application;
- user confirmation tied to the Attempt;
- optional sanitized screenshot artifact/hash.

`SubmissionEvidence` is typed and sanitized. “No visible error” is not evidence.

Initial R019 can continue storing structured evidence in the existing `SubmissionIntent.externalEvidence`. A generic content-addressed evidence-artifact store for screenshots can be added after the protocol is proven; it is not required to block the first cut.

## 15. BOSS semantics must be split

The historical project currently mixes:

- BOSS discovery/search;
- job scoring/screening;
- first greeting;
- resume sending/chat behavior;
- old ledger writes.

R019 must not call all of that “Apply Executor”.

Target split:

```text
BOSS Discovery Adapter
  search / inspect JD / scoring input
  -> DiscoveryRun / JobObservation / JobAssessment later

BOSS Outreach capability
  greeting/chat/resume send
  -> not automatically an ApplicationSubmission

BOSS Application Adapter
  only when the platform exposes concrete submit/application semantics
  -> SubmissionIntent protocol
```

If a greeting + resume action is the platform-specific application equivalent, the adapter must still verify a concrete platform state before Job Harness confirms an ApplicationSubmission. A greeting event alone does not count.

## 16. Proposed monorepo structure

Do not dump legacy files under `apps/web` or `apps/server`.

```text
packages/
  apply-contracts/          Zod DTOs: executor, attempt, FormIR, FillPlan, review/evidence
  apply-core/               pure DOM-free planning, routing policy, state helpers
  apply-runtime/            worker orchestration, adapter registry, queue/lease ports
  apply-browser/            BrowserBackend ports + Steel/local-CDP/extension connectors
  apply-adapters/           adapter SPI, ATS playbook interpreter, site adapters

apps/
  apply-worker/             poll/claim/heartbeat/execute composition root
  server/                   control-plane REST, persistence composition
  web/                      Executor/Automation workspace projection
```

The exact package count may be collapsed if implementation proves two packages have no independent boundary, but dependencies must flow inward:

```text
apply-core <- apply-contracts
apply-runtime -> core/contracts ports
apply-browser -> browser infrastructure only
apply-adapters -> core/contracts + browser ports
apply-worker -> composition of runtime + adapters + browser + REST client
```

Forbidden dependencies should be added to `check:boundaries`, including:

- pure `apply-core` importing DOM/Playwright/Steel;
- adapters importing SQLite implementation;
- browser backends importing Career persistence;
- Web code importing legacy Copilot runtime files.

## 17. REST/control surface

Executor control plane is REST, not MCP.

Suggested endpoints (names may be normalized during contract implementation):

```text
GET  /api/v1/executors
POST /api/v1/executors/register
POST /api/v1/executors/:executorId/heartbeat

GET  /api/v1/execution-attempts
GET  /api/v1/execution-attempts/:attemptId
POST /api/v1/execution-attempts                 # dispatch from prepared intent
POST /api/v1/execution-attempts/claim
POST /api/v1/execution-attempts/:id/heartbeat
POST /api/v1/execution-attempts/:id/waiting
POST /api/v1/execution-attempts/:id/review
POST /api/v1/execution-attempts/:id/authorize-submit
POST /api/v1/execution-attempts/:id/complete
POST /api/v1/execution-attempts/:id/fail
POST /api/v1/execution-attempts/:id/cancel

GET  /api/v1/execution-attempts/:id/resume-artifact
```

The ChatGPT custom MCP app keeps its current zero-external-side-effect property. It may inspect Intent/Attempt state and prepare durable intent data, but no MCP tool is added whose invocation dispatches or submits a real application.

## 18. Web workspace

Add a `投递自动化 / Executors` workspace as a projection over durable Intent/Attempt state.

It should show:

- executor cards: status, version, host label, browser backend, supported adapters, human-control URL when active;
- queues: planned/queued, running, waiting for user, uncertain/manual review, recently completed;
- target Job/Listing and exact Resume Revision/Artifact;
- execution mode and policy snapshot;
- current checkpoint, lease/heartbeat age and adapter/browser version;
- redacted Review summary;
- sanitized evidence and final reconciliation state.

Controls:

- dispatch a prepared Intent;
- cancel before the external boundary;
- open human-control browser;
- acknowledge/resume after human action;
- approve Review / issue submit authorization;
- retry **local reconciliation** after external confirmation;
- never show a generic “retry submit” button once `externalEffectState` is `crossed` or `uncertain`.

## 19. Migration strategy: strangler, not copy/paste

### Phase R019-A — characterize and freeze

No behavior cutover yet.

- freeze current legacy commit/hash and runtime inventory;
- add characterization tests for existing field scan/fill, resume upload, Steel session persistence and BOSS auth/search behavior;
- record upstream MIT provenance/NOTICE for OpenJobAutofill-derived code;
- explicitly label old ledger/profile-bundle/application-cache paths as compatibility ownership only.

### Phase R019-B — control-plane contracts

- SQLite schema v8 for ExecutorRegistration, ExecutionAttempt and ExecutionEvent;
- contracts/application service/REST/client;
- lease CAS rules and crash/recovery tests;
- Web Executor workspace reads real state but no live browser worker yet;
- add boundary checks.

### Phase R019-C — worker and browser runtime extraction

- create `apps/apply-worker`;
- refactor existing SteelProvider and LocalCdpProvider behavior behind BrowserBackendPort;
- worker register/claim/heartbeat;
- non-destructive browser readiness proof;
- no submit capability yet.

### Phase R019-D — form engine and compatibility data provider

- extract/rebuild legacy scanner/filler behind FormIR/FillPlan contracts;
- use characterization fixtures to prove behavior parity rather than copying `content.js` wholesale;
- retain MIT notice for code that is genuinely moved/derived;
- add compatibility ApplicantDataProvider over current Profile V2;
- Resume PDF is fetched only from immutable Job Harness Artifact grant;
- default execution mode `fill_only`.

### Phase R019-E — adapter/playbook registry

- generic ATS playbook interpreter;
- first deterministic adapters chosen from actual user traffic, not an artificial list;
- BOSS-specific code split into discovery/outreach/application semantics;
- every adapter/playbook has sanitized fixture contract tests;
- unknown site falls back to generic mapper or human, never silent submit.

### Phase R019-F — supervised real submit

- ReviewSnapshot + hash;
- one-time SubmitAuthorization;
- `review_then_submit` mode;
- typed success/failed/uncertain evidence;
- crash matrix proves no duplicate submit;
- one explicitly user-authorized live end-to-end proof.

### Phase R019-G — optional autonomous policy

Only after supervised evidence is healthy:

- per-site opt-in `auto_submit` policy;
- no global auto-submit default;
- hard stops remain for CAPTCHA/MFA/account lock/new sensitive required answers;
- adapter must be explicitly marked `autonomousSubmitVerified` from real-site evidence.

### Phase R019-H — legacy retirement

After cutover proof:

- extension `applications[]` becomes local display/cache only or is removed;
- remove writes to `/api/ledger/*`;
- old Job Ledger stays archived/read-only, not live runtime state;
- packaged Resume bundle no longer controls uploads;
- retire old BOSS companion endpoints that duplicate Job Harness/worker contracts;
- archive `job-application-copilot` repository/runtime once the final needed browser components have a tested replacement.

## 20. Testing and acceptance gates

### 20.1 Pure unit/contract tests

- Attempt state machine and lease CAS;
- queue claim compatibility routing;
- one active Attempt per Intent invariant;
- submit authorization hash binding/expiry/one-time consumption;
- sensitive field policy;
- FormIR classifier and FillPlan builder;
- adapter registry conflict/fail-closed rules.

### 20.2 Browser fixture tests

For each adapter/playbook:

- inspect sanitized HTML fixture;
- build canonical FormIR;
- fill synthetic profile;
- read back actual DOM state;
- attach synthetic PDF and verify file hash/name policy;
- stop at Review by default;
- verify confirmation fixture separately.

Fixture evidence must be labeled as fixture evidence, never live reliability.

### 20.3 Browser backend contract tests

Same test contract for Steel/local-CDP/extension backend where supported:

- session acquisition;
- persistent login state contract;
- navigation/read/fill/upload primitives;
- human-control handoff;
- release without credential/log leakage.

### 20.4 Crash/recovery matrix

Must explicitly test:

1. worker dies before browser acquisition;
2. dies after listing open;
3. dies after form fill but before Review;
4. dies after Review before authorization;
5. loses Job Harness connection after authorization but before click;
6. dies immediately after submit click;
7. external success occurs, then local Application persistence fails;
8. lease expires while browser is alive;
9. duplicate worker attempts to claim the same task;
10. restart with stale `external_in_progress` state.

Required result: no path performs a second external submit solely because of technical retry/restart.

### 20.5 Security/privacy tests

- main Job Harness bearer never enters extension page context;
- attempt token cannot read another Attempt or arbitrary Resume Artifact;
- event/evidence redaction rejects cookies/password/token-looking values;
- semantic mapper fixtures contain field labels/keys but not protected values;
- legal/EEO/work-auth values cannot be produced by AI path;
- no raw browser session context is persisted in Job Harness.

## 21. Observability

Metrics are projections, not new truth:

- attempts by adapter/backend/outcome;
- Review arrival rate;
- verified submit rate;
- uncertain-submit count;
- human-handoff rate/reason;
- selector/playbook drift failures;
- average execution duration;
- lease expiration count;
- model-call count per attempt;
- duplicate-submit count (target: zero);
- verified submission evidence coverage (target: 100% for committed automated submissions).

Do not log candidate field values merely to improve observability.

## 22. Dependency and license policy

Initial runtime choice:

- Playwright: deterministic browser primitive already in use;
- Steel: initial Oracle2 session backend already deployed;
- OpenJobAutofill-derived MIT code: may be refactored with attribution preserved;
- Stagehand/open-browser-use: optional future semantic/backend implementations, not core dependencies;
- Temporal: architectural upgrade path, not required in R019 v1;
- Autograph GPL, AIHawk/Skyvern AGPL: architecture reference only; no code vendoring into the MIT core.

Before any external code is copied rather than merely studied, record exact upstream path/commit/license in a Job Harness NOTICE/provenance file.

## 23. Concrete migration map from the existing Copilot

Historical component -> target:

```text
scripts/browser/steel-provider.mjs
  -> apply-browser SteelBackend

scripts/browser/local-cdp-provider.mjs
  -> apply-browser LocalCdpBackend

scripts/browser/browser-provider.mjs
  -> BrowserBackendRegistry

scripts/browser/boss-adapter.mjs
  -> split BOSS discovery/auth primitives and later BOSS Apply adapter

scripts/boss-browser-screen.mjs
  -> Discovery executor / screener, NOT generic Apply runtime

src/content.js form scan/write behavior
  -> Form scanner/filler adapters behind FormIR + characterization tests

src/background.js mapFields/analyzePageStructure
  -> bounded SemanticFieldMapper compatibility implementation

src/background.js profile bundle / active resume file
  -> ApplicantDataProvider compatibility + Job Harness immutable Artifact grant

src/background.js applications[]
  -> remove as authority; optional local UI cache only

syncCopilotApplicationToLedger()
  -> remove; execution completion reports through SubmissionIntent/Attempt API

scripts/lib/job-ledger.mjs
  -> already converged by R018; archive/read-only only

boss-companion /api/ledger/*
  -> retire after R019 cutover

private-channel update/package mechanism
  -> keep only if needed for extension distribution; not part of Career domain
```

## 24. Completion criteria

R019 is complete only when all are true:

- executor/browser/site/data-provider boundaries exist as typed contracts;
- at least one Steel-backed and one user-browser-backed execution path can reach Review through the same Attempt protocol;
- immutable Job Harness Resume Artifact is used for upload;
- a real supervised submission completes through Review -> one-time authorization -> submit -> explicit evidence -> ApplicationSubmission;
- crash tests prove no duplicate external submission;
- MCP still exposes zero recruiting-site side-effect tools;
- old ledger writes and old resume-bundle authority are disabled;
- BOSS discovery/greeting is not silently counted as formal application without concrete evidence;
- all migrated/copied code has explicit provenance/license treatment;
- production backup/restart preserves Intent/Attempt/Event/reconciliation state;
- the old Copilot can be archived without losing Career truth.

## 25. R018 production evidence — 2026-09-17

R018 is complete. The read-only source fingerprint was `185a57cff05ad6bdd5633bac016211db329e96a2eda1029fca4926442368218f` and contained **21 Jobs / 5 DiscoveryRuns / 22 DiscoveryEvents / 2 company-only application rows / 2 legacy company locks**.

A production-shaped dry run first proved **11 inserts / 11 metadata updates across 22 observations / 0 rejects**, with 9 event-level adoptions anchored to already-existing Jobs and source evidence. The import recorded historical aliases including `语核科技 -> 语核科技 / LangCore`, `MazeAI -> MazeAI / 深圳万有引路科技有限公司`, `光启无界 -> Lumicross / 光启无界`, and `涌生智能 -> 涌生智能 Genoria（深圳华大涌生智能科技有限公司）` so future duplicate checks can resolve those names.

Before production mutation, `oracle2-runtime-backup-v6` uploaded `oracle2-agent-20260917T090140Z.tar.gz`; backup verification passed schema v7, all 5 compatibility Resume artifacts and all 13 first-class Revision artifacts. Production import then moved Job Harness from **104 -> 115 Jobs**, kept **41 Applications / 41 ApplicationSubmissions** unchanged, moved DiscoveryRuns **3 -> 8**, and created 4 Company aliases. DeepSeek's lossy company-only row was covered by one existing concrete Application; Tencent's was covered by two existing concrete Applications. No placeholder Application or duplicate submission was created.

The exact second import was a no-op at the durable workflow level: all 5 imported DiscoveryRuns were returned as already completed and Job/Application counts remained unchanged. `PRAGMA integrity_check = ok`, foreign-key check returned no rows, MCP stayed at 32 tools and reported **115 known Jobs / 41 Applications / 0 SubmissionIntents / 5 Resume Profiles**. Secure MCP Tunnel health and control-plane polling remained green.

## 18. R019 implementation evidence — control plane and worker extraction

### 18.1 R019-B control plane

The control plane is now implemented behind explicit package boundaries rather than by importing the legacy browser repository. `@job-harness/apply-contracts`, `@job-harness/apply-core`, and `@job-harness/apply-runtime` own typed executor/attempt contracts, a DOM-free transition/routing core, and lease/idempotency orchestration respectively. SQLite schema **v8** adds `executor_registrations`, `execution_attempts`, and append-oriented `execution_events`; the existing `SubmissionIntent` remains the business/external-effect truth instead of being overloaded with browser mechanics.

Dispatch freezes an `ApplyBundle` from a prepared `SubmissionIntent`, concrete Job/Listing and immutable PDF Resume Artifact evidence when present. Claim uses capability-aware pull routing plus an expiring lease whose raw token is returned only to the claimant while SQLite stores only its SHA-256. Human handoff releases the lease and requires explicit resume. Expired claimed/running leases are durably abandoned before new work is claimed; this makes a crashed worker recoverable without pretending an external action succeeded. If an attempt ends with a crossed/uncertain external-effect state, the coordinating SubmissionIntent is moved to `needs_manual_review`, so a worker/network failure cannot authorize a second blind submit.

The REST/OpenAPI/client surface exposes executor registration/heartbeat and ExecutionAttempt dispatch/claim/heartbeat/start/wait/resume/complete/fail/cancel. The Web `/executors` workspace projects registered workers and attempts; it does not own a second queue database. ChatGPT MCP is intentionally unchanged at **32 tools / 0 external-side-effect tools**.

### 18.2 R019-C browser/runtime extraction (readiness slice)

The first browser extraction is implemented in a new `@job-harness/apply-browser` package. `BrowserBackendPort`, `BrowserSessionPort`, and a narrow `BrowserDriverPort` prevent site adapters from depending directly on Playwright `Page` or Steel APIs. `SteelBrowserBackend` and `LocalCdpBrowserBackend` are clean typed re-expressions of the required behavior: health, session acquisition, human-control metadata, persistence and release live behind the backend contract. The normal test suite does not require a live browser service.

A separate `@job-harness/apply-worker` process now exists with a deliberately non-destructive `readiness-v1` adapter. It uses a dedicated `JOB_HARNESS_EXECUTOR_AUTH_TOKEN`; the Job Harness server accepts that bearer only on worker register/heartbeat/claim/report routes, while Career reads, dispatch, resume and cancel still require the global server bearer. Boundary checks prevent the worker/browser packages from importing persistence or the global Career application layer.

The readiness worker advertises only `fill_only`, refuses work unless the frozen policy contains `readinessOnly=true`, acquires a configured Steel/local-CDP backend, navigates the frozen Listing URL, records only sanitized host/path/title/length metadata, and completes without fill/select/click/upload calls. Backend or navigation failures are reported with `externalEffectState=not_crossed`. Synthetic worker tests prove the fail-closed policy, and a manual Oracle2 Steel smoke successfully created a fresh session, visited `example.com`, persisted the context and released the session without touching a recruiting site.

Repository validation at this slice is **51 test files / 108 tests**, plus TypeScript, boundary guards, OpenAPI drift check, ChatGPT MCP static gate and the Next production build. R019 remains open: form IR/planning, applicant-data projection, real ATS adapters, artifact grants/review snapshots and the supervised SubmitAuthorization path are later slices and the old `job-application-copilot` runtime is therefore not retired yet.

### 18.3 R019-D FormIR, literal applicant data and scoped Resume grant

The next migration slice is now implemented without porting the legacy extension's monolithic `content.js`. Canonical `FormIR`, applicant-field catalog, `FieldBinding`, `FillPlan`, semantic-mapping view/proposals and fill-report contracts live in `@job-harness/apply-contracts`; deterministic planning lives in the browser-free `@job-harness/apply-core`. The planner prefers exact/conservative aliases, rejects ambiguous matches, treats legal/protected questions as explicit-literal-only, and accepts semantic mapper proposals only for catalog keys that opt in. The semantic mapper view contains labels/options and catalog keys/types but **never applicant values**.

`@job-harness/apply-browser` can now scan visible native form controls into a browser-only snapshot and write through a narrow driver (`fill`, select/radio choice, checkbox, upload). `@job-harness/apply-adapters` converts those snapshots into FormIR and executes a FillPlan only after values are resolved locally through `ApplicantDataProviderPort`. The first compatibility provider reads the existing Profile V2 bundle as a temporary strangler adapter; its public catalog contains key/type/sensitivity/aliases only, while literal values are returned only for explicitly requested keys. A smoke against the three current legacy lanes produced 46 catalog entries per lane without printing applicant values. This compatibility provider is not a new source of truth and can be removed after Job Harness-native applicant data is complete.

Resume bytes are not read from the legacy bundle. A worker with a valid current attempt lease may call the lease-scoped `resume-artifact` grant only when the frozen ApplyBundle already references an immutable **PDF** Resume Artifact. The server revalidates artifact id/revision/hash/byte-size/MIME against durable Resume storage before returning bytes. The scoped worker bearer still cannot use the unrestricted Resume artifact endpoint. An integration test verifies the grant bytes, SHA-256, lease rejection and token boundary.

The original R019-D slice validated **55 test files / 116 tests**. The later supervised pipeline now also covers the scoped immutable PDF upload path: the worker requests only the PDF already frozen into the ApplyBundle, rechecks artifact id/revision/MIME/byte length/SHA-256, augments the value-free applicant catalog with a `documents.resume` file capability, and uploads those exact bytes through `BrowserDriverPort`. The applicant-value resolver never receives Resume bytes and the semantic mapping view still contains no protected values.

### 18.4 R019-E adapter SPI and live human-review handoff

The adapter/browser axes are now independently replaceable. `ApplySiteAdapterRegistry` resolves only adapters matching the requested **semantic action** (`formal_application`, `outreach`, or `discovery`), while BrowserBackend selection remains separate. A narrow versioned declarative ATS playbook can outrank the generic deterministic form adapter without introducing new control-plane code. BOSS greeting/chat is explicitly described as `outreach` with no submit capability, so its historical “打招呼” automation cannot be mistaken for a formal `ApplicationSubmission`.

Managed browser review now has a durable, sanitized handoff contract. SQLite schema **v9** adds only an opaque browser-session projection to `ExecutionAttempt`; cookies/storage/passwords/form values remain private to the browser backend. A worker may retain a Steel session, release its Job Harness lease, return `waiting_for_user`, and expose only the human-control URL/session reference/expiry. Explicit resume preserves that same handoff and a new worker claim can reconnect to the exact Steel session. Expired handoffs fail closed rather than silently rebuilding a reviewed page. Because self-hosted Steel does not provide a durable Job Harness-owned timeout guarantee, the Steel backend maintains a private `0600` retained-session registry and reaps expired sessions itself, including after worker restart. Local-CDP never closes the user-owned Chrome for a logical TTL expiry.

The generic form engine is now executable behind a worker-only feature boundary: a non-production worker can inspect FormIR, resolve only requested literal applicant values, fill deterministic fields, validate the result, then retain the browser and stop at human review. It never clicks submit. Unknown legal/protected fields remain blocking/manual. Semantic mapping remains optional and receives only the value-free `SemanticMappingView`. Production Oracle2 continues to advertise only `readiness-v1`; this form-fill adapter is not yet enabled there.

The `/executors` workspace surfaces a live browser handoff link and expiry when one exists. `ExecutionAttempt` remains the technical queue/session truth, `SubmissionIntent` remains the business/external-effect truth, and no new MCP external-side-effect tool was added.

The next safety slice is R019-F: persist a redacted ReviewSnapshot, issue a short-lived SubmitAuthorization tied to its hash, durably cross the external-effect boundary before the click, and reconcile exact external success/failure evidence through SubmissionIntent. Until that lands, supervised form fill stops at review and the legacy apply runtime is not retired.

### 18.6 R019-F ReviewSnapshot and one-shot SubmitAuthorization

The irreversible submit boundary is now implemented as a separate supervised protocol rather than as another browser helper. SQLite schema **v10** adds immutable redacted `ReviewSnapshot` rows plus short-lived `SubmitAuthorization` rows. A snapshot binds the frozen ApplyBundle, exact retained browser-session reference and a local SHA-256 of the actual current form state, but its strict payload contains only field/binding/failure/manual/pending/prohibited counts and blocking issue codes — never applicant values.

A worker can create the snapshot only under a current running lease. The worker then releases its lease and retains the browser for the human review window. The **global/user control plane**, not the scoped worker bearer, issues a single active authorization only when the snapshot is `readyForSubmit`. Authorization is idempotent, expires in at most 15 minutes, can be explicitly revoked, and is bound to the exact review hash. Expired authorizations are lazily revoked so a later fresh human decision can replace them safely.

On resume, the worker reconnects to the exact reviewed browser session and recomputes the DOM form-state hash. `begin-submit` first validates the lease, active authorization, ReviewSnapshot hash, browser session and exact form hash **without consuming authorization**. It then moves the business `SubmissionIntent` to `external_in_progress`. Only after that succeeds does one SQLite transaction consume the authorization, record `submit_authorized`, set `externalEffectState=crossed`, and append `submit_triggered`. Only a successful response from that operation is permission for one site click. If the response is lost, the worker never assumes permission and never retries the click; the crossed/stale attempt falls into manual review instead.

Exact external success is confirmed through `SubmissionIntent.confirm` before the technical attempt completes, preserving the existing idempotent ApplicationSubmission reconciliation. Definite external failure uses `external_failed`; any ambiguous post-boundary result uses `needs_manual_review` plus `externalEffectState=uncertain`. A fixture end-to-end REST test proves the scoped worker cannot self-authorize, `SubmissionIntent` is already `external_in_progress` before click permission, exact success commits one Application, and a second begin-submit cannot create a duplicate submission.

The worker also has a submit execution engine contract. Its tests prove ordering is `begin-submit -> adapter submit -> site click -> success report`; a missing/lost `begin-submit` response produces **zero clicks**. No production site adapter currently advertises submit capability and the Oracle2 worker remains `readiness-v1`, so this safety machinery is dormant until the first user-authorized supervised adapter proof.

A local synthetic ATS smoke now exercises the real Playwright driver against a live multi-field form rather than a mocked DOM: deterministic applicant facts fill name/email/school/major, the exact PDF Resume bytes are uploaded and verified by SHA-256 on the synthetic server, a visa/sponsorship field remains untouched, post-review field drift changes the form-state hash, restoring the reviewed state restores the hash, and the synthetic submit endpoint records exactly **one** submission followed by explicit confirmation-page evidence. This is deliberately synthetic evidence, not a claim of live recruiting-site reliability.

Current repository validation after the resume-upload and supervised-submit slices is **65 test files / 132 tests**, plus the synthetic ATS browser smoke, TypeScript/build, boundary checks, OpenAPI drift and the unchanged ChatGPT **32-tool / zero external-side-effect** gate.

### 18.10 Native applicant-data grant replaces the legacy Profile V2 ownership path

The worker now has a second lease-scoped capability beside the immutable Resume PDF grant. Under a valid ExecutionAttempt lease it can request a **value-free applicant catalog** derived from the exact frozen Resume Revision, then resolve only the explicit canonical keys selected by the deterministic FormIR/FillPlan pipeline. The worker bearer still cannot call unrestricted Resume APIs. The catalog includes names/types/sensitivity/aliases/provenance but no candidate values; resolution is request-scoped and never synthesizes legal/work-authorization/EEO facts that are absent from the Revision.

This removes the old `profile-bundle.json` from the long-term ownership path for name/contact/education/work/project/certificate/skill facts. A future private AnswerSet can add facts that correctly do not belong in a Resume, while legal/protected answers remain literal-only. The compatibility Profile V2 provider remains only as migration scaffolding and is no longer required by the new worker path.

The frozen ApplyBundle now also stores the user-facing PDF filename from the immutable Resume Revision. The lease-scoped artifact grant returns that filename together with id/revision/MIME/size/SHA-256, so a new application uploads `卢楼豪-前端开发工程师.pdf` (or the matching Profile filename) rather than an internal artifact id.

Production worker composition now supports two explicit phases: `readiness` (default) and `form-fill`. `form-fill` still has **no submit engine** and additionally requires the frozen attempt policy `allowFormFill=true`, so merely changing the worker phase cannot silently mutate arbitrary queued forms. Real submit remains unavailable until a verified submit-capable site adapter is separately enabled.

Validation for this slice is now **66 test files / 133 tests**, plus the synthetic ATS browser smoke. The lease-scoped applicant-data test proves the worker can read catalog metadata and requested values while unrestricted Resume Revision access still returns 401 for the worker token.

### 18.8 R019-G explicit human authorization workspace

The supervised submit protocol now has a Web review surface instead of requiring raw REST calls. `/executors/[attemptId]` shows only durable execution metadata: attempt/effect state, adapter/backend, retained browser handoff, ReviewSnapshot hashes/counts and authorization status. When a retained human-control URL exists, the user can open the exact live browser session from this page.

A submit button is **not** exposed directly. The UI can issue a five-minute SubmitAuthorization only when the latest ReviewSnapshot is `readyForSubmit`, the attempt is still `waiting_for_user`, and the external-effect boundary is untouched. The worker-scoped bearer still cannot call this authorization route. After authorization, a separate explicit “continue authorized execution” action requeues the attempt. The worker must then reclaim the exact browser session and re-hash the form before `begin-submit` can return permission for one external site action.

Authorization form submissions carry a per-render nonce. Repeated browser submits of the same rendered decision are idempotent, while an explicit revoke followed by a fresh page review can produce a new authorization rather than being trapped by the previous idempotency receipt. The Web page never receives applicant field values, browser cookies, Resume bytes or the worker bearer.

The `/executors/[attemptId]` route is now an actual production-build route, not only a design placeholder. It renders the durable attempt state, immutable Resume evidence fingerprint, retained-browser handoff, latest redacted review counts/hashes, authorization history and append-only execution events. Authorization and resume remain separate server actions, and the per-render decision nonce prevents a revoked decision from accidentally reusing an older authorization receipt.

## 24. Live shadow evidence

Live read-only site probing is tracked in `docs/execution/live-shadow-validation.md`. The first pass confirmed why generic browser autonomy is not a safe default: Moka produced a false broad `apply` class match whose button text was actually `分享`; an isolated BOSS session was redirected to its security page; Nowcoder exposed a concrete `立即申请` entry together with login/verification controls; and Zhaopin did not finish bounded navigation. None of these probes clicked, filled, uploaded or submitted. Site promotion therefore remains evidence-driven and adapter-specific.

### 18.11 Live-surface fail-closed gate

The generic ATS fallback is now explicitly **review-only**. `ApplyValidationReport` separates `readyForReview` from `readyForSubmit`; the generic adapter and declarative field-mapping playbooks always return `readyForSubmit=false` because neither defines an irreversible site submit action plus success-evidence contract. Synthetic/site-specific adapters must opt in explicitly. This prevents a sparse or arbitrary web form from becoming authorizable merely because deterministic field filling produced no blocking errors.

Live surface classification is also conservative. A generic page with only a search/job-detail control yields `application_form_not_detected`. Login, registration, password, OTP or verification-code surfaces yield `authentication_surface_detected`, and the generic fill path returns manual results without writing applicant values. This directly covers the anonymous Nowcoder flow observed after `立即申请`: phone and verification-code controls belong to authentication, not to the application form.

The browser port now includes sanitized visible action scanning rather than broad CSS-class guessing. This lets future site-specific adapters bind exact entry actions while keeping the irreversible submit action behind the existing ReviewSnapshot/SubmitAuthorization boundary. The worker process also handles transient Job Harness control-plane restarts with bounded in-process retry/backoff, avoiding crash-loop noise during ordinary server deployment.

The form-fill worker composition now advertises the observed `nowcoder-ats` and `moka-social-recruitment` families alongside the generic fallback. These adapters are still `submit=false`: their value is deterministic routing plus typed preflight/human handoff, not autonomous submission. A queued attempt can explicitly require one of these adapter ids, and the same retained browser session can be resumed after the user completes login/security/application-entry steps.

### 18.12 Typed page preflight and observed-site adapters

The form-fill path now has a typed **preflight state machine** before applicant data is resolved or any field is written. Sanitized browser metadata is classified into `application_form`, `job_detail`, `login_required`, `security_challenge`, `listing_closed`, `submitted_state`, or `unknown`. Only `application_form` may proceed to FormIR planning/fill. Every other state retains the exact browser session and moves the Attempt to `waiting_for_user` without creating a ReviewSnapshot or reading applicant values. This makes a job-detail CTA, login/OTP surface, anti-bot page, closed listing and ambiguous post-submit page structurally different from a fillable application form.

The first traffic-derived adapters are now explicit `nowcoder-ats` and `moka-social-recruitment` adapters. They outrank the generic fallback only for the URL families actually observed in Job Harness, reuse the common FormIR/fill machinery after preflight, and deliberately advertise `submit=false`. The generic fallback remains available for unknown HTTP(S) application forms but is review-only. The worker records the adapter actually selected by the registry, rather than persisting a generic placeholder id.

Read-only live probes verify the new classifier against current public surfaces: Nowcoder `/jobs/detail/...` is `job_detail` with exact visible `立即申请`; Moka social-recruitment job URLs are `job_detail` even when no trustworthy apply action is exposed; and the anonymous BOSS redirect is `security_challenge`. These probes perform no click/fill/upload/submit. Together with the earlier anonymous Nowcoder entry characterization, the safe production path is now: open listing -> typed preflight -> human entry/login when needed -> resume the same retained browser -> only then inspect/fill the actual application form.

### 18.13 Ephemeral real-site control-plane proof

R019 now has a repeatable real-site **pre-submit** proof that does not mutate the production database. `scripts/apply-live-preflight-smoke.ts` starts an ephemeral Job Harness server with independent global/worker bearer tokens and a temporary SQLite store, creates a temporary Nowcoder Job/Listing + planned SubmissionIntent, dispatches one `fill_only` Attempt requiring `nowcoder-ats`, then runs the normal `ApplyWorker` against the real Steel backend.

The current result is `waiting_for_user` / `human-entry:job_detail`, with the external-effect boundary still `not_crossed`, no ReviewSnapshot, no Application, and the SubmissionIntent still `planned`. The browser handoff is explicitly reclaimed and released after the assertion. The script is intentionally restricted to the observed Nowcoder HTTPS job-detail family and contains no external click/fill/upload/submit path. This proves real browser navigation, adapter routing, scoped worker authentication, leasing, durable human handoff, and zero-side-effect state preservation end to end.

### 18.14 Human handoff workspace

The `/executors/[attemptId]` workspace now treats preflight handoff as a first-class operator step instead of showing only an opaque `waiting_for_user` state. For safe pre-submit reasons such as `application_entry_required`, `login_required` and `security_challenge`, it shows the durable reason/checkpoint, the retained-browser expiry, explicit guidance to complete only entry/login/verification (not final submit), and a separate “continue form inspection” action after the user confirms the real application form is visible. Expired handoffs remain non-resumable.

The continue action is still only the existing control-plane `resume`: it requeues the same Attempt and retained browser session while `externalEffectState` remains `not_crossed`. An integration test proves the Web action cannot create an Application or advance the SubmissionIntent; the worker must reclaim the same handoff and pass typed preflight again before any form-fill step can continue.

### 18.15 Policy-gated application entry

Application entry is now a distinct adapter capability (`enter`) rather than being conflated with `fill` or `submit`. The current Nowcoder adapter is the first narrowly characterized implementation: only when the immutable Attempt policy has `allowApplicationEntry=true` may it choose exactly one enabled visible `立即申请` action, click it once, wait for the new page state, and immediately re-run typed preflight. Missing or ambiguous actions fail closed. Generic/Moka/playbook/BOSS adapters do not advertise entry capability.

The first live canary produced `job_detail -> login_required` with one pre-submit navigation action and then stopped before applicant-data resolution. Durable state remained `waiting_for_user`, `externalEffectState=not_crossed`, zero ReviewSnapshots, zero Applications, and a still-planned SubmissionIntent. This gives R019 a separately auditable entry boundary while keeping login/OTP, form fill and irreversible submit as later independent gates.

Validation at this slice is **70 test files / 146 tests**, plus typecheck, boundary guard, OpenAPI drift, ChatGPT **32-tool / zero external-side-effect** gate, Web production build, synthetic submit-safety smoke, and both zero-click / one-entry live ephemeral canaries.

### 18.16 Human-dispatched safe form fill

Prepared SubmissionIntents are now visible in `/executors` as a separate queue before any browser work starts. The user can explicitly dispatch **safe fill (no submit)** only when an immutable Resume Revision, its matching PDF Artifact, an executable target, and a compatible ready executor are present. The Web action revalidates the frozen PDF evidence and creates a `fill_only` ExecutionAttempt on Steel with `humanControl + persistentSession + resumeUpload`, sets `allowFormFill=true`, explicitly records `submitAllowed=false`, and grants the separately audited `allowApplicationEntry=true` pre-submit entry capability.

The rendered decision carries a nonce: duplicate submits of the same rendered decision are idempotent, while a later deliberate retry can receive a fresh key after the previous Attempt is terminal. The workspace detects an already-active Attempt for the same intent and routes the user back to that execution instead of offering another dispatch. Dispatch itself leaves the SubmissionIntent `planned`, keeps `externalEffectState=not_crossed`, and creates no Application. ChatGPT MCP still cannot dispatch the browser worker; this remains an explicit human Web control point.
