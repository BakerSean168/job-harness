# Recruiting-site live shadow validation

Updated: 2026-09-17

This document records **read-only live-site evidence** for R019. A successful row means the isolated Steel browser could navigate and inspect public DOM metadata. It does **not** mean Job Harness is allowed to submit, that authentication is healthy, or that the site has a production-grade adapter.

The validation command is `pnpm smoke:apply-shadow-inspect` with `JOB_HARNESS_SHADOW_URL`. The utility accepts HTTPS targets only, uses a fresh Steel session, performs no fill/click/upload/submit, outputs only sanitized field metadata/action text, then releases the session.

| Site | Evidence | Result | Adapter implication |
| --- | --- | --- | --- |
| Moka / DeepSeek | `app.mokahr.com/social-recruitment/high-flyer/...#/job/...` | Job detail loaded; title `DeepSeek招聘`. Only the site search input appeared in FormIR. A broad `[class*=apply] button` candidate resolved to `分享`, proving that class-name guessing is unsafe. | Do not use broad apply selectors. Build a Moka-specific application-entry detector from exact DOM/state evidence before any click. |
| BOSS 直聘 | `www.zhipin.com/job_detail/...` | Fresh isolated session was redirected to `web/passport/zp/security.html`, title `请稍候 - BOSS直聘`, with no form controls. | BOSS requires authenticated/persisted session + explicit human/security handoff. Keep discovery/outreach separate from formal ATS submission. |
| 牛客 | `www.nowcoder.com/jobs/detail/457892` | Public job detail loaded, title `AI 软件开发工程师_英特尔校招_牛客网`. `立即申请` was visible. The page also exposed phone/verification-code controls, but the shadow run did not click the action. | Candidate for a deterministic Nowcoder adapter, but application-entry semantics/login state must be characterized before enabling any mutation. |
| 智联招聘 | `www.zhaopin.com/jobdetail/...` | Navigation did not reach `domcontentloaded` within the bounded 45 s probe. No mutation was attempted. | Generic fallback is not considered reliable. Add a Zhaopin-specific navigation/auth/anti-bot strategy with human fallback. |

## Promotion gate

A site is **not** promoted from shadow to form-fill merely because a job page loads. Before `allowFormFill=true` can be used for that site, evidence must establish all of the following:

1. exact job/listing identity survives navigation;
2. the application-entry action is deterministic and is not itself the irreversible submit boundary;
3. login/security/CAPTCHA states are typed and fail closed to human handoff;
4. the resulting application form can be inspected without submitting;
5. Resume upload can be bound to the frozen Job Harness Artifact;
6. required legal/protected questions remain literal-only/manual;
7. the adapter has sanitized fixture/contract tests for the observed DOM family.

`review_then_submit` requires a further gate: explicit success evidence, crash/recovery tests, ReviewSnapshot hash binding and one-time SubmitAuthorization. `auto_submit` remains per-adapter opt-in only after supervised production evidence.

## Follow-up: exact action inventory and anonymous entry characterization

The browser boundary now exposes `scanActions()` as sanitized visible-action metadata (`tag`, text, href/type/role, disabled state) with stable ephemeral action refs. This replaces CSS-class guessing in shadow work. The worker runtime also retries transient control-plane registration/poll failures in-process with bounded backoff instead of relying on repeated systemd restarts during a server rollout.

A second anonymous Nowcoder characterization used a fresh non-persisted Steel session and clicked only the exact visible `button` whose text was `立即申请`. No candidate data was filled and no submit action was performed. The page stayed on the same job URL and exposed a login/registration surface containing phone-number and verification-code controls plus `登录 / 注册` actions. This establishes that `立即申请` is a **pre-submit entry action** for this unauthenticated state, but form automation must stop for human authentication rather than mapping applicant phone data into the login form.

The generic fallback now fails closed in two additional ways: sparse search/job-detail surfaces are not considered application forms, and login/registration/password/OTP/verification surfaces are blocked before applicant values are written. Even a perfectly filled generic form is never marked `readyForSubmit`; only a site adapter with an explicit submit/evidence contract may opt a ReviewSnapshot into submit authorization.


## Typed preflight state — follow-up

The reusable preflight classifier now runs before FormIR filling and persists only sanitized evidence counts/text labels. Current read-only results are:

- Nowcoder public job detail: `job_detail`, exact apply action text `立即申请`, no automatic entry click.
- Moka social-recruitment job detail: `job_detail`; sparse search control is not mistaken for an application form.
- BOSS anonymous security redirect: `security_challenge`; no applicant data is resolved and the session is handed to a human.

Traffic-derived `nowcoder-ats` and `moka-social-recruitment` adapters are registered for form-fill routing, but both remain `submit=false`. Promotion to submit capability still requires a verified irreversible action plus exact success-evidence contract and an explicitly authorized live canary.

## Ephemeral end-to-end preflight smoke

`pnpm smoke:apply-live-preflight` now exercises a temporary Job Harness server/database plus the real Steel-backed worker against the characterized Nowcoder job-detail family. The smoke creates no production Job/Application state and is restricted to that HTTPS URL family. The first live proof selected `nowcoder-ats` and ended at `waiting_for_user / human-entry:job_detail` with `externalEffectState=not_crossed`, zero ReviewSnapshots, zero Applications, a still-planned SubmissionIntent, a released browser handoff, and zero external actions. This is the promotion proof for **safe live preflight/handoff**, not for form submission.

## Durable ephemeral preflight smoke

A repeatable integration smoke now exercises the real Job Harness Attempt protocol and real Steel browser against the observed Nowcoder public job-detail family without touching production Career state. `pnpm smoke:apply-live-preflight` starts a temporary authenticated Job Harness server/SQLite database, seeds one temporary Listing/SubmissionIntent, dispatches a `fill_only` Attempt requiring `nowcoder-ats`, and runs one scoped worker cycle through the normal REST lease/control-plane path.

The current proof ends in `waiting_for_user` at `human-entry:job_detail`, with adapter `nowcoder-ats`, `externalEffectState=not_crossed`, **0 ReviewSnapshots**, **0 Applications**, and the SubmissionIntent still `planned`. The retained anonymous Steel browser is explicitly resumed/released during cleanup. The smoke performs **0 external actions**: no click, fill, upload, or submit. This is stronger than a standalone DOM probe because it proves the durable Job Harness state machine also fails closed on the live surface.
