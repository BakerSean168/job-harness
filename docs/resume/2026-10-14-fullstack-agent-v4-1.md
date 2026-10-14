# 2026-10-14 · 全栈、AI Agent 应用开发、AI 全栈 v4.1 三份简历

**状态：三份独立 Profile、正式 Revision #1、PDF 已发布；按 2.x 规范验收通过。**

## 1. 产品定位：三份简历，不是 V4 的机械换标题

项目产品事实（名称、简介、技术贡献、起始年月）源于本人确认以及 GCP 源码复核。以 `ai-frontend-v4-1 v3` 和 `primary v11` 作为正式版式及项目简介事实基线，以对应 V4 的实体/高亮 ID 作为岗位特定亮点候选，再精选并重写，不新增虚构经历、数字、用户量或准确率。

| 岗位 | 正式 Profile | MemoFlow 项目贡献（2 条） | BodySense 项目贡献（2 条） | 项目顺序 |
| --- | --- | --- | --- | --- |
| 全栈开发工程师 | `ai-fullstack-v4-1` | Mastra 工作流审核/写入幂等；6 个只读 MCP 工具的 PAT/OAuth scope 权限与审计 | 序号化事件持久化/租约 CAS；OpenAPI/Protobuf 多语言契约 | MemoFlow → BodySense |
| AI Agent 应用开发工程师 | `ai-agent-app-v4-1` | Mastra suspend/resume 与幂等操作；工具分级审批、默认拒绝、ask_user | Prompt/工具/Schema 版本及评测门禁/灰度回滚；LangGraph + Postgres 检查点、HITL | BodySense → MemoFlow |
| AI 全栈开发工程师 | `ai-fullstack-agent-v4-1` | 可恢复业务写入；Vue 原生目标表单 + AI 语义动作 / fencing 租约 | React Three Fiber / GPU 3D 人体拾取；Agent 配置离线评测与影子/金丝雀 | MemoFlow → BodySense |

**项目标题全部统一：** `知行 MemoFlow`、`体悟 BodySense`（Agent 版 BodySense 排在前）。两项目产品简介均完全继承此前已确认的 v2.3 / v4.1 产品介绍，不把技术栈堆进产品简介。技术栈随岗位保留真实主技术，项目职责统一写 `独立开发（个人项目）`。

## 2. 2.x 基础规范及差异化内容

- 三版都采用 `compact-project-links-v2`、白底深字无照片、`岗位名称｜2026届本科毕业生`、一页 A4；不加 `求职意向：` 前缀。
- 教育背景 → 专业技能四组 → 已确认实习 → 两个项目（各两条贡献）→ CET-6。
- 三份专业技能从旧 V4 的泛化条目**重写**：普通全栈覆盖 JS/TS + Vue/React、Go/Python/Node 服务、PostgreSQL/API、Mastra/MCP 和工程化；Agent 覆盖 LangGraph/Mastra、工具/检查点/HITL、pgvector/Pydantic Evals、FastAPI/TS 与限权网关；AI 全栈同时展示 Vue/React/Three.js、Go/Python/Express、Mastra/LangGraph、端到端质量门禁。
- 实习只复用已确认的 OLP/BigBlueButton/AI Match 与 DDCC 打印事实，**保持真实的「前端工程师（实习）」头衔**。普通全栈为 3 条（AI Knowledge、React/Docker 排障、`html2canvas → vue-print-next + Paged.js`）；Agent 为 2 条（AI Knowledge、AI Match 经用户确认后写入）；AI 全栈为 2 条（OLP 业务交付、AI Match 人工确认）。
- Agent 只描述模型评测和灰度**机制**，不冒充医学判断准确率/公共生产发布。删除旧 V4 BodySense 契约亮点中的未经同次验收证明的「1500+ 测试」数字，改为可查证的契约与兼容性机制；不声称一个统一的测试通过率。
- AI 全栈版没有照搬旧 V4 的「全栈技能 + Agent 后端」：原生目标表单和 React 3D 拾取分别与 Mastra/业务提交及配置治理配对，保证三层能力（AI UI、数据服务、Agent）都有可信经历。
- 保留旧 `ai-fullstack-v4`、`ai-agent-app-v4`、`ai-fullstack-agent-v4` 和前端 `ai-frontend-v4-1`，不进行默认替换、不自动投递。

