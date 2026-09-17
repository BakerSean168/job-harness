# Legacy discovery convergence and Apply Executor module

Status: implementation plan, 2026-09-17.

## 1. Problem statement

Job Harness is now the canonical source of truth for job discovery, application state, Resume evidence and ChatGPT workflows, but two historical capability/data islands still exist:

1. the former `job-application-copilot` central ledger contains recurring ChatGPT automation discoveries that were created after the older JSONL/application-pool import;
2. the `job-application-copilot` browser extension + Playwright/BOSS runtime still owns the real recruiting-site interaction capability.

The goal is not to create a second application product inside Job Harness. The goal is to converge durable state into Job Harness and turn the old browser automation into a replaceable **Apply Executor capability module**.

## 2. Current evidence

### 2.1 Job Harness production

Before this convergence slice, production contains 104 Jobs, 41 Applications and 41 ApplicationSubmissions. Those 41 submissions already include the known browser/email/script application history from 2026-09-02 through 2026-09-16, imported with evidence notes and Resume profile references where known.

Examples include browser-confirmed Zhaopin submissions, official/email submissions, Tencent screening state, DeepSeek, ByteDance, Xiaohongshu, Intel and other historical applications. Therefore those concrete application facts must **not** be replayed again merely because another legacy store also mentions the company.

### 2.2 Legacy central Job Ledger

`job-application-copilot/.local/job-ledger/jobs.sqlite3` currently contains:

- 21 Jobs;
- 21 JobSources;
- 5 DiscoveryRuns;
- 22 DiscoveryEvents;
- 2 company-only application records whose exact role was not preserved;
- 2 matching company application locks.

The 21 Jobs are the recurring `26届AI岗位筛选` / rolling-rescan discoveries from 2026-09-14 through 2026-09-17. They include source URLs, source kinds, contact emails and, for newer entries, raw JD metadata.

The two company-only application rows are DeepSeek and Tencent. They are **not** suitable for creating new Job Harness Applications because Job Harness correctly requires a concrete Job. Job Harness already contains concrete DeepSeek/Tencent application evidence, so these rows are migration evidence, not additional submissions.

## 3. Canonical ownership after convergence

```text
ChatGPT / scheduled discovery
        |
        v
Job Harness
  Company
  Job / Listing / Observation
  Campaign / DiscoveryRun
  Application / ApplicationSubmission
  Resume Profile / Revision / Artifact
  SubmissionIntent
        |
        | executor protocol only
        v
Apply Executor module
  BOSS adapter (Playwright)
  Generic browser-extension adapter
  future ATS adapters
        |
        v
external recruiting site
```

Rules:

- Job Harness is the only durable Job/Application ledger.
- The executor never maintains an authoritative duplicate job database.
- The executor never chooses an arbitrary mutable Resume file; it receives an immutable Job Harness Resume Revision/Artifact when available.
- ChatGPT/MCP may prepare a `SubmissionIntent`, but the MCP app itself continues to expose **zero external recruiting-site side-effect tools**.
- The external executor must follow `prepare -> begin -> external side effect -> confirm/fail -> reconcile`.
- A network/process crash after external success may retry local reconciliation, never the external submit.

## 4. Legacy ledger import design

### 4.1 Source is read-only

The legacy SQLite database is opened read-only by a migration reader. No table in the old repository is modified during import.

### 4.2 Preserve historical runs

Each old `discovery_runs` row is replayed as a Job Harness `DiscoveryRun(executor=import)` under campaign `2026-grad-agent-fullstack-frontend` when that campaign exists. The original legacy run id, source/scope/counts and source database fingerprint are preserved in `contextSnapshot`.

A deterministic import idempotency key is derived from the legacy run id and source fingerprint, so rerunning the same import returns/reuses the same logical migration rather than creating duplicate observations.

### 4.3 Job and Listing mapping

For every legacy Job:

- company/title/city remain descriptive Opportunity fields;
- strong listing identity uses source external job id when present;
- job-specific URLs use `identityKind=url`;
- generic careers/join pages use `identityKind=scoped`, because one careers page may publish several distinct roles;
- source kind is mapped to Job Harness vocabulary (`official`, `boss`, `zhilian`, `liepin`, `email`, `other`, ...);
- contact email, legacy source kind, raw JSON, graduation/experience signals and legacy IDs are preserved in `metadataSnapshot`;
- JD/raw metadata is folded into the Job description only as migration evidence, not rewritten as an AI summary.

Job Harness application services perform duplicate resolution. The importer must not direct-write SQLite or invent its own destructive `company + title + city` merge.

### 4.4 State mapping

