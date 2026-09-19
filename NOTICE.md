# Third-party notices

Job Harness reuses mature open-source browser-form compatibility work instead of rebuilding recruitment-site DOM handling from scratch.

## OpenJobAutofill / Job Application Copilot

- Project: OpenJobAutofill / Job Application Copilot
- Upstream: https://github.com/Br1an67/OpenJobAutofill
- License: MIT
- Copyright: Copyright (c) 2026 Br1an67
- Usage in Job Harness: the browser compatibility runtime under `packages/browser-form-engine/browser/runtime.js` is derived from the earlier Job Application Copilot / OpenJobAutofill form engine. Reused/evolved areas include recruiting-site adapter hints, field/container/label discovery, framework-compatible native value writes, custom choice handling, and date/month picker interaction.
- Ownership boundary: Job Harness does not reuse the old browser-local applicant profile, application ledger, job scoring or submit authority. Canonical ApplicantProfile, ResumeRevision/Artifact, SubmissionIntent/Application, execution leases, auditing and final-submit authorization remain Job Harness-owned.

## czc-good-job BOSS userscript

- Project: czc-good-job
- Upstream: https://github.com/czc6666/czc-good-job
- License: MIT
- Copyright: Copyright (c) 2025
- Usage in Job Harness: `integrations/boss/legacy-copilot.user.js` preserves the proven BOSS job-list/search/detail/chat/resume DOM automation that the retired Job Application Copilot had already adapted from czc-good-job. Job Harness patches this local canonical source at runtime so scoring, greeting text, resume routing and policy decisions come from Job Harness rather than from a separate Python/Ollama backend.
- Ownership boundary: the imported userscript remains a BOSS-specific browser compatibility executor. Canonical Job/Resume/Application state, qualification, duplicate prevention, audit evidence and submit authority stay in Job Harness. Multi-turn autonomous chat and automatic portfolio sending remain disabled.

The upstream MIT notice for the reused BOSS userscript portions is:

> MIT License
>
> Copyright (c) 2025
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

The upstream OpenJobAutofill MIT permission notice is reproduced below for the reused portions:

> MIT License
>
> Copyright (c) 2026 Br1an67
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
