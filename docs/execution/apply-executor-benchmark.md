# Apply Executor open-source benchmark

Status: architecture research, 2026-09-17.

This benchmark exists to prevent JH-R019 from becoming a line-by-line migration of the historical `job-application-copilot`. The goal is to extract the strongest reusable architectural ideas from current open-source browser/job-application projects while keeping Job Harness's own domain and durability boundaries intact.

## 1. Evaluation criteria

Projects are evaluated for architecture rather than feature count:

- separation between durable workflow state and browser execution;
- adapter/plugin extensibility across ATS/platforms;
- deterministic execution versus model-driven exploration;
- browser/session abstraction;
- form scanning, canonical field taxonomy and value injection;
- resumability, leases, retries and duplicate-submit protection;
- human handoff and uncertain-result handling;
- evidence/verification after a real external submit;
- privacy boundaries around candidate values and credentials;
- testability with fixtures and contract tests;
- license suitability for an MIT Job Harness repository.

A project can be useful as a **design reference** without being a suitable dependency or code source.

## 2. Strong references

### 2.1 Jobops (`yuyao-wang/Jobops`, MIT)

Why it matters: it is unusually close to the exact R019 problem. Its architecture separates a control/plan layer from deterministic ATS adapters, an event ledger, leases, browser-session brokerage, explicit human handoff, one-time submission permits and evidence-backed outcomes.

Patterns worth adopting:

- deterministic ATS execution before AI exploration;
- a shared adapter protocol rather than one giant browser script;
- a durable execution/run record separate from the application target;
- exclusive run/browser leases;
- a pre-submit review fingerprint and a separate one-time submit authorization;
- `SUBMIT_UNKNOWN`-style treatment of a click whose success cannot be verified: never blindly retry;
- explicit evidence requirements before declaring a submission verified;
- generic fallback split into observer -> fingerprinter -> resolver -> executor -> verifier;
- candidate values are resolved locally after field classification, rather than letting an LLM invent values;
- CAPTCHA/MFA/account lock/unknown sensitive questions become human handoffs.

Caveat: the repository is an early project and explicitly distinguishes fixture success from live-site reliability. It is a reference for boundaries and invariants, not a dependency or proof that its exact implementation should be copied.

### 2.2 `ats-autofill-engine` (`ebenezer-isaac/ats-autofill-engine`, MIT + MPL-2.0 heuristics)

Why it matters: its core is explicitly hexagonal and framework-agnostic.

Patterns worth adopting:

- pure core `FormModel`, `FillInstruction`, `FillResult`, field taxonomy and plan building;
- DOM-dependent scanning/filling behind adapters;
- per-ATS adapters outside the core;
- a compile-time/CI boundary that prevents pure core code from importing DOM APIs;
- React-compatible native value setters and typed file attachment as infrastructure concerns;
- canonical intermediate form representation before site-specific execution.

Caveat: the repository is very early and has no release history. Adopt the architecture, not the package as a foundational dependency yet.

### 2.3 Autograph (`tonybolivar/autograph`, GPL-3.0)

Why it matters: it demonstrates the practical value of a small per-ATS adapter surface across many ATS products.

Patterns worth adopting:

- adapter registry;
- master field model plus per-site memory;
- small platform adapters that only teach the engine selectors/events/special cases.

License decision: **architecture reference only**. Do not copy GPL-3.0 implementation code into Job Harness's MIT codebase.

### 2.4 jobApplier (`17nbist/jobApplier`, architecture reference)

Why it matters: its repository separates a config engine from page code and ships selector/action playbooks for many ATS products, with an AI fallback for forms not covered by deterministic configuration.

Patterns worth adopting:

- declarative playbooks/action DSL for common ATS forms;
- generic interpreter instead of one source file per selector variation;
- known ATS path is fast and model-free;
- AI is fallback mapping, not the primary executor;
- legal/work-authorization/EEO fields are literal profile values and never LLM-generated;
- structural fixture validation for playbooks.

License decision: treat as design reference unless a compatible license is explicitly verified before code reuse.

### 2.5 OpenJobAutofill (`Br1an67/OpenJobAutofill`, MIT)

Why it matters: the historical `job-application-copilot` is already a direct MIT-derived fork of this project, so this is the legitimate provenance path for the existing field scanner/filler behavior.

Patterns worth retaining:

- local-first form scanning and filling;
- AI sees page field metadata and candidate **field names**, not the private candidate values themselves;
- unresolved fields remain pending instead of being guessed;
- human review is an explicit normal outcome;
- framework-compatible DOM writes are isolated from profile representation.

Migration implication: existing derived code may be refactored/reused with its MIT notice preserved, but R019 should move behavior behind new ports and contracts rather than paste the old extension wholesale into Job Harness.

### 2.6 JobFill (`23aaaa/jobfill`, MIT)

Why it matters: a small project but a good reminder that browser-side form writing must support framework-controlled inputs and user-assisted fallback, not only native HTML fields.

Patterns worth adopting:

- form-write utilities as their own module;
- explicit user-assisted mode for unsupported controls;
- local/private candidate data posture.

### 2.7 czc-good-job (`czc6666/czc-good-job`, MIT)

Why it matters: it is deliberately narrow: BOSS-specific browser behavior plus a local backend, with scoring/configuration separated from the browser script.