## 3. 源码及测试证据（不等于公共线上效果验收）

**MemoFlow**（GCP `~/projects/memoflow`，审查 `origin/main` `9cd179c98b9`）：
- `packages/ai/src/server/mastra/workflows/apply-goal-plan.service.ts`、`goal-create.workflow.ts` 和 `deterministic-entity-id.ts`：Mastra 持久化/审核与确定性 ID；相应 `*.spec.ts` 含重试和部分失败验证。
- `packages/agent-gateway/src/server/read-gateway.ts`、`register-read-tools.ts` 及 `read-gateway.spec.ts`：6 个只读工具，调用时的 scope 复核与审计。OAuth/PAT 真实客户端的此前 prod-like 验收不等于可声称公有生产已全面开放。
- `packages/ai/src/server/mastra/tools/product-tool-policy.ts`、`product-tools.spec.ts`：产品工具权限策略与测试。
- `packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts`、`useGoalSurfaceLease.ts` 以及 `useAIGoalWorkflow.spec.ts`：类型化语义动作的原生表单投影和租约失效防过期写入。

**BodySense**（GCP `~/projects/bodysense`，审查 `origin/main` `6bbc36acb`）：
- `apps/api/internal/repository/runtime_event_repository.go`、`apps/api/internal/service/run_service.go`：事件序号持久化与运行租约/重放能力；Go 服务和相关测试证明实现存在，不直接推断线上全量使用。
- `scripts/contracts/mutation.sh` 与 `tools/contracts/foundation/openapi.yaml`：OpenAPI breaking-change 变异验证；Protobuf/多端生成代码以源仓库契约为准。
- `apps/ai-service/src/runtime/consultation_thread.py`、`checkpointing.py`：LangGraph 业务图及 Postgres checkpoint，人工确认的 interrupt/resume 安全边界。
- `apps/api/internal/service/agent_deployment_policy.go`、`agent_deployment_policy_test.go`：诊断/评估等 Agent 的配置身份、影子/金丝雀路由及回滚机制；离线评测与门禁以历史执行报告为依据。
- `apps/web/src/features/body-canvas/scene/surfacePicker.ts`、`BodyCanvasScene.tsx`：3D 可见区域 ID 拾取与深度测试。最新生产 3D 人体交互仍需真实线上端到端验收，避免将 Penpot 静态原型视为正式上线证据。

## 4. 可重复的实施脚本及数据安全

源码：`scripts/resume-other-v4-1.mts`（`check` / `preview` / `commit`）。

- **check**：固定 Library v11、前端 v4.1 Profile v3、三份 V4 源 Profile v1 的版本守卫；新的六个 Presentation ID 必须唯一；对旧 19 份 Profile 逐一解析比对，允许 shared Library 的版本元数据升级，**不允许已显示文本变化**；四组技能、两项目各二高亮、中文英文品牌、真实双链接经 2.x 规范检查。
- **preview**：在正式 Job Harness PDF API 上生成三份预览，并手动查看 JPEG 渲染。第一次试排普通全栈与 Agent 的证书轻微溢出至第二页，因此**缩短技能冗语**；再次试排三份均为一页 A4，没有变更字号、丢弃项目亮点或把证书挤出。PDF 真超链接通过 `pdftohtml` 逐一检查。
- **QA commit**：正式生产库 SQLite online backup 的独立副本中事务提交一次，六份 Presentation + 三个新 Profile 同时出现；重复执行返回非零，数据库主文件 SHA256 不变。旧 Library 除新增六份 Presentation 与 version/updatedAt 外无差异；旧 19 Profile、全部 Revisions/Artifacts、投递/Campaign 行数据均没有更改。
- **正式提交**：与 QA 同一脚本内完整事务，逐对象 JSON 对比 canonical Library、front baseline 与 V4 源 Profile 后才写入；任何并发变化则回滚。只写 `primary v12` 与三份独立 v4.1 Profile v1。
- **生产在线备份**：`/home/ubuntu/.local/share/job-harness/backups/job-harness-pre-other-v4-1-20261014.sqlite3`，85,118,976 bytes、integrity_check 通过、SHA256 `35d7e64e4e03b8999655cdfc51cf53ed2f810372f14c178b1af245981da7238c`。

