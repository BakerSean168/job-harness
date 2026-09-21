# Offline Control Plane Hardening Plan

Status: **implementation active — Phases A-D code-complete; Phase E verification/deployment active**

Date: 2026-09-21

Scope: Job Harness control plane and durable recruitment-runtime infrastructure that can be implemented and verified entirely on Oracle2 while the Windows/WSL recruitment workstation is offline.

## 1. Context

The recruitment browser architecture is now split into two execution families:

- BOSS uses the mature `czc-good-job`-derived dedicated Edge runtime.
- 智联 / 猎聘 / 51job use the `vvvsrx/get_jobs` collect-only Camoufox runtime behind a coarse Job Harness control surface.

The workstation may legitimately be powered off for long periods. That must be a normal infrastructure state, not an error mode that leaves stale tasks, slow health probes, ambiguous DiscoveryRuns, or misleading active-runtime projections.

Recent 智联 canaries also exposed a stronger requirement: browser-observed external identities must never overwrite or attach to canonical Jobs when the incoming title/company evidence conflicts with an existing strong external identity.

This phase therefore hardens the **control plane**, **identity boundary**, and **durable execution ledger** before more real-browser canaries.

## 2. Non-goals

This phase does not require or attempt:

- Windows Edge or WSL/Camoufox availability;
- BOSS recruiter-facing greeting/resume actions;
- 智联 / 猎聘 / 51job live browser canaries;
- CAPTCHA/security-challenge bypass;
- ATS final submit;
- MemoFlow CH-0005 integration;
- rewriting mature upstream site state machines inside Job Harness.

## 3. Invariants

### 3.1 Runtime task truth

A runtime task may be:

- active and running;
- paused but still resumable;
- expired and historical.

An expired task must never be projected as `activeTaskId`, regardless of whether it expired while running or paused.

Historical task/event evidence remains durable.

### 3.2 Offline is a first-class state

When the workstation is unavailable:

- runtime status must return `offline` quickly;
- status checks must not block an MCP workflow for the normal business-request timeout;
- no collection or recruiter-facing action may be started;
- no restart/self-heal action may target the user's normal browser.

Health probes and business requests must use separate timeout budgets.

### 3.3 Strong external identity is fail-closed

For a listing with a strong site identity such as:

`sourceKind + externalNamespace + externalId`

an incoming candidate may reuse that identity only if the canonical record is compatible with the incoming title/company evidence.

A clear company/title conflict must become a rejected persistence result with auditable reason; it must never silently mutate the existing Job into the incoming Job.

Site adapters should still produce the strongest identity they can, but the canonical persistence boundary is the final protection layer.

### 3.4 DiscoveryRun must represent execution outcome

Counts alone are not an adequate execution status.

Target durable states:

- `running`
- `succeeded`
- `failed`
- `aborted`

A completed failed/aborted run must retain:

- completion timestamp;
- candidate / inserted / duplicate / rejected counts;
- bounded failure code;
- bounded human-readable failure reason.

Backward compatibility rule:

- existing completed runs migrate to `succeeded`;
- existing open runs migrate to `running`;
- old clients that only use counts/completedAt remain valid.

### 3.5 Browser runtime code stays modular

`apps/server/src/get-jobs-runtime.ts` currently mixes:

- HTTP transport;
- runtime health;
- site descriptors/config;
- identity normalization;
- upstream row parsing;
- canonical mapping;
- cache sync;
- Campaign-to-runtime configuration;
- MCP port construction.

The target is to make identity and sync independently testable pure/control-plane modules without rewriting upstream browser behavior.

## 4. Implementation slices

### Phase A — runtime lifecycle correctness ✅

1. **BOSS expired-task projection**
   - detect expiry regardless of `desiredState`;
   - preserve history;
   - exclude expired task from active execution state and health `activeTaskId`;
   - ensure external-effect gates reject expired tasks;
   - add regression tests for running-expired and paused-expired tasks.

2. **Fast offline health probe**
   - add a dedicated `healthTimeoutMs` to the get_jobs client;
   - default business request timeout remains 10 s;
   - default health probe timeout becomes 2.5 s;
   - health probes use the short timeout only;
   - preserve clean `offline` MCP output instead of throwing.

