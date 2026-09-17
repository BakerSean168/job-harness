# Job Harness Browser Bridge

This is a deliberately narrow MV3 browser companion for the R019 Apply Executor. It is **not** a second Job Harness and it does not own Job/Application ledgers, Resume Profiles, scoring, outreach policy, SubmissionIntent state or final-submit authorization.

## Boundary

The extension has two layers:

- `background.js` owns the authenticated long-poll bridge, user-owned Chrome tab/session references and browser-level navigation.
- `page-driver.js` owns only `BrowserDriverPort`-shaped DOM primitives (scan/fill/select/check/click/upload/hash). It knows nothing about Jobs, Resumes, Applications or SubmissionIntents.

The server-side relay is in-memory. Command payloads, including field values and optional PDF bytes, are never written to Job Harness SQLite. The extension bearer can only register/poll/report bridge commands; it cannot access Career, Resume, Apply control-plane or MCP routes. The worker bearer can invoke the bridge but cannot impersonate the extension agent.

`resumeUpload` and `screenshots` are disabled by default. A user-browser worker must advertise only capabilities that the paired extension has explicitly enabled. Final recruiting-site submission remains outside this extension: R019 still requires a site-specific submit adapter, ReviewSnapshot and one-shot SubmitAuthorization before the irreversible action is enabled.

## Development install

Load this directory as an unpacked extension in Chrome. In Job Harness Settings generate a short-lived one-time pairing code. In Extension Options configure the dedicated HTTPS bridge URL, Agent ID and that pairing code, then enable the bridge. The extension exchanges the code directly for an HMAC-scoped Agent Token and stores it only in Chrome local extension storage; the long-lived signing key never leaves Oracle2 and no token is committed to this repository.


## Provenance

The old `job-application-copilot` Chrome extension was inspected only to characterize useful behaviors and migration boundaries. No ledger, resume-bundle, scoring, monolithic `content.js`, or old server contract is copied here. The bridge/page-driver code is a clean implementation of Job Harness `BrowserBackendPort`/`BrowserDriverPort` and the R019 typed protocol.