## 5. 正式发布证据

| Profile | Revision #1 | Artifact | PDF 字节 | SHA256 |
| --- | --- | --- | ---: | --- |
| `ai-fullstack-v4-1` | `resume-rev-a71758f8-852e-49bd-80ef-2fc5c618da22` | `resume-artifact-1fa099e2-fa4b-4c9e-aa8f-b3cc5c9bc5a9` | 471405 | `570aacfe98c540f3f6c55fe6b1f37493f2a77c49c81c7dc42ee212dc6a63077d` |
| `ai-agent-app-v4-1` | `resume-rev-e93ad66a-d63d-42c9-9a0e-95df1d6b2c25` | `resume-artifact-9a817015-4f4f-4e2b-8643-a5d0ac971686` | 461064 | `d22d4f7094bd46c890ef2daccee3247c179e7bd910f76ea48d37c91c28562e84` |
| `ai-fullstack-agent-v4-1` | `resume-rev-2906f9be-a58f-4ae2-bfa6-40a99f672a9c` | `resume-artifact-8b8fb632-1e54-4510-8fcd-942e9cb6d3fb` | 458307 | `851cb0f3870d82f04515292f09cefea246921dd43fad9ad4575dc14f96ba78d7` |

三份 Artifact 通过官方 `resume_revision_artifact_materialize` 生成，已复制到 Oracle2：
- `/home/ubuntu/.local/share/job-harness/data/resumes-v4-1/卢楼豪-全栈开发工程师-v4.1.pdf`
- `/home/ubuntu/.local/share/job-harness/data/resumes-v4-1/卢楼豪-AIAgent应用开发工程师-v4.1.pdf`
- `/home/ubuntu/.local/share/job-harness/data/resumes-v4-1/卢楼豪-AI全栈开发工程师-v4.1.pdf`

**真实最终验收：** 每份 `pdfinfo` 为 **1 页 A4 (595.92×842.88pt)**、CET-6 正文可提取、BodySense/MemoFlow 中文英文双品牌可提取、四条双项目链接在 PDF 注解可点击。分别执行 `scripts/resume-v2x-foundation-audit.mts`，三份均 **errors=[]、warnings=[]**。

**提交前后完整 DB row-set 对比：** Profiles **19 → 22**、Revisions **41 → 44**、Artifacts **45 → 48**；42 条 Applications、2 个 Campaign **逐行不变**；19 份旧 Profile JSON **逐行字节一致**；旧 Revisions/Artifacts 一行未修改，Library 只新增 6 个 Presentation、版本升级到 v12。正式数据库 `PRAGMA integrity_check=ok`。未触发任何 BOSS、智联等自动投递。

**页面：**
- `https://oracle.taile92a8e.ts.net:20900/resumes?profile=ai-fullstack-v4-1`
- `https://oracle.taile92a8e.ts.net:20900/resumes?profile=ai-agent-app-v4-1`
- `https://oracle.taile92a8e.ts.net:20900/resumes?profile=ai-fullstack-agent-v4-1`

## 6. 风险和下一阶段

- 以 2026 届毕业生身份投 2027 届校园招聘，应先核实往届生资格；本次只生产候选简历，不自动投递。
- Agent/AI 全栈版本更强调复杂编排与治理，需要面试时能够展示源码、测试、回滚演练证据。生产开放状态与离线测试要分开表达。
- 对于普通全栈岗位，MCP/Agent 不能代替 API、数据库、并发一致性与前端交付的基本功；对应技能已保留。
- 不合并四个岗位分支为单一通用简历；`ai-frontend-v4-1` 仍保持冻结。本阶段不覆盖或迁移旧 V4、v2.x/v3 或用户实习历史数据。
