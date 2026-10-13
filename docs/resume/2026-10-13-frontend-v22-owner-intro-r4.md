# Frontend v2.2 · Owner-selected project descriptions (Revision #4)

Date: 2026-10-13
Status: published as an **additional immutable Revision** of `ai-frontend-v2-2`, not a new Profile.

## User instruction and change scope

The project owner provided two new resume project overviews and explicitly asked to **use these two overviews** while independently reviewing another AI's proposed engineering highlights.

**MemoFlow (verbatim):**

> AI 原生个人效率平台，打通 AI 对话与目标、任务、日程、提醒、知识库，让意图从对话进入结构化工作区并执行、回流为可追踪结果。

**BodySense (verbatim):**

> 以 Agent 持续理解个人身体状况的应用。用户自然语言描述身体变化，系统结构化记录在 3D 人体上，经用户确认形成综合评估，并管理、执行多份训练计划。

The owner requested these descriptions **for the resume**, not another modification to GitHub About or READMEs; those repos already use the prior owner-approved consumer product introductions.

Changed only two `projects[].description` fields in the existing frontend v2.2 Profile. No changes to professional skills, internship, education, project identities/periods/links/roles, stacks, four frontend highlights, certificates, job applications, campaigns or shared historic presentation records.

## Library/Profile authoring design

Tool: `scripts/resume-frontend-v22-agent-intro-r4.mts`.

- Baseline Profile v3, Library v7, source presentation ID `one-page-v2-2-product-intro-r3`.
- Append per-project presentations under **new versioned ID** `one-page-v2-2-agent-intro-r4` containing the supplied text; original presentations and canonical project facts remain unchanged.
- `preview` is non-mutating: resolve baseline/candidate through the existing authoring contracts and assert deep equality after allowing only two descriptions and version counters to differ; render via the official Job Harness preview endpoint.
- `commit` enforces baseline versions, presentation selections and entire source object equality, and updates Library/Profile **atomically in one SQLite transaction**.
- Re-running after commit refuses stale baseline; no accidental revision rewriting. New PDF is published and stored separately through first-party Job Harness authoring endpoints.

## Actual verified acceptance

- Real first-party PDF preview: **470,242 bytes**, **1 page, A4 595.92 × 842.88 pts**, complete two project summaries and CET-6; inspected JPEG preview visually.
- QA SQLite copy before production: Profile `v3 → v4`, Library `v7 → v8`, Profile count unchanged 13, integrity `ok`. Attempting duplicate commit exited nonzero and SHA-256 of QA copy remained unchanged.
- Pre-mutation online SQLite backup: `/home/ubuntu/.local/share/job-harness/backups/job-harness-pre-frontend-v22-intro-r4-20261013.sqlite3`; integrity `ok`; profile baseline v3, library baseline v7.
- Live DB Profile now **v4**, primary Library **v8**; `PRAGMA integrity_check = ok`.
- New immutable Revision #4: `resume-rev-61c9abb0-ccaf-4b54-ab1c-2c81c1eee55c`, content hash `715d6347ae076d6d90f6e08357892003b1c1e84da9e4bbe6003f91dd6adb710e`.
- New PDF Artifact: `resume-artifact-5adff04a-ff0e-41dc-b5bd-ef5248412dc8`, SHA-256 `8eee67b49428c47413b8cf524b348878baf67ee0a1b77e79bbad3177ee8071e3`, 470,242 bytes.
- Standalone remote export: `/home/ubuntu/.local/share/job-harness/data/resumes-v2-2/卢楼豪-前端开发工程师-v2.2-r4.pdf`, verified identical SHA-256 to the first-party Artifact. Earlier exports remain intact.
- Baseline exact-row comparison: Profiles 13→13, only `ai-frontend-v2-2` updated; Revisions 28→29 with all original rows unchanged; Artifacts 32→33 with all original rows unchanged; Applications 42→42 unchanged; Campaigns 2→2 unchanged.
- UI: `/resumes?profile=ai-frontend-v2-2`. No recruitment action was triggered.

## Review of the other AI's suggested highlights (recommendations, NOT automatically written to revision #4)

**MemoFlow** `origin/main` includes 32 package names under `packages/` and a real Playwright `@axe-core/playwright` dependency/test. Nx shared contracts, Mastra workflows, PowerSync and structured AI-to-business operation are meaningful project evidence. However, repository package count should not be conflated with “32 shared architecture packages” and a claim of exactly **9 business modules** requires an explicit counting convention and reconciliation with current domain inventory. These details fit fullstack/Agent variants more than a one-page frontend resume.

**BodySense** `origin/main` includes `pydantic-evals==2.50.0` and several actual `pydantic_evals` datasets/evaluators under `apps/ai-service/src/evals/`. This is a strong **Agent resume** proof point, but no measured accuracy/pass rate was verified and therefore no statistic has been inserted. The exact Penpot **150+ frames** claim is not established by the public repo; verify in the editable design file before using a number.

For **BodySense authorization**, precise semantics matter: clear user self-reports can be auto-recorded in BodyState, but formal Diagnosis adoption and modifying TrainingPlan content require the appropriate user consent/authorization. Do not blanket-claim “all body updates require user confirmation.” The supplied resume overview is owner-selected product language; technical architecture should still explain that long-term body facts are persisted in business state, **not inside a 3D mesh**.

Resume evidence priority by target role:
- **Frontend:** MemoFlow three-panel Vue/Electron interactions and shared client; BodySense React Three Fiber 3D body interaction and stream lifecycle.
- **Fullstack:** domain contracts, Go/Python runtime boundary, sync/data governance, delivery checks.
- **Agent:** product-native workflow, human authorization, citations/safety, replay and measurable pydantic-evals.
- **Product:** product model and design systems; verifiable screenshots/board counts; avoid fabricated user adoption data.

Do not automatically replace the four existing frontend bullets with the other AI's longer lists; keep this iteration limited to the two owner-requested project descriptions.
