# MemoFlow / BodySense · 跨岗位项目亮点证据清单（2026-10-13）

状态：**已完成源码核对与一组真实评测复跑；候选文案，不自动写入其他简历。**

范围：Job Harness 求职简历使用的 MemoFlow、BodySense、ForgeFlow 项目介绍与项目贡献选材。用户已明确确认实习、个人贡献和 MemoFlow 起始时间准确；本文件不反复要求修改已确认的事实。

## 0. 本轮的正式简历基线

- 前端：`ai-frontend-v2-2` Profile v4 / **Revision #4** 已发布；两段「项目简介」采用用户指定原文。
- MemoFlow 简介：**AI 原生个人效率平台，打通 AI 对话与目标、任务、日程、提醒、知识库，让意图从对话进入结构化工作区并执行、回流为可追踪结果。**
- BodySense 简介：**以 Agent 持续理解个人身体状况的应用。用户自然语言描述身体变化，系统结构化记录在 3D 人体上，经用户确认形成综合评估，并管理、执行多份训练计划。**
- PDF 已通过 A4 单页审查。V1/V2/V3/V2.1 历史成果、招聘投递记录均保留。本文件**不再次改写**已发布版本。
- 相同产品的基本定位可跨前端、全栈和 Agent 简历复用，但**技术栈排序和项目亮点**应按岗位分别选材。

## 1. 用户提供的候选亮点：证据分级

| 候选断言 | 核查等级 | 证据 / 精确限制 | 推荐用途 |
| --- | --- | --- | --- |
| MemoFlow 是 AI 原生业务工作台，而不是外挂聊天框 | **源码 + 产品规格** | `docs/product/modules/ai.md` 的 `goal.create / task.create / knowledge.capture`，`useAIGoalWorkflow.ts` 到 Goal 原生业务 Surface；Mastra workflow、typed semantic action 和受控提交 | 全栈/Agent **高优先级**；前端产品简介已涵盖 |
| MemoFlow 有复杂多端交互、双端一致性 | **源码与测试** | `packages/app-vue/src/layouts/shell/AppShell.vue`、`AppShell.spec.ts`、共享 contracts 和 IPC/HTTP adapters | 前端/全栈优先 |
| MemoFlow 30+ package | **仓库可计数** | `git ls-tree -d --name-only origin/main:packages | wc -l` = **32**（2026-10-13 MemoFlow main `49970ca36aa`）。注意其中包含 `app-vue/app-react`、UI 包、基础包，**不应称为“32 个共享业务包”** | 可以用于技术面试佐证工程规模，简历不必为数量占篇幅 |
| MemoFlow 恰好“9 个业务模块” | **口径未定义** | `packages/` 下业务相关目录不止 9 个；`docs/product/README.md` 还拆分了认证、设置、资源库、编辑器等 | **禁止直接写 9**，除非定义统一计数法 |
| MemoFlow 无障碍自动检查 | **测试文件可证实** | `apps/web/e2e/local-docker/core-product-phase-d.spec.ts` 使用 `@axe-core/playwright`，含页面键盘交互与 a11y 断言。依赖在 `package.json` 中登记 | 前端工程化/产品质量；**不可直接推断全产品无障碍合格** |
| BodySense LangGraph、证据检索与 Agent 评测 | **源码与测试可证实** | `apps/ai-service/pyproject.toml` 含 `pydantic-evals==2.50.0`，`src/evals/` 含证据策略/否定识别数据集和 evaluator | Agent 简历 **高优先级** |
| BodySense 的“人在回路 / 授权边界” | **经批准的产品规格**，新 V2 端到端仍在重构中 | `docs/product/requirements.md` 的 R-BS-01、R-DX-02、R-CD-03、R-SAFE-*；`docs/product/agent-workflows.md`。设计决策已明确，**不能等同于完整新 V2 已生产验收** | Agent/全栈/产品；应使用「设计授权边界」等措辞 |
| BodySense 任意 BodyState 变化都需要用户确认 | **不准确** | R-BS-01：明确的本人身体事实**自动记录**，仅关键歧义追问；Diagnosis 采纳和 TrainingPlan 写入另行授权 | **禁止该写法** |
| BodySense 在 Penpot 中有“150+ 画板” | **未核验** | 源码文档能证明独立 editable Penpot 设计文件、Foundations/Components/Product；没有可信的当前画板总数。V2 页面仍在设计/验收中 | 产品简历可写设计体系，不写具体数量 |
| “AI 医学评测准确率 100%” | **不成立** | 本轮测的是 deterministic policy regression，不是独立人类标准医疗准确率，也不是线上用户体验数据 | **禁止** |
| AI 协作开发规范 | **有仓库证据** | MemoFlow 根目录 `AGENTS.md`、BodySense 的产品规格/规则 ID/验收矩阵、CI；具体执行次数/节省工时未核验 | 可在工程实践/面试中说明，不建议抢占两个项目的首要亮点 |