- `shortlisted` -> `shortlisted`
- `discovered` -> `discovered`
- `closed` -> `closed`
- `skipped` -> `ignored`
- legacy `applied` is only mapped to Job triage `shortlisted`; an Application is created only from concrete application evidence.

### 4.5 Legacy application reconciliation

Concrete application facts already in Job Harness are authoritative. A company-only legacy row with no Job identity is never converted to a fake placeholder Job/Application.

For this dataset:

- DeepSeek legacy company-only row is considered reconciled by existing concrete DeepSeek application evidence;
- Tencent legacy company-only row/lock is considered reconciled by existing concrete Tencent application evidence;
- importer reports them as `applicationEvidenceReconciled` / `applicationEvidenceUnresolved` rather than creating duplicate submissions.

If a future source contains an unresolved company-only application with no matching Job Harness evidence, the importer fails closed and reports it for manual reconciliation. We do not weaken the Application aggregate merely to fit a lossy legacy record.

## 5. Apply Executor module

### 5.1 Product boundary

The existing `job-application-copilot` is not merged wholesale as a new source of truth. Its useful capabilities are extracted behind an execution boundary:

```text
ApplyExecutorPort
  health()
  capabilities()
  execute(intentId)
  cancel?(intentId)
```

The first implementation may remain a separate local process while Job Harness presents it as a module. Physical process boundaries can change later without changing the Career domain.

### 5.2 Adapters to retain

- **BOSS Playwright adapter**: persistent browser profile, login/manual takeover and BOSS-specific form/navigation logic.
- **Browser extension adapter**: generic ATS/form autofill and local human-in-the-loop UI.
- **Resume upload adapter**: must obtain the selected immutable PDF Artifact from Job Harness rather than the old packaged Resume bundle.

The old central ledger/API is retired after migration. The old extension-side `applications[]` cache becomes a local UX cache only; confirmed submissions must write back through SubmissionIntent reconciliation.

### 5.3 Job Harness Web module

Add an `自动投递 / Executor` workspace that projects, rather than duplicates, Job Harness state:

- executor online/ready/login-required state;
- adapter capabilities and supported sites;
- pending/running/manual-review SubmissionIntents;
- target Job/Listing and immutable Resume evidence;
- execution timestamps and sanitized evidence;
- explicit start/cancel/retry-local-reconcile controls;
- safety policy (manual checkpoint, allowlist, per-site throttling).

The page does not become a second queue database. `SubmissionIntent` remains the queue/outbox truth.

### 5.4 Safety and reliability invariants

1. Never execute without a persisted `SubmissionIntent`.
2. Never re-click submit merely because MCP or Job Harness temporarily disconnected.
3. Check intent state before every external action.
4. `external_confirmed`, `persistence_pending`, `committed` are terminal with respect to the external submit action.
5. Resume evidence is frozen before `begin` where the site requires a resume.
6. Human login/CAPTCHA/manual review is represented explicitly; bypass is not attempted.
7. Executor logs must not persist browser cookies, passwords or bearer tokens.

## 6. Delivery plan

### JH-R018 — legacy ledger convergence

- add typed read-only legacy SQLite reader/importer;
- unit-test generic careers-page identity and strong listing identity;
- unit-test exact rerun idempotency;
- dry-run against a copy of production;
- production backup;
- migrate the 5 runs / 21 jobs through application ports;
- reconcile the two company-only application facts against existing concrete Applications;
- verify counts, FK/integrity and rerun no-op behavior;
- freeze a migration report and retire the old ledger from scheduled workflows.

### JH-R019 — Apply Executor module

- define executor capability contract and status projection;
- add Job Harness executor workspace backed by SubmissionIntent;
- create compatibility adapter for the existing `job-application-copilot` browser runtime without importing its ledger/resume ownership;
- change executor input to Job Harness JobListing + Resume Artifact + SubmissionIntent;
- change success/failure writeback to SubmissionIntent confirm/fail;
- run one non-destructive readiness smoke, then a user-authorized real-site end-to-end proof;
- retire old `/api/ledger/*` writes and duplicate resume bundle as authoritative paths after proof.

## 7. Completion criteria

Convergence is complete when:

- all recoverable recurring-discovery Jobs are represented in Job Harness with source evidence and historical DiscoveryRun provenance;
- no historical concrete Application is duplicated;
- ambiguous legacy company-only application rows are either reconciled to existing evidence or surfaced for manual review;
- the old central ledger is no longer read by ChatGPT automation or the browser executor;
- the Apply Executor can consume a Job Harness SubmissionIntent and report external evidence back without direct SQLite access;
- Job Harness remains the sole durable Career truth after restart and backup/restore.