Pattern worth adopting: keep BOSS-specific behavior isolated in a BOSS adapter. Do **not** let BOSS selectors, greeting semantics or pacing rules become generic Apply core concepts.

Anti-pattern to avoid: the older project's single-purpose concepts (score threshold, `resumeIndex`, greeting flow) should not leak into a multi-executor platform contract.

## 3. Browser automation references

### 3.1 Stagehand (`browserbase/stagehand`, MIT)

Useful principle: use the lowest-autonomy primitive that solves the step.

Adopt the determinism ladder:

1. direct deterministic browser/Playwright operation when the path is known;
2. cached/structured observe -> act for a page element that drifts;
3. semantic extract/classification for bounded unknowns;
4. full autonomous agent only for genuinely open-ended paths.

Actions should be atomic. A platform adapter should not hide an entire application behind one natural-language prompt.

Decision: Stagehand may be evaluated later as an optional semantic-browser adapter, but it is **not** required for the R019 core. The stable path remains typed adapters + Playwright/browser primitives.

### 3.2 open-browser-use (`open-browser-use/open-browser-use`, MIT)

Why it matters: it separates one browser-control protocol from multiple backends (WebExtension and CDP) using a capability-gated local broker.

Patterns worth adopting:

- browser backend and site adapter are separate axes;
- the same high-level browser driver contract can be implemented by CDP/Playwright and a browser extension;
- capability declarations/guards belong at the browser boundary;
- user-owned real Chrome and server-managed/headless Chrome can coexist without changing application-domain contracts.

Decision: borrow the protocol shape; do not introduce it as a mandatory runtime dependency in R019.

### 3.3 Steel (`steel-dev/steel-browser`, Apache-2.0)

Why it matters: Steel treats browser infrastructure as infrastructure: sessions, persistent state, browser processes, extensions and human/debug viewer are managed separately from the automation application's business logic.

Decision: keep Steel as the initial Oracle2 browser-session backend because it is already deployed and the historical Copilot already has a working `SteelProvider`. Move that provider behind a Job Harness browser-runtime port rather than mixing Steel APIs into ATS adapters.

### 3.4 Skyvern (`Skyvern-AI/skyvern`, AGPL-3.0)

Useful ideas:

- typed tasks/workflows;
- explicit error codes and human handoffs;
- code-first multi-step browser workflows.

License decision: architecture reference only unless Job Harness intentionally accepts AGPL obligations. Do not vendor implementation code for R019.

### 3.5 AIHawk (`feder-cr/Jobs_Applier_AI_Agent_AIHawk`, archived AGPL-3.0)

Useful primarily as a failure-mode reference. The project became a large Selenium-oriented auto-apply system and its issue history includes selector/XPath drift. It is now archived.

Lesson: avoid a monolithic platform bot whose orchestration, selectors, LLM logic, applicant values and durable state are entangled. Do not reuse its AGPL code.

## 4. Durable execution reference

### Temporal (`temporalio/temporal`, MIT)

Job Harness does not need to adopt Temporal as a dependency for R019, but its separation is the correct mental model:

- server/control plane persists workflow state;
- workers poll task queues when they have capacity;
- workers execute external work, not the server;
- leases/heartbeats/checkpoints let long-running work survive worker loss;
- retries are policy-controlled rather than ad-hoc process loops.

R019 should therefore use a **pull worker model with leases and heartbeats**. A future `ExecutionQueuePort` may be backed by Temporal or another durable-work system without changing SubmissionIntent, adapter or UI contracts.

## 5. Synthesis: what Job Harness should build

The benchmark converges on these decisions:

1. Keep **Job Harness as control plane and durable Career truth**. Browser processes never own Jobs, Applications, Resume versions or submission truth.
2. Split `SubmissionIntent` (business intent) from `ExecutionAttempt` (technical attempt). One intent may have multiple safe recovery attempts, but only one external submission may be authorized.
3. Use a **pull worker + lease + heartbeat** model rather than Job Harness calling arbitrary browser services directly.
4. Split three independent extension axes:
   - `BrowserBackend` — Steel, local CDP, browser extension/native bridge;
   - `SiteAdapter` — BOSS, Workday, Greenhouse, Moka, generic ATS;
   - `ApplicantDataProvider` — Resume facts, private application answers, local secret/credential source.
5. Create a pure, DOM-free **Form IR + Fill Plan core**. DOM scanning/writing and ATS selectors stay outside it.
6. Prefer a deterministic routing ladder:
   `site adapter -> ATS playbook -> generic rules -> bounded semantic mapper -> human`.
7. AI may map page semantics to canonical keys, but it does not receive or invent protected candidate values.
8. Persist a redacted **Review Snapshot** before submission. Submit authorization is one-time and bound to the exact Intent/Attempt/Listing/Resume Artifact/review/policy hashes.
9. A post-click uncertain result becomes manual review; lease expiry or network failure must not trigger another submit.
10. Keep ChatGPT MCP free of external-side-effect tools. Dispatch/start belongs to authenticated Web/user control or a separately authorized executor control API.
11. Migrate with a **strangler pattern + characterization tests**, not a repository copy. Preserve MIT provenance where existing OpenJobAutofill-derived code is actually reused.
12. BOSS discovery/scoring/greeting and formal application submission are different capabilities. Only concrete application/resume-submit evidence should create/confirm an `ApplicationSubmission`.

These decisions are the baseline for `apply-executor-plan.md`.
