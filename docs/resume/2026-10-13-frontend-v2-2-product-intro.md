# Frontend resume v2.2 · Product-introduction alignment (Revision #3)

Date: 2026-10-13

## Intent

The public-facing product copy and the resume's **project overview** serve different audiences:

- **GitHub About and bilingual README:** marketing/positioning copy supplied by the project owner verbatim.
- **Frontend resume:** short, objective, job-appropriate product description in `项目简介`. Technology lists, applicant role and engineering accomplishments belong in their separate sections.

### Public repository results

| Repository | GitHub README PR | GitHub About language | README language |
| --- | --- | --- | --- |
| [MemoFlow](https://github.com/BakerSean168/memoflow) | [#452](https://github.com/BakerSean168/memoflow/pull/452) | Owner-supplied exact Chinese | Root: exact English; `docs/zh-CN/README.md`: exact Chinese |
| [BodySense](https://github.com/BakerSean168/BodySense) | [#251](https://github.com/BakerSean168/BodySense/pull/251) | Owner-supplied exact Chinese | Root: exact English; `docs/zh-CN/README.md`: exact Chinese |

Both README PRs passed their applicable GitHub Actions checks, were merged into `main`, and preserved all technical sections, product behavior specifications and the BodySense medical-safety disclaimer. The user's current project worktrees contain unrelated in-progress modifications; the README changes were made in temporary isolated Git worktrees and did not modify the active development workspaces.

### Resume descriptions selected

**MemoFlow:**

> 面向个人目标与日常事务的 AI 工作台，将对话中的想法转为目标、任务、笔记及日程，串联提醒与执行记录。

**BodySense:**

> 面向个人身体状态管理的 AI 助手，将酸痛及变化关联至 3D 人体，支持经用户确认的综合判断与训练计划管理。

These are the **resume versions**, not replacements for the user's expressive GitHub taglines. The distinction matters particularly for BodySense: body information is persisted in longitudinal domain state and shown in a 3D interface; it is not literally stored on a 3D mesh. A professional resume states the distinction without promising clinical outcomes.

## Implementation

One-off manual script: `scripts/resume-frontend-v22-product-intro.mts`.

- Source Profile `ai-frontend-v2-2`, after independent-project role normalization.
- Source project presentations `one-page-v2-2-role-r2`.
- Creates a new independent presentation `one-page-v2-2-product-intro-r3` for both `dailyuse` and `body-sense`.
- Changes **only** the two project's localized `description` fields. An independent `resolveResume` for old and candidate models must pass `assert.deepStrictEqual` after allowing only expected version updates and the two `projects[].description` changes.
- Mode `preview` does not write ResumeStore data; it performs official Job Harness PDF rendering and saves temporary audit snapshots. Mode `commit` atomically updates Library + Profile through `SqliteResumeStore.transaction` after optimistic version and entire source-document equality checks.
- Repeated execution fails closed when it no longer finds the source presentation selections.
- No change to shared original project facts, previous presentations, historical revisions or artifact bytes, job campaigns or applications.

## Actual acceptance evidence

- Pre-commit official PDF preview: **466,932 bytes**, **1 page**, **A4 595.92 × 842.88 pt**; JPEG visual inspection shows complete text and CET-6 on page one.
- QA clone of the live SQLite DB: Profile `ai-frontend-v2-2` v2 → v3; primary Library v6 → v7; no new Profiles; `PRAGMA integrity_check = ok`. Repeated commit exited nonzero and left QA database SHA-256 unchanged.
- Before live mutation, online SQLite backup:
  `/home/ubuntu/.local/share/job-harness/backups/job-harness-pre-frontend-v22-product-intro-r3-20261013.sqlite3`
  SHA-256: `ce8edbc3ed46b37f8a466426e0de1948a03d0d38b21535c0d250e92f5d6d42d8`.
- Production transaction successfully updated only `ai-frontend-v2-2` Profile to v3, Library to v7. Current DB integrity `ok`.
- Immutable Revision #3: `resume-rev-324d068f-d74a-4b44-a41e-7528b198c82b`, content hash `969ee5a8bc0089a8a5849586e1b9d68ce71ff55436e27bbe680b72c7f4d5c680`.
- Immutable PDF Artifact: `resume-artifact-508a8d81-e45d-4813-af46-48b1d2267f2e`, SHA-256 `3b4c1b3619440d12fda3f97d9ba82ce4364471f031a924bd3fc4f3c7a8383941`.
- Exported PDF kept as a new file under `/data/resumes-v2-2` with suffix `-r3.pdf`. SHA-256 equals official Artifact, and the `-r2.pdf` file remains unchanged.
- Compared baseline records against live database:
  - Profiles `13 → 13`; only `ai-frontend-v2-2` row updated.
  - Revisions `27 → 28`; all 27 old rows unchanged.
  - Artifacts `31 → 32`; all 31 old rows unchanged.
  - Applications `42 → 42`, Campaigns `2 → 2`, all rows unchanged.

## Non-goals

- Does **not** update fullstack or Agent resume profiles; their separate technical emphasis and long-lived Revisions remain unchanged.
- Does **not** alter role labels (still `独立开发（个人项目）`), technical stacks, skill text, work/education/period facts, project highlights, PDF styling, or existing GitHub link formatting.
- Does **not** edit the website landing pages, independent of GitHub About + README.
- Does **not** trigger automated recruiting or deploy a new renderer.

Current frontend resume: `/resumes?profile=ai-frontend-v2-2`.