## 2. 新的可复现数字：BodySense 确定性评测

**源码快照**：BodySense `origin/main` `80fdfcd27`（2026-10-13，单独归档至临时目录运行；没有操作正在开发的 `refactor/schema-first-v2-20261013` 工作区）。

**执行方式**：对 `origin/main` 的 `apps/ai-service` 文件运行 Python + Pytest，关闭 Python 字节码写入与 Pytest 缓存；使用 GCP 已有 venv 的已安装依赖。执行命令中的关键目标：

```sh
python -m pytest -q \
  tests/unit/test_diagnosis_evidence_evals.py \
  tests/unit/test_diagnosis_negation_evals.py \
  tests/unit/test_assessment_evidence_eval.py \
  tests/unit/test_treatment_evidence_evals.py::test_treatment_evidence_gap_policy_is_nine_of_nine
```

**实测输出：** `6 passed in 3.28s`。

| 评测域 | 数据集中的确定性 cases | 源码证据 | 说明 |
| --- | ---: | --- | --- |
| Diagnosis 证据缺口策略 | 9 | `tests/unit/test_diagnosis_evidence_evals.py`，`src/evals/diagnosis_evidence_policy.py` | 搜索预算、证据足够性、关键证据缺口等 |
| Diagnosis 否定陈述 | 10 | `tests/unit/test_diagnosis_negation_evals.py`，`src/evals/diagnosis_negation_policy.py` | 历史与当前、否定范围、含糊语句 |
| Assessment 证据规则 | 13 | `tests/unit/test_assessment_evidence_eval.py`，`src/evals/assessment_evidence_policy.py` | 证据策略契约 |
| Treatment 证据策略 | 9 | `tests/unit/test_treatment_evidence_evals.py` 单项测试，`src/evals/treatment_evidence_policy.py` | 训练/治疗建议证据缺口和预算 |
| **合计** | **41** | **6 个 Pytest case 通过** | **这不是 41 个真实病例，也不是模型诊断准确率** |

可引用的**准确项目成果表述**：

> 基于 Pydantic Evals 建立证据策略与否定语义的确定性回归集；在指定四组数据集中共运行 41 条规则案例，相关 6 项 Pytest 测试通过，用于约束证据缺口与风险判断的代码回归。

如果简历只有两条项目亮点，可压缩为：

> **评测与安全：** 构建 Pydantic Evals 确定性回归集，覆盖证据缺口、否定语义和训练证据策略；41 条规则案例对应测试均通过。

**不要**将「规则测试通过」写成「模型答案准确率 100%」。测试快照早于尚未验收的 BodySense V2 全面重构，只能证明所测试的当时版本。

## 3. 推荐项目选材：按岗位区分

### A. 前端开发：**保留当前 v2.2 的四条工程亮点**

**MemoFlow**

1. **多端前端架构：** Web HTTP 和 Electron IPC 共用前端业务调用与状态接口，减少多端重复实现。
2. **复杂工作台交互：** Vue 3 三栏协作、窄屏聚焦、多 Tab 状态保留与组件测试。

**BodySense**

1. **三维人体交互：** React Three Fiber / Three.js 人体区域点选、框选、画笔标记以及与记录/对话联动。
2. **流式 UI：** 结构化 SSE、工具调用、引用和异常处理，reducer 驱动增量渲染。

