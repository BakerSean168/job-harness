# Third-party notices

Job Application Copilot intentionally reuses open-source work instead of rebuilding mature browser-form infrastructure from scratch.

## OpenJobAutofill

- Project: OpenJobAutofill
- Upstream: https://github.com/Br1an67/OpenJobAutofill
- License: MIT
- Usage in this repository: **code base / direct fork**. The form scanner, local profile editor, field matching, framework-compatible value writing, optional AI field mapping, and Chinese recruitment-site compatibility originate from or evolve from this upstream project.
- The upstream MIT license is retained in `LICENSE` and the Git history/`upstream` remote is preserved.

## czc-good-job

- Project: goodjob / czc-good-job
- Upstream: https://github.com/czc6666/czc-good-job
- License: MIT
- Usage in this repository: **design reference and optional companion integration**. Its BOSS-oriented approach of JD-body-first rule scoring, thresholded greeting, local configuration, and a platform-specific browser script informed the Copilot scoring/companion design.
- We do not vendor its BOSS browser script into the core extension in Phase 1. Generated configuration can be used with a separate checkout of the upstream project.

## JobFill

- Project: JobFill
- Upstream: https://github.com/23aaaa/jobfill
- License: MIT
- Usage in this repository: **implementation reference only** for domestic recruitment UX and framework-controlled input handling. No JobFill source code is vendored at this time.

## Autograph

- Project: Autograph
- Upstream: https://github.com/tonybolivar/autograph
- License: GPL-3.0
- Usage in this repository: **architecture/documentation reference only**. Its generic engine + small per-ATS adapter model is the design direction for future ATS adapters.
- GPL-licensed source code is intentionally not copied into this MIT-derived extension. If Autograph code is incorporated later, the distribution/license strategy must be revisited first.
