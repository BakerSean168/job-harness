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
| BOSS keyword rotation/search and job-list traversal | vendored czc-good-job-derived userscript | recovered |
| BOSS rule scoring | Job Harness resume/job scoring through Outreach Bridge | recovered |
| BOSS first greeting | vendored userscript + Outreach Bridge | recovered |
| BOSS recruiter follow-up resume send | vendored userscript + policy gate | recovered |
| BOSS autonomous multi-turn LLM chat | deliberately not enabled; old public mainline did not require it | not part of production parity |
| OpenJobAutofill optional AI semantic field mapping | value-free OpenAI-compatible semantic mapper with typed proposal validation, protected/legal exclusion and deterministic fallback | recovered; opt-in runtime credential |
| Popup quick-copy/profile-reference panel | canonical Applicant/Resume UI replaces storage ownership, but one-click current-page reference UX is not yet equivalent | pending |
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

The BOSS DOM implementation is now physically owned by Job Harness at:

```text
integrations/boss/legacy-copilot.user.js
```

It no longer depends on the retired `/home/ubuntu/projects/job-application-copilot` checkout at runtime. The userscript is derived from czc-good-job and is patched by Job Harness before serving. The Tailnet-only Outreach Bridge supplies current target roles, deterministic job scoring, selected resume lane, greeting copy, event logging and resume-follow-up policy.

The BOSS browser layer is intentionally separate from generic ATS Form Engine because BOSS is a search/list/detail/chat workflow rather than a normal application form.

## Regression guard

`pnpm check:legacy-copilot-parity` fails when:

- a recovered observed ATS adapter disappears;
- representative URLs stop resolving to the expected canonical adapter;
- Browser Form Engine loses the OpenJobAutofill-derived compatibility primitives;
- BOSS search/chat/resume DOM primitives disappear from the vendored source;
- the BOSS bridge regains a runtime dependency on the retired Copilot checkout;
- automatic dispatch stops being `fill_only` / `submitAllowed=false`;
- third-party attribution disappears.

## Remaining parity work

The remaining legacy capabilities should be recovered in this order:

1. restore current-page quick-copy/reference ergonomics without putting Applicant or Resume truth back into browser storage;
2. add real-page regression canaries for Moka / Beisen / Feishu / HotJob / Zhiye using the shared engine;
3. only after parity is closed, extend beyond legacy behavior (more discovery providers and supervised submit adapters).

The semantic mapper is intentionally optional at runtime. It receives only `SemanticMappingView` metadata (field structure and value-free catalog labels/aliases), never resolved Applicant values. Protected/legal catalog entries and any entry with `allowAiMapping=false` are excluded before the network request; returned field/key IDs are checked against the same allowlist and only high-confidence proposals can enter `buildFillPlan`. Provider outages fail back to deterministic local mapping rather than failing the application attempt.