**理由：** 3D 与三栏工作台已经足够差异化；将“Agent 安全规范”“Nx 30+ 包”塞到前端单页会削弱目标岗位匹配度。Figma/Penpot 保留在技能和设计过程证据中。

### B. 全栈开发：从 MemoFlow 的 AI 原生业务闭环和跨端架构提炼

**MemoFlow 候选：**

- **AI 原生业务闭环：** 以 Mastra 工作流将对话意图生成 Goal/Task/Knowledge 类型化草稿，经业务原生编辑与用户确认后由领域写入接口提交；保留工作流恢复和去重边界。
- **多端架构与数据：** 基于 Nx contracts 共享 Vue Web / Electron Desktop 业务契约，以 Express、PostgreSQL 和 PowerSync 组织数据访问与同步策略。

**BodySense 候选：**

- **服务与数据权威：** React、Go API、Python Agent 分层，区分 Go 长期状态写入与 Python 推理运行态，通过明确 API/SSE 契约传递结果。
- **领域状态与授权：** 设计来源与时间可追溯的 BodyState、需明确确认的 Diagnosis 采纳和独立 TrainingPlan 修改规则，约束 Agent 写入长期状态的边界。

**限制：** 正在推进的 V2 schema-first 整体迁移尚未完成，不能将新的正式分析/训练全部写成“生产完成并全链路验收”。

### C. Agent 应用开发：BodySense 的风险治理与 Pydantic Evals 更具辨识度

**BodySense 候选：**

- **人在回路与授权：** 明确自述身体事实自动记录，诊断采纳与训练计划写入必须分别授权；通过 LangGraph checkpoint/interrupt-resume 组织澄清与审批过程。
- **证据与可测性：** pgvector 证据检索与引用核查、Pydantic Evals 确定性测试，41 条证据策略/否定语义等规则案例对应测试通过。

**ForgeFlow** 保留“复用 Pi / pi-subagents 原生子 Agent，治理角色/模型策略以及证据审查”的两条；不暗示自行研发了 Pi 的底层运行时。

**理由：** MemoFlow 说明 AI 嵌入产品工作流的广度，BodySense 说明有风险的 Agent 如何保持写入授权与证据可追踪；Agent 简历选 BodySense + ForgeFlow 可以避免两个项目同时重复展示通用聊天 UI。

### D. 产品 / AI 产品方向：重点是“产品判断”与设计到工程闭环

- **MemoFlow：** 从“对话 → 结构化编辑 → 授权执行 → 结果回流”提出一个完整的 AI 原生产品模型，减少“AI 聊天框 + 传统待办”的割裂。
- **BodySense：** BodyState / Diagnosis / TrainingPlan 分域；维护规则编号、授权边界、验收矩阵及可编辑 Penpot 交互原型。
- **不要**在未经证明的情况下加入“150+ 画板”“用户数/活跃率”“提升百分比”等规模数据。

## 4. 对“一个项目一个卖点”的评审结论

该提议适用于**跨项目叙事**，不是每个项目只能写一句话。推荐：

- **MemoFlow**：卖点是 AI 从对话进入结构化业务工作流，强调产品广度与多端架构。
- **BodySense**：卖点是长期身体状态、证据与授权边界，强调高风险 Agent 的可控性。
- **ForgeFlow**：卖点是复用原生 Agent Runtime 后仍保持角色治理与可验证的软件交付。

不同岗位的单页简历只从每个项目选**两条最相关**的技术贡献。产品定位与独立开发身份不因应聘职位而变化。

## 5. 当前发布边界与下一轮验收

本次仅修改此审查文档；**不覆盖** `ai-frontend-v2-2` 当前 Revision #4，也不自动修改 `ai-fullstack-v2`、`ai-agent-app-v2`。下一轮如要创建全栈/Agent 的新版本，应遵循 Job Harness 已有的附加式 authoring：
`新 Profile ID → 逐项源码证明 → A4 预览 → QA 副本事务 → 正式备份 → 不可变 Revision/PDF → CI`。

尤其要将可复用的**项目定位**与定向可变的**技术亮点**分开，保持用户已确认的历史事实不变。
