# Legacy Job Application Copilot capability recovery

Status: active migration baseline for Job Harness 0.2.x.

The goal is **functional recovery without restoring the old ownership model**. The retired Job Application Copilot remains a reference implementation only. Job Harness owns Career, Applicant, Resume, SubmissionIntent, Application, audit and external-effect authorization. Mature browser compatibility is reused where it is already proven.

## Capability map

| Legacy capability | Job Harness owner / implementation | Recovery status |
| --- | --- | --- |
| OpenJobAutofill field discovery and controlled-input writes | `packages/browser-form-engine` | recovered |
| Custom select / autocomplete / date-month controls | shared Browser Form Engine | recovered |
| Liepin / Zhaopin / Nowcoder / Moka / Beisen / Feishu / HotJob / Zhiye page hints | Browser Form Engine + typed Apply adapters | recovered |
| Resume/CV-only upload routing | immutable Resume Artifact grant + generic fill runtime | recovered |
| Multiple resume profiles | Resume Domain | recovered and expanded |
| Per-job resume recommendation | `@job-harness/resume-application` | recovered and canonical |
| Browser-local application ledger | Career/Application domain | superseded |
| BOSS keyword rotation/search and job-list traversal | dedicated BOSS Copilot compatibility runtime (proven legacy DOM loop) | recovered; preferred production path |
| BOSS rule scoring | Job Harness resume/job scoring through Outreach Bridge | recovered |
| BOSS first greeting | dedicated Copilot compatibility runtime + Job Harness-generated greeting | recovered; preferred production path |
| BOSS recruiter follow-up resume send | dedicated Copilot compatibility runtime + Job Harness follow-up policy / resumeIndex | recovered; preferred production path |
| BOSS direct Browser Provider (Windows Chrome / Steel / Local CDP search-detail-score) | retained source snapshot + Browser Bridge migration path | recovered; migration/fallback path |
| BOSS autonomous multi-turn LLM chat | deliberately not enabled; old public mainline did not require it | not part of production parity |
| OpenJobAutofill optional AI semantic field mapping | value-free OpenAI-compatible semantic mapper with typed proposal validation, protected/legal exclusion and deterministic fallback | recovered; opt-in runtime credential |
| Popup quick-copy/profile-reference panel | authenticated Web reference panel + Browser Bridge popup deep-link; canonical Applicant/AnswerSet stays server-owned | recovered |
| Extension update/private-channel profile bundle | canonical Server/Web + unpacked Bridge replace profile bundle; automated client distribution still separate | superseded / partial UX parity |
| Final ATS submit | old Copilot explicitly required human final submit; Job Harness keeps final submit behind typed authorization | parity preserved, not widened |

## Automatic safe-fill routing

The automatic SubmissionIntent dispatcher resolves the same canonical observed-site adapters as the Apply Worker; there is no second hard-coded routing table.

Automatically recognized formal-application families:

- Zhilian -> `zhilian-ats` (requires exact SiteResumeBinding)
- Liepin direct-hire -> `liepin-ats` (requires exact SiteResumeBinding)
- Nowcoder -> `nowcoder-ats`
- Moka social recruitment -> `moka-social-recruitment`
- other Moka-family hosts -> `legacy-moka-ats`
- Beisen / iTalentX -> `beisen-ats`
- Feishu Jobs -> `feishu-jobs-ats`
- HotJob -> `hotjob-ats`
- Zhiye -> `zhiye-ats`

Every automatic dispatch remains:

```text
executionMode = fill_only
allowFormFill = true
allowApplicationEntry = true
submitAllowed = false
```

This restores the old Copilot's practical automatic-fill coverage without silently expanding it into unattended final submission.

## BOSS ownership

The mature czc-good-job-derived BOSS implementation remains owned by Job Harness at `integrations/boss/legacy-copilot.user.js` and is now the preferred production compatibility path. `pnpm build:boss-copilot-compat` patches that source with the current Job Harness follow-up policy and emits an unpacked MV3 extension under `integrations/boss-copilot/extension`. The old userscript therefore runs directly inside a dedicated Edge/Chrome profile and no longer requires Tampermonkey. A tiny extension service worker implements the old `GM.xmlHttpRequest` contract and can reach only `https://oracle.taile92a8e.ts.net:10444`, avoiding public-page -> Tailnet Private Network Access/CORS restrictions without creating a general network proxy. The userscript retains a normal `fetch` fallback for non-extension embedding.