Acceptance:
- an unreachable get_jobs runtime is reported offline within the health budget;
- three sequential site status reads no longer consume ~30 s;
- BOSS expired paused task is not active.

### Phase B — canonical identity guard ✅

1. Add a canonical compatibility check before a strong listing identity is attached to an existing Job.
2. Compare normalized company and title evidence conservatively.
3. Reject only clear conflicts; do not introduce fuzzy merge guesses.
4. Return a stable rejection reason suitable for canary evidence.
5. Add tests reproducing the 智联 failure mode:
   - same externalId + same company/title => duplicate/update allowed;
   - same externalId + different company => rejected;
   - same externalId + incompatible title => rejected;
   - no strong externalId => existing conservative URL/company/title dedupe remains unchanged.

Acceptance:
- a malformed upstream listing cannot cross-bind Job A's strong externalId to Job B.

### Phase C — DiscoveryRun outcome model ✅

1. Add `DiscoveryRunStatus` contract.
2. Add `status`, `failureCode`, `failureReason` to `DiscoveryRun`.
3. Add SQLite schema v18 migration.
4. Extend completion input with optional outcome fields while preserving successful default behavior.
5. Update persistence/read models/export/OpenAPI/MCP.
6. Update discovery workers:
   - normal completion => `succeeded`;
   - provider/runtime error => `failed`;
   - explicit operator/runtime stop => `aborted` where evidence is available.
7. Provide a bounded maintenance path for stale historical open runs; do not infer failure reasons without evidence.

Acceptance:
- no new failed discovery execution has to masquerade as a successful run with rejected counts.

### Phase D — get_jobs module decomposition ✅

Implemented layout (transport + health remain cohesive in the runtime client; identity normalization remains cohesive in the mapper):

```
apps/server/src/recruitment-runtime/get-jobs/
  model.ts
  client.ts
  mapper.ts
  sync.ts
  mcp-port.ts
```

`apps/server/src/get-jobs-runtime.ts` is now a thin compatibility facade.

Compatibility:
- `apps/server/src/get-jobs-runtime.ts` may remain as a thin public re-export/facade during migration;
- no public REST/MCP contract changes are required for the refactor itself.

Acceptance:
- browser upstream changes do not require editing canonical identity logic;
- sync tests can run without HTTP/runtime orchestration;
- health tests can run without persistence.

### Phase E — observability and stale-run hygiene ⏳

1. Add structured runtime-offline detail codes where possible.
2. Add tests ensuring no external-effect counter/Application changes during collect-only sync.
3. Reconcile obsolete documentation that still describes the superseded 180-row sync path.
4. Close or explicitly classify known stale DiscoveryRuns once the outcome model exists.
5. Run full repository gates.

## 5. Verification matrix

Every implementation slice must pass its focused tests first.

Before declaring this offline phase complete:

```
pnpm typecheck
pnpm check:recruitment-browser-runtime
pnpm check:chatgpt-integration
pnpm check:deployment
pnpm test
pnpm check
git diff --check
```

If the repository's full gate includes a workstation/browser-dependent check, that check must be reported separately rather than being represented as passed.

## 6. Deployment policy

Oracle2 server/runtime-channel changes may be deployed during this phase.

Do not update the daily automation to start 智联 / 猎聘 / 51job automatically until the corresponding real-browser collect-only canary has passed after this hardening.

Do not enable upstream delivery actions.

BOSS recruiter-facing policy remains bounded by Campaign policy and the existing external-effect budget.

## 7. Resume condition when workstation returns

When Windows/WSL becomes available again:

1. verify Runtime Channel self-update;
2. verify 智联 login cookie;
3. run a fresh verified-detail identity canary;
4. validate every synced strong external identity against canonical company/title evidence;
5. prove Applications count is unchanged by collection;
6. complete the DiscoveryRun with an explicit outcome;
7. then repeat for 猎聘 and 51job.

No workstation-dependent canary is required to complete Phases A-D at code level.
