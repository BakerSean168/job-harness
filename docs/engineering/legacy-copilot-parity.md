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
| BOSS keyword rotation/search and job-list traversal | `@job-harness/boss-browser-worker` + Browser Bridge `boss-discovery` scope | recovered |
| BOSS rule scoring | Job Harness resume/job scoring through Outreach Bridge | recovered |
| BOSS first greeting | Browser Bridge semantic BOSS driver + exact-message `boss-outreach` grant | recovered; production feature gate defaults off |
| BOSS recruiter follow-up resume send | read-only unread-chat inspection + existing follow-up policy + exact job/resume `boss-outreach` grant | recovered; production feature gate defaults off |
| BOSS direct Browser Provider (Windows Chrome / Steel / Local CDP search-detail-score) | `@job-harness/boss-browser-worker` + shared BrowserBackendPort + canonical BOSS bridge | recovered |
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

The mature czc-good-job-derived compatibility source remains owned by Job Harness at `integrations/boss/legacy-copilot.user.js` as a parity/reference implementation, but the production client path no longer requires Tampermonkey. BOSS-specific DOM behavior needed by Browser Bridge lives in `integrations/browser-extension/boss-driver.js`, while Job Harness Server owns the narrow authority scopes and the Tailnet-only Outreach Bridge supplies current target roles, deterministic job scoring, selected resume lane, greeting copy, event logging and resume-follow-up policy.

The BOSS browser layer is intentionally separate from generic ATS Form Engine because BOSS is a search/list/detail/chat workflow rather than a normal application form. Site-specific DOM code may describe/execute one semantic BOSS operation, but it cannot choose whether that operation is allowed: the Server must issue a matching typed validation run first.

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

## BOSS direct Browser Provider

`@job-harness/boss-browser-worker` restores the old Copilot's BOSS Browser Provider without reviving its separate profile bundle or scoring implementation. The preferred production backend is the user-owned Windows Chrome through Browser Bridge; Steel and Local CDP remain fallback/debug backends. The discovery runtime rotates current target-role keywords supplied by the BOSS bridge, scans result links, visits bounded job-detail pages, and sends those details back through the canonical BOSS bridge for Resume ranking and `DiscoveryRun -> JobObservation` ingestion. Login/human-verification states fail closed and surface the backend human-control path when available. Recruiter-facing operations are separate optional ports and are disabled by default.

The Browser Bridge path separates authority into three scopes. `boss-discovery` requires Bridge >=0.2.2 and permits only search/query navigation plus read-only job-detail inspection; it cannot enter chat or perform recruiter-facing effects. `boss-chat-inspect` requires Bridge >=0.2.3 and can only inspect/open unread conversations and extract structural chat/job evidence; it cannot send messages or resumes. `boss-outreach` requires Bridge >=0.2.3 plus a server-frozen intent. A greet intent binds one exact scored job, score threshold, Resume lane and exact greeting text, then allows at most one chat preparation and one exact text send. A resume-followup intent binds one exact conversation job, policy authorization reason and Resume index, then allows at most one chooser preparation and one exact-index confirmation. Job mismatch, altered greeting text, altered Resume index, repeated sends, unsupported dialogs and ambiguous selection all fail closed.

`JOB_HARNESS_BOSS_GREET_ENABLED` and `JOB_HARNESS_BOSS_RESUME_FOLLOWUP_ENABLED` default to false. Restoring the legacy capability therefore does not silently activate recruiter-facing side effects. LLM multi-turn recruiter chat, rejection messages and portfolio auto-send remain disabled. The shared BrowserDriverPort still provides bounded `scroll(deltaY)` for search traversal; site-specific recruiter actions use typed semantic commands instead of exposing arbitrary `click`/`fill` authority.

## Applicant reference / quick copy

The old browser-local profile reference panel is recovered as an authenticated Job Harness Web panel. It reads the canonical ApplicantProfile and enabled ApplicationAnswerSet, supports search plus one-click value/category/result copying, and is deep-linked from the Browser Bridge popup after registration supplies the existing authenticated Web origin. The extension stores only that Web URL; it still cannot read Career/Applicant/Resume APIs and stores no applicant values.

## Remaining parity work

The remaining legacy recovery is now limited to real-site proof and distribution ergonomics. Formal ATS canaries still need broader Moka / Beisen / Feishu / HotJob / Zhiye coverage, and unpacked-extension delivery still requires a manual Chrome reload. BOSS discovery has a live production proof; recruiter greeting/resume-followup now have synthetic semantic/policy coverage but remain feature-gated until an explicitly authorized live canary is performed.

The semantic mapper is intentionally optional at runtime. It receives only `SemanticMappingView` metadata (field structure and value-free catalog labels/aliases), never resolved Applicant values. Protected/legal catalog entries and any entry with `allowAiMapping=false` are excluded before the network request; returned field/key IDs are checked against the same allowlist and only high-confidence proposals can enter `buildFillPlan`. Provider outages fail back to deterministic local mapping rather than failing the application attempt.
