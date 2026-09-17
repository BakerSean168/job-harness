# Legacy Job Application Copilot baseline for R019

Status: frozen characterization evidence, 2026-09-17.

R019 uses a strangler migration. This document freezes the current behavior/provenance of `/home/ubuntu/projects/job-application-copilot` before browser capabilities are extracted. The old repository remains a compatibility/reference runtime; Job Harness does not copy its ledger or profile ownership into the new Apply domain.

## Source provenance

The legacy repository's tracked upstream base is:

- upstream: `https://github.com/Br1an67/OpenJobAutofill.git`
- base commit: `005eda98841b3671ead615ebfde5922f0dfd7c36`
- base commit subject: `Improve CN site autofill with AI-first matching`
- license: MIT, retained by the legacy repository and compatible with refactoring genuinely derived code when attribution is preserved.

The working tree contains substantial later local work that is not represented by that upstream commit, so the R019 freeze uses file hashes rather than pretending the Git commit alone identifies the runtime.

Key baseline hashes:

| File | SHA-256 |
| --- | --- |
| `src/content.js` | `4fac52a46c02226a5988955d2c9cf44eda724b9485dfbdf92ff0d6f58dafc3da` |
| `src/background.js` | `fc790a5a40caf9b1d419c619c54d568a1a0dc64b958519f55af1e7ed93be72c6` |
| `scripts/browser/steel-provider.mjs` | `32aca1ea937a96deffe85b6562c2a62da8cb7938caa9c2b69c503163802568e4` |
| `scripts/browser/local-cdp-provider.mjs` | `6812f5a64e2d951c95c937f8ae7003037f7dc2981981005c62bd0eb1d22a3122` |
| `scripts/browser/boss-adapter.mjs` | `ab3fb4b8907a8c186ce18b7d9eb195f7c5a5aa0bbaea1569f7f00a496bc4252c` |
| `scripts/boss-browser-screen.mjs` | `e4e9bc1097657cae480c58c403f68b39d2e4ba95f95f6054b03b41227d520448` |
| `LICENSE` | `d939baf1018f96e20ed25a09ac6b3eb3ece9f0ad4997bce342ad4383522617d2` |

R019 code that is actually derived from the OpenJobAutofill form scanner/filler must carry attribution. Architecture-only references such as GPL/AGPL projects listed in `apply-executor-benchmark.md` are not code sources.

## Characterization results

The legacy `pnpm check` passed on 2026-09-17: syntax checks plus **14/14 tests**. Those tests characterize job-ledger dedupe, source handling, company locks and the three resume-lane scoring behaviors. They are historical compatibility evidence, not a contract that Job Harness should preserve old ledger/profile ownership.

The synthetic browser/resume fixture `pnpm test:e2e` also passed and reported:

```text
resume/autofill e2e passed for 3 profiles
```

This freezes the current extension behavior for form filling/resume upload before the new FormIR/FillPlan layer replaces the monolithic `content.js` ownership.

A non-destructive Steel session persistence smoke also passed against `example.com`: a session was released, recreated from the saved context, and restored cookie/localStorage/sessionStorage state successfully. No recruiting site was modified by this smoke. This is the behavioral baseline for the new `SteelBrowserBackend`; it does not justify copying the legacy provider implementation line-for-line.

## Migration rule

The baseline is evidence, not the target architecture. R019 may deliberately change APIs and file layout as long as equivalent required behavior is covered by new contract/fixture tests. In particular:

- old Job Ledger APIs are not migrated as executor state;
- old `applications[]` browser storage is not authoritative;
- old profile bundles do not become Job Harness Resume truth;
- BOSS discovery/scoring remains separate from formal application submission;
- browser provider behavior is re-expressed behind typed backend/session ports;
- form scan/write behavior is migrated behind a DOM-free FormIR/FillPlan boundary;
- all external submit behavior must use SubmissionIntent + ExecutionAttempt safety gates.
