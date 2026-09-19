# Job Harness Browser Bridge

This is a deliberately narrow MV3 browser companion for the R019 Apply Executor. It is **not** a second Job Harness and it does not own Job/Application ledgers, Resume Profiles, scoring, outreach policy, SubmissionIntent state or final-submit authorization.

## Boundary

The extension has three layers:

- `background.js` owns the authenticated long-poll bridge, user-owned Chrome tab/session references and browser-level navigation.
- `page-driver.js` owns the narrow `BrowserDriverPort` transport surface (scan/fill/select/check/click/upload/hash) and delegates form compatibility instead of accumulating ATS-specific DOM patches.
- `form-engine.js` is an exact generated copy of the canonical `packages/browser-form-engine/browser/runtime.js`. It is derived from the MIT-licensed Job Application Copilot / OpenJobAutofill form engine and owns only DOM compatibility: richer field discovery, recruiting-site/UI-framework hints, framework-compatible writes, custom choices and date/month pickers.

The server-side relay is in-memory. Command payloads, including field values and optional PDF bytes, are never written to Job Harness SQLite. The extension bearer can only register/poll/report bridge commands; it cannot access Career, Resume, Apply control-plane or MCP routes. The worker bearer can invoke the bridge but cannot impersonate the extension agent.

`resumeUpload` and `screenshots` are disabled by default. A user-browser worker must advertise only capabilities that the paired extension has explicitly enabled. Final recruiting-site submission remains outside this extension: R019 still requires a site-specific submit adapter, ReviewSnapshot and one-shot SubmitAuthorization before the irreversible action is enabled.

## Development install

Load this directory as an unpacked extension in Chrome. In Job Harness Settings generate a short-lived one-time pairing code. In Extension Options configure the dedicated HTTPS bridge URL, Agent ID and that pairing code, then enable the bridge. The extension exchanges the code directly for an HMAC-scoped Agent Token and stores it only in Chrome local extension storage; the long-lived signing key never leaves Oracle2 and no token is committed to this repository.


## Provenance

Job Harness now deliberately reuses the mature browser-form compatibility layer from the old `job-application-copilot`, which itself directly evolved the MIT-licensed OpenJobAutofill project. Only the form/DOM compatibility responsibility is migrated. The old browser-local ledger, profile bundle, scoring, resume-selection ownership and server contract remain excluded; Job Harness `ApplicantProfile`, immutable Resume Revision/Artifact, SubmissionIntent/Application, execution leases, auditing and submit authorization remain canonical. See the repository-level `NOTICE.md` for attribution and license details.