Job Harness keeps ownership of current target roles, ApplicantProfile, Resume Profiles, per-job ranking, greeting copy, resumeIndex selection, DiscoveryRun ingestion and action logs. The compatibility runtime deliberately keeps the already-characterized BOSS-specific search/detail/chat/resume DOM state machine instead of rewriting it. A source snapshot from retired `job-application-copilot` commit `005eda98841b3671ead615ebfde5922f0dfd7c36` is vendored under `integrations/boss-copilot/legacy/source-snapshot`; `.git`, `node_modules`, runtime state and stale `profile-bundle.json` applicant values are intentionally excluded.

The Browser Bridge 0.2.3 semantic BOSS implementation remains in-tree as a gradual-replacement path. It is no longer the production default for BOSS, so future migration can replace individual Copilot capabilities after real-site proof instead of requiring an all-at-once rewrite.

## Regression guard

`pnpm check:legacy-copilot-parity` fails when:

- a recovered observed ATS adapter disappears;
- representative URLs stop resolving to the expected canonical adapter;
- Browser Form Engine loses the OpenJobAutofill-derived compatibility primitives;
- BOSS search/chat/resume DOM primitives disappear from the vendored source or semantic Browser Bridge driver;
- BOSS resume-followup runtime loses its explicit-request / qualified-followup policy gate;
- the BOSS bridge regains a runtime dependency on the retired Copilot checkout;
- automatic dispatch stops being `fill_only` / `submitAllowed=false`;
- third-party attribution disappears.

## BOSS dedicated compatibility browser

`integrations/boss-copilot/windows/start-boss-copilot.ps1` starts an isolated persistent browser profile at `%LOCALAPPDATA%\JobHarness\BossCopilot\Profile`, prefers Edge and falls back to Chrome, exposes localhost CDP on port 9222 for inspection, and loads only the Job Harness-owned unpacked compatibility extension. This recreates the proven old Copilot operating model: the job automation runs in a dedicated browser window rather than injecting tabs into the user's normal Chrome profile. The Copilot overlay starts paused; clicking `开始` starts the legacy keyword/search/detail/greet loop.

The Browser Bridge path is retained as a migration/fallback implementation. Its scopes remain `boss-discovery`, `boss-chat-inspect` and `boss-outreach`, and its recruiter-facing feature gates remain off by default. The compatibility runtime does not use those micro-grants for each DOM click; instead it relies on the mature site-specific state machine plus coarser boundaries: dedicated profile, zhipin-only content-script match, Job Harness scoring/resume selection, follow-up policy, duplicate checks in the legacy flow and centralized action logging. LLM multi-turn recruiter chat, automatic rejection messages and portfolio auto-send remain disabled.

## Applicant reference / quick copy

The old browser-local profile reference panel is recovered as an authenticated Job Harness Web panel. It reads the canonical ApplicantProfile and enabled ApplicationAnswerSet, supports search plus one-click value/category/result copying, and is deep-linked from the Browser Bridge popup after registration supplies the existing authenticated Web origin. The extension stores only that Web URL; it still cannot read Career/Applicant/Resume APIs and stores no applicant values.

## Remaining parity work

BOSS compatibility recovery is now code-complete: the mature Copilot code is vendored, can run without Tampermonkey in a dedicated Chromium profile, and consumes Job Harness scoring/resume/policy data. The remaining BOSS work is operational proof only: one paused real-browser launch, login persistence, then a deliberately bounded live run when recruiter-facing effects are intended. Browser Bridge 0.2.3 is frozen as the future migration path rather than blocking production parity. Formal ATS canaries still need broader Moka / Beisen / Feishu / HotJob / Zhiye coverage.

The semantic mapper is intentionally optional at runtime. It receives only `SemanticMappingView` metadata (field structure and value-free catalog labels/aliases), never resolved Applicant values. Protected/legal catalog entries and any entry with `allowAiMapping=false` are excluded before the network request; returned field/key IDs are checked against the same allowlist and only high-confidence proposals can enter `buildFillPlan`. Provider outages fail back to deterministic local mapping rather than failing the application attempt.
