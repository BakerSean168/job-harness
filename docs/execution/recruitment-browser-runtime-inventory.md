# Recruitment Browser Runtime Capability Inventory

Status: upstream-first control plane implemented; offline hardening complete; fresh multi-platform live acceptance pending
Date: 2026-09-21
Related plan: `docs/execution/recruitment-browser-runtime-plan.md`

## 1. Purpose

This document freezes the current capability ownership before Recruitment Browser Runtime migration. It exists to prevent a second implementation of behavior that is already proven in the retired Job Application Copilot or an upstream project.

The migration rule is:

```text
proven upstream/site runtime
  -> wrap
  -> characterize
  -> canary
  -> promote

not:

proven upstream/site runtime
  -> read source
  -> rewrite selectors/state machine in Job Harness
```

## 2. Current upstream registry

Canonical machine-readable registry:

```text
integrations/upstreams/registry.json
```

Current pinned upstreams:

| Upstream | Pin | License | Job Harness role | Sync mode |
| --- | --- | --- | --- | --- |
| czc-good-job | `e07bf4cb663d9531864ca22eb6195b77e064c3b5` | MIT | BOSS mature site runtime | direct runtime + overlay |
| OpenJobAutofill | `005eda98841b3671ead615ebfde5922f0dfd7c36` | MIT | generic form compatibility upstream | derived form engine |
| vvvsrx/get_jobs | `ec3c81c3bf3c09d155cb7f76604e6fca2567612c` | MIT | Zhilian / Liepin / 51job external Site Runtime candidate | external runtime candidate |

The registry verifies upstream source hashes independently from local derived/fork hashes. This distinction matters: the retired Job Application Copilot working tree contains later local changes on top of the OpenJobAutofill Git commit, so its frozen `src/content.js` is not byte-identical to pristine upstream.

## 3. BOSS

### Proven behavior already available

The current BOSS path has mature behavior for:

- keyword/search-page loop;
- job-list traversal;
- preloading and bounded empty-round handling;
- detail-page extraction;
- current-job/company/city/JD evidence;
- already-contacted detection;
- first-contact chat creation;
- recruiter inbox scanning;
- recruiter latest-message inspection;
- resume chooser handling;
- exact resume-index selection;
- resume-sent detection;
- bounded retry/recovery;
- dedicated Chromium profile;
- persistent login state;
- Job Harness-backed scoring and Resume selection;
- Job Harness durable Job / Listing / OutreachEvent recording.

### Current implementation ownership

| Responsibility | Current owner | Keep? |
| --- | --- | --- |
| BOSS DOM/search/chat/resume state machine | `integrations/boss/legacy-copilot.user.js` derived from czc-good-job | Yes; wrap as Site Runtime |
| Generated MV3 compatibility payload | `integrations/boss-copilot/extension/boss-copilot.js` | Yes; generated artifact |
| BOSS network shim | BOSS compatibility extension | Yes until unified runtime transport replaces it |
| Campaign roles | Job Harness | Yes |
| Candidate/Resume facts | Job Harness | Yes |
| Job scoring | Job Harness | Yes |
| Resume index selection | Job Harness | Yes |
| Greeting copy | ChatGPT/Job Harness control plane | Yes |
| Job ledger | Job Harness | Yes |
| Application truth | Job Harness | Yes |
| Old Copilot ledger | retired | No |
| Old copied profile bundle as truth | retired | No |
| Browser Bridge semantic BOSS driver | Job Harness migration/fallback path | Keep temporarily; not default |
| BOSS Browser Worker | Job Harness migration/fallback path | Keep temporarily |

### Duplication to remove later

Do **not** remove until standard Site Runtime canaries pass:

- BOSS semantic driver duplication in the generic Browser Bridge;
- alternate BOSS Browser Worker routing;
- compatibility-specific bridge naming;
- duplicate BOSS retry/state inspection logic that has no production advantage over the mature runtime.

## 4. Generic ATS/form capability

The retired Copilot/OpenJobAutofill lineage already contains form compatibility for:

- standard input/textarea/select;
- radio/checkbox;
- contenteditable / textbox / combobox;
- React/Vue-compatible native writes;
- custom select/autocomplete;
- date/month picker interaction;
- repeated resume sections;
- contextual label/container discovery;
- resume-file input recognition;
- optional AI semantic field mapping.

Site/UI hints already exist for:

- Zhaopin;
- Liepin;
- Nowcoder;
- Moka;
- Beisen/iTalent/iTalentX;
- Feishu Jobs;
- HotJob;
- Zhiye;
- Ant Design;
- Arco Design;
- Element UI;
- TDesign.

Current canonical implementation:

```text
packages/browser-form-engine/browser/runtime.js
```

Generated Browser Bridge copy:

```text
integrations/browser-extension/form-engine.js
```

The generated copy must remain byte-identical to the canonical form engine.

## 5. Current formal-application routing

Current Job Harness typed routing already recognizes:

| Site family | Adapter | Exact site-managed Resume binding required |
| --- | --- | --- |
| Zhilian | `zhilian-ats` | yes |
| Liepin | `liepin-ats` | yes |
| Nowcoder | `nowcoder-ats` | no |
| Moka social recruitment | `moka-social-recruitment` | no |
| Moka-family generic | `legacy-moka-ats` | no |
| Beisen / iTalentX | `beisen-ats` | no |
| Feishu Jobs | `feishu-jobs-ats` | no |
| HotJob | `hotjob-ats` | no |
| Zhiye | `zhiye-ats` | no |

These adapters remain valid as:

- typed business/runtime boundaries;
- fallback routing;
- characterization targets;
- evidence validation.

They should **not** become justification for rewriting an upstream site state machine one DOM action at a time.

## 6. Current browser execution paths

### Path A — BOSS compatibility runtime

```text
Dedicated Edge/Chrome
  -> BOSS compatibility extension
  -> mature BOSS userscript
  -> BOSS Outreach Bridge
  -> Job Harness
```

Production preference for BOSS today.

### Path B — generic Browser Bridge

```text
Apply Worker
  -> BrowserDriverPort
  -> Browser Extension Bridge
  -> page-driver + shared form-engine
  -> recruiting/ATS page
```

Production/fallback path for general ATS filling.

### Path C — dedicated browser providers

Steel / local CDP and browser-worker code remain available for characterization, fallback and future runtime composition. They are not grounds for maintaining a second independent implementation of every mature site flow.

## 7. Current automation policy boundary

Campaign automation now separates:

```text
collection.enabled

officialSite.prepareEnabled
officialSite.fillEnabled
officialSite.submitEnabled
officialSite.preferredResumeProfileId

email.draftEnabled
email.sendEnabled
email.preferredResumeProfileId
```

Default official-site behavior is still safe-fill without final submit. If `officialSite.submitEnabled=true`, the dispatcher may choose `review_then_submit` only when a capable executor exists; final click still requires the existing ReviewSnapshot and one-shot SubmitAuthorization boundary.

This policy should be passed into future Site Runtime tasks at **business-action granularity**, not converted into per-click grants.

## 8. Capability disposition

| Capability | Disposition |
| --- | --- |
| BOSS search loop | reuse upstream-derived runtime |
| BOSS job extraction | reuse upstream-derived runtime |
| BOSS greeting | reuse browser state machine; Job Harness owns policy/copy |
| BOSS recruiter inbox | reuse upstream-derived runtime |
| BOSS resume follow-up | reuse browser state machine; Job Harness owns authorization/Resume selection |
| Zhilian form fill | prefer shared upstream-derived form runtime; keep typed adapter/binding |
| Liepin form fill | prefer shared upstream-derived form runtime; keep typed adapter/binding |
| Nowcoder form fill/application entry | keep proven typed behavior; avoid duplicate selectors elsewhere |
| Moka/Beisen/Feishu/HotJob/Zhiye form compatibility | use upstream-derived form runtime before writing new site patches |
| Generic unknown ATS | BrowserDriver + form engine + bounded semantic fallback |
| Final submit evidence | Job Harness |
| Resume truth | Job Harness |
| Job/Application truth | Job Harness |
| Site login/session | dedicated browser profile |
| Extension/runtime lifecycle | future Browser Supervisor |

## 9. Phase-0 decisions

1. `czc-good-job` is a direct Site Runtime upstream, not merely an architecture reference.
2. `OpenJobAutofill` is the canonical provenance/upstream for the generic form compatibility layer.
3. The current Job Application Copilot snapshot is a **fork snapshot**, not pristine OpenJobAutofill; hashes are tracked separately.
4. Generic Browser Bridge primitives remain supported but are fallback/development infrastructure.
5. No additional site-specific selector work should begin before checking the upstream registry and this inventory.
6. Any new third-party browser runtime must enter `integrations/upstreams/registry.json` with exact repository, license, pin and local integration disposition before code is copied.
7. Upstream sync creates a candidate under `.tmp/upstreams`; it never mutates the production runtime automatically.
8. Promotion requires characterization and a bounded real-browser canary.

## 10. Multi-platform external Runtime candidate

A current MIT-licensed multi-platform candidate is now pinned as `vvvsrx-get-jobs`. It contains separate Camoufox/Playwright workers and locator modules for 智联招聘、猎聘 and 51job, together with explicit start/stop/status/login-status API boundaries and cooperative cancellation. Its upstream code also contains platform stop conditions such as login loss, visit verification and daily delivery limits.

