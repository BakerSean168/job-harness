# Frontend v2.2 · Project role normalization (Revision #2)

Date: 2026-10-13
Status: **Published in Job Harness**; existing Profile `ai-frontend-v2-2`, no additional Profile.

## Decision and scope

For personal projects, the Resume's **role** is the author's true relationship to the project, not the role being applied for. Change *both* `dailyuse` (MemoFlow) and `body-sense` (BodySense) role display values from their frontend-specific labels to exactly:

> 独立开发（个人项目）

Keep job targeting in project stacks/highlights and Resume positioning. No job application, company entry, date, facts, or campaign is changed. The user directly confirmed the internship, contribution attributions and MemoFlow start date in the conversation; no factual correction was requested or introduced.

## Data model / version safety

Job Harness uses `ResumeLibrary` as the shared fact store and `ResumeProfile.projectSelections` to choose project presentations and highlight IDs. An existing `ProjectPresentation` with ID `one-page-v2-2` contains each project’s former role label. Replacing it in place could affect future resolution of old Profiles, therefore this release appends **two separate, versioned presentations** with ID `one-page-v2-2-role-r2`, copying all description/stack/name values unchanged and setting only `role`.

The existing Profile `ai-frontend-v2-2` selects the two new presentations, retaining all skills, education, internship entries, project highlight IDs/text, certificate, project links, dates and other metadata.

Writer: `scripts/resume-frontend-v22-independent-role.mts`.

- `preview`: read primary Library + Profile; validate the exact two expected source presentations; prepare additive Library v6 and Profile v2; validate references; independently resolve both versions; **deep-compare entire ResolvedResume**, allowing only libraryVersion, profileVersion and two `projects[].role` fields to change; render via Job Harness official PDF preview API without DB modification.
- `commit`: a single `SqliteResumeStore.transaction`, with version/content concurrency guards, appends the new presentations and updates only this Profile. It never touches recruiting data. Re-running after commit fails closed because source presentation IDs no longer match.
- Publish a **new immutable Revision #2** and PDF Artifact using Job Harness first-party Resume tools. Revision #1 remains immutable and independently downloadable through the resume manager.

## Acceptance evidence

- Preview returned **452,867 bytes**, PDF checked via `pdfinfo` as **1 page, A4 (595.92 × 842.88 points)**. Rendered to JPEG and visually inspected; project roles, technical contributions and CET-6 are visible without clipping.
- A QA clone via SQLite online backup: Profile v1 → v2, Library v5 → v6; `PRAGMA integrity_check = ok`. Repeated execution exits nonzero and QA database SHA256 remains unchanged.
- Production pre-mutation backup: `/home/ubuntu/.local/share/job-harness/backups/job-harness-pre-frontend-v22-role-r2-20261013.sqlite3`; integrity `ok`; backup SHA256 `c3d3983469ce4fd1dba90d7de477275b7920e13d6aa5d94079e7f15f7f53a9da`.
- Production commit succeeded: `ai-frontend-v2-2` Profile v2, `primary` Library v6.
- New immutable Revision #2: `resume-rev-496a9724-047b-4028-aa78-23a2ab948ab6`; content hash `ed813d40b5fb303824e4edafd0b3b60fd727268677733730f4f85d67ea8de52e`.
- New PDF Artifact: `resume-artifact-38ab4301-3566-4cc6-9072-9cccff6675a4`, SHA256 `54a55a74a3e3d8aa410ff22ea3c4b1cdee30e2871e4ef7a4549a2eafdc75925f`, 452,867 bytes; copy verified byte-equivalent.
- Human-readable exported PDF (without replacing the earlier file): `/home/ubuntu/.local/share/job-harness/data/resumes-v2-2/卢楼豪-前端开发工程师-v2.2-r2.pdf`. Earlier v2.2 `...-v2.2.pdf` remains intact (SHA256 `8e4b5882704a2f5974c704f3dea6e04c046e7a7ce2483148c07046441a6924ad`).
- Production baseline comparison:
  - Resume Profiles: 13 → 13; only the expected `ai-frontend-v2-2` row was updated.
  - Immutable Resume Revisions: 24 → 25; **all original rows identical**.
  - Resume Artifacts: 28 → 29; **all original rows identical**.
  - Applications: 42 → 42; all original rows identical.
  - Campaigns: 2 → 2; all original rows identical.
  - `PRAGMA integrity_check = ok`.

## Boundary

No edits to the front-end content in the fullstack/Agent Profiles, no new Resume Profile, no new corporate position, no model- or skill-generated claims, no migration of global `ResumeLibrary.projects[].role`, and no rebuild of Job Harness renderers. The existing project URL text is unchanged; improving clickable project links remains separate renderer work.
