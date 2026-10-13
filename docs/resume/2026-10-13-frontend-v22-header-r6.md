# Frontend v2.2 · Remove redundant header prefix (Revision #6)

Date: 2026-10-13
Status: **published as an immutable new Revision** of the existing `ai-frontend-v2-2` Profile.

## User-approved change

Previous user-visible header: `求职意向：前端开发工程师｜2026届本科毕业生`.

Current header: **`前端开发工程师｜2026届本科毕业生`**.

Only `profile.positioning['zh-CN']` is changed. The typed `targetRole['zh-CN']` remains `前端开发工程师`, and the 2026 undergraduate graduation cohort is retained. No gender/age fields were introduced. Header template, styles, contact, education, four technical skills, internship, projects, certificates, shared ResumeLibrary, and recruitment data remain unchanged.

## Manual reproducible authoring

File: `scripts/resume-frontend-v22-header-r6.mts`.

- `preview`: read-only Library/Profile, guard expected source Library `v8` + Profile `v5`, resolve before/after and `assert.deepStrictEqual` permitting only positioning and profile-version differences; generate a real PDF through the Job Harness official preview renderer.
- `commit`: atomically update **only** this Resume Profile with full object/version concurrency guards; no shared Library, Campaign, application, or other Profile updates.
- A duplicate `commit` against a QA database exits nonzero and leaves SHA256 of the database unchanged.
- Publish new immutable Revision and materialize an independent PDF via first-party authoring endpoints; never overwrite a previous artifact.

## Acceptance

- Official preview created `482,308`-byte PDF, visually inspected through Poppler JPEG conversion.
- `pdfinfo`: **1 A4 page**, 595.92 × 842.88 pt; `pdftotext` confirms updated header and certificate remain on first page.
- Isolated SQLite QA copy: Profile `v5 → v6`, shared Library still `v8`, `PRAGMA integrity_check=ok`; repeated commit refused, DB unchanged.
- SQLite online production backup before write:
  `/home/ubuntu/.local/share/job-harness/backups/job-harness-pre-frontend-v22-header-r6-20261013.sqlite3`;
  verified integrity and SHA-256 `ef6ee170ef422d677fc803d4ea4491afd5cf6a81a80344a418bf0a69ad1c4fc4`.
- Production Profile version `6`, primary Library `8`; DB integrity `ok`.
- Immutable Revision #6: `resume-rev-5c0e8eb1-d8af-40fb-9abd-6ed391c0a501`.
- Official PDF Artifact: `resume-artifact-a8a9b0c9-4b9f-4b22-8e1c-601baf7c32b5`, SHA-256 `22844f8477bb2e060e294b93773668c1ba84bbdc562eb1a7091acd6cde49a1dc`.
- Independent PDF export: `/home/ubuntu/.local/share/job-harness/data/resumes-v2-2/卢楼豪-前端开发工程师-v2.2-r6.pdf`, verified byte-for-byte identical to official artifact.
- Baseline table comparison: total Profiles 13 → 13, exactly the targeted Profile row changed; Revisions 30 → 31 and Artifacts 34 → 35 (no historical record changed); Applications 42 → 42 and Campaigns 2 → 2 (all rows unchanged).
- Previous frontend v2.2 Revision #1 through #5 and their PDFs remain available.

## Access

Open Job Harness `/resumes?profile=ai-frontend-v2-2` and select the latest Revision. This change does not submit a job application or redeploy rendering code.