This candidate is intentionally **not** copied into Job Harness domain packages. It is now production-connected only as a separate **collect-only external Site Runtime** for 智联、猎聘 and 51job. `pnpm upstream:sync vvvsrx-get-jobs` materializes the complete pinned upstream tree into `.tmp/upstreams/.../candidate` and applies only thin Job Harness integration overlays. Those overlays do not replace platform selectors/state machines: they add a verifiable `collect-only` runtime marker, suppress recruiter-facing delivery clicks when `JOB_HARNESS_GET_JOBS_COLLECT_ONLY=1`, expose the already-persisted rich job fields through the upstream list API, and make interactive login singleton-per-platform so repeated login requests cannot spawn multiple Camoufox windows. The Runtime is self-updating from the Job Harness Runtime Channel and remains independently hosted in WSL/WSLg. Job Harness retains Campaign/Resume/Job/Application ownership. BOSS remains on the already-proven `czc-good-job` path rather than switching browser engines merely because this candidate also contains BOSS code.

Promotion sequence:

```text
upstream pin + characterization
  -> external wrapper contract
  -> discovery-only/paused canary per site
  -> Job Harness evidence mapping
  -> bounded fill/apply canary
  -> production promotion
```

The characterization gate currently verifies the upstream API lifecycle, cooperative stop state, Camoufox/Playwright dependency, site-specific workers/locators, platform stop-limit signals, the collect-only guards, singleton interactive-login lifecycle, rich list fields and Python syntax. Job Harness exposes the wrapper through coarse MCP status/start/stop/sync tools. `apps/server/src/get-jobs-runtime.ts` is now only a compatibility facade; transport/health, row mapping, canonical sync and MCP orchestration live under `apps/server/src/recruitment-runtime/get-jobs/`. The control plane validates the collect-only marker before allowing a collection start, derives search keywords/cities from Campaign policy, maps upstream cached rows into canonical Job/Listing candidates, and deliberately treats upstream `delivered` only as metadata rather than Application truth. Canonical Job upsert also rejects strong external identities when the incoming company/title evidence conflicts with the existing owner.

### 10.1 智联 collect-only canary status

The first real 智联 browser/runtime canary proved login persistence and collect-only execution: a Hangzhou run with `Agent`, `全栈开发` and `前端开发` observed 180 card traversals with **0 recruiter-facing deliveries**. That early cache is no longer an accepted canonical-sync candidate. Follow-up reconciliation exposed a stale-detail-panel identity bug in the upstream-derived page flow: after clicking card A, the global right-side detail panel could still expose card B's `/jobdetail/<id>.htm`, which could cross-bind a strong external identity. The affected canonical sync was rolled back from a verified backup; Application truth was preserved.

The overlay now waits for the global detail panel to match the clicked card's normalized title **and** company before accepting the official 智联 detail URL, while the Job Harness mapper refuses synthetic MD5 IDs as 智联 canonical external IDs. A second fail-closed guard at the Career application boundary rejects any existing strong external identity whose company/title evidence conflicts with the incoming candidate. Therefore the next workstation-dependent proof is a **fresh** verified-detail canary; the superseded 180-row cache must not be imported.

## 11. Upstream commands

```bash
pnpm upstream:check
pnpm upstream:report
pnpm upstream:diff czc-good-job
pnpm upstream:sync czc-good-job
pnpm upstream:test czc-good-job

pnpm upstream:diff openjobautofill
pnpm upstream:sync openjobautofill
pnpm upstream:test openjobautofill

pnpm upstream:diff vvvsrx-get-jobs
pnpm upstream:sync vvvsrx-get-jobs
pnpm upstream:test vvvsrx-get-jobs
```

Semantics:

- `check`: verify registry hashes/local baselines and compare remote HEAD;
- `report`: generate review-only Markdown/JSON UpgradeCandidate evidence for all tracked upstreams, including tracked-path drift, overlay compatibility, license-hash drift and promotion policy;
- `diff`: report remote movement and whether a local overlay still applies;
- `sync`: materialize a non-production candidate under `.tmp/upstreams`;
- `test`: run the candidate/build characterization gates plus current integration regression checks.

## 12. Next migration boundary

RBR-002 is now implemented: the versioned Runtime Channel and self-updating Windows Supervisor own dedicated-browser startup, extension bundle promotion, runtime versioning and crash recovery without changing Job Harness domain ownership. BOSS heartbeat self-heal is circuit-broken: after one dedicated-browser restart for a task, the Supervisor waits for a real Runtime heartbeat recovery before allowing another restart and also enforces a 15-minute cooldown. This prevents the previous close/reopen loop when the page is healthy but the Runtime heartbeat stays stale.

RBR-003 is now implemented and production-deployed for BOSS: `boss-czc-good-job` exposes coarse Runtime descriptor/control/events while keeping the upstream-derived browser state machine intact. Campaign outreach policy, task TTL and per-run external-effect budget are enforced server-side.

The external multi-platform wrapper is now production-connected in collect-only mode. The next workstation-dependent boundary is a fresh 智联 verified-detail login + collect-only + canonical-sync proof under the strengthened identity guards, then the same proof for 猎聘 and 51job one site at a time. Do not enable any upstream final delivery action until Job Harness can freeze the intended Resume/site binding and reconcile success evidence without trusting the upstream ledger as canonical truth.
