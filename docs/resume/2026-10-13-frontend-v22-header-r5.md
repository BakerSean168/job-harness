# Frontend v2.2 · Role and graduation-cohort header (Revision #5)

Date: 2026-10-13
Status: published as one more immutable Revision of `ai-frontend-v2-2` (not a new Profile).

## Resume guidance reviewed

Source: [鱼皮《程序员写简历指南·基本写法》](https://github.com/liyupi/coder-resume-guide) and [常见简历问题](https://github.com/liyupi/coder-resume-guide) recommend explicitly stating job intentions, and also mention sex/age as conventional personal data. A 2025 [北京科技大学简历制作指导](https://sfc.ustb.edu.cn/zsjy/jyzd/de730e66e6764ecfb34dd27e5af4c55e.htm) explicitly calls out name, contact phone and email as essential; the [2024 HRSS hiring notice](https://rsj.changzhi.gov.cn/zwxx/zcfg/202410/t20241030_2977113.html) discourages gender/age restrictions unrelated to roles. These are different kinds of evidence: a guide's resume field suggestions are not a legal requirement to reveal age/sex in a downloadable CV.

Decision for this domestic Chinese 2026 graduate frontend **standalone PDF**:

- Keep contact details and technical links unchanged.
- Show one explicit target role, not competing frontend/fullstack/Agent targets on a single document.
- Show truthful graduation cohort to help campus recruitment screening.
- No sex, date of birth or age in the PDF by default; fill recruiting platform forms separately when required by the system or employer.
- Keep the existing no-photo A4 single-page template.

Old header positioning: `前端开发工程师`.

New header positioning (user-visible):
```
求职意向：前端开发工程师｜2026届本科毕业生
```

The Profile's machine-readable `targetRole` is deliberately **still** `前端开发工程师` (no free-text compound label). Education remains `四川农业大学 · 物联网工程 · 本科 · 2022-09—2026-06`; no fabricated graduation status.

## Implementation and immutability

One-off manually invoked writer: `scripts/resume-frontend-v22-header-r5.mts`:
- Checks exact source Profile `ai-frontend-v2-2` v4, Library v8, original header value.
- Creates Profile v5 in memory; changes **only `positioning['zh-CN']`** and version timestamps.
- Resolves original vs candidate document using official `resolveResume`; asserts `deepStrictEqual` after permitting only the positioning and profile version differences.
- `preview` renders a real PDF through the current official Job Harness server/renderer and writes only a temporary staging PDF/JSON. `commit` uses a single `SqliteResumeStore.transaction`, with optimistic source version/content checks, and updates only this Profile — Library and all other Profiles remain unchanged.
- Duplicate/stale re-execution exits nonzero without changing the database.
- Publish the official immutable Revision and PDF Artifact through Job Harness native resume tools after production acceptance.

## Test & deployment evidence

- First-party preview: one page, **A4 595.92 × 842.88 pt**; validated `pdftotext -layout` showing entire header, all old sections and CET-6 at bottom. Rendered PDF to JPEG and visually reviewed no clipping or new page.
- QA online SQLite copy: Profile v4 → v5, Library **still v8**, 13 Profiles unchanged, `PRAGMA integrity_check=ok`. Repeated `commit` fails safely; QA DB SHA-256 unchanged.
- Production pre-write online SQLite backup:
  `/home/ubuntu/.local/share/job-harness/backups/job-harness-pre-frontend-v22-header-r5-20261013.sqlite3`, verified integrity and SHA-256 `3b67ef16dbde5eb1fe9968b404a952494db7f6bb0143ebff4ea8eaf760d1b7bb`.
- Live Profile v5 / Library v8; whole database `PRAGMA integrity_check=ok`.
- Immutable Revision #5: `resume-rev-1f783e52-776e-4c06-aaf4-5d13121c6e8b` (content hash `86c5bc9f0710485e22c1e16e453bde5571e5a3c0f7edfb07c34be249df2b30d8`).
- First-party PDF Artifact: `resume-artifact-99f3d086-a3a3-482f-8af8-09361beddbb2`, SHA-256 `ee603307ad315109a8d91185bb0d2ab3a128fa2ed2f805594ceee292bb99ad65`, 491,079 bytes.
- Verified byte-identical export:
  `/home/ubuntu/.local/share/job-harness/data/resumes-v2-2/卢楼豪-前端开发工程师-v2.2-r5.pdf`.
- Historical data comparison with backup:
  - Profiles **13 → 13**; exactly one row changed: `ai-frontend-v2-2`.
  - Revisions **29 → 30**; all previous 29 rows unchanged.
  - Artifacts **33 → 34**; all previous 33 rows unchanged.
  - Applications **42 → 42** and Campaigns **2 → 2**; all rows unchanged.
- Old Revision #1–#4 and their PDFs remain available through the Job Harness resume workspace.
- Runtime stays healthy; no app rebuild, renderer deployment, or recruiting automation required.

## Related notes

- Gender/age are not materially related to frontend competence, and publishing unnecessary personal attributes makes widely shared PDF files less privacy-conscious. There is no need for those fields in this resume.
- The graduation cohort is explicit; whether a specific employer admits the applicant to the 2026 campus graduate track depends on that employer's recruiting rules, not the resume label alone.
- The content/tone of the MemoFlow and BodySense descriptions and the role-specific frontend technical highlights are unchanged.

Current URL: `/resumes?profile=ai-frontend-v2-2`.
