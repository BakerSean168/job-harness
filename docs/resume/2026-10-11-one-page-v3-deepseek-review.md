# Resume V3 · ForgeFlow / DeepSeek V4.1 Flash 独立评审与交付

日期：2026-10-11。工程主版本：Job Harness `03861c3`（本次基线）；本记录只描述本次 V3 变体，不替代历史 V1/V2。

## 执行来源和模型证据

- 用户明确指定 ForgeFlow + DeepSeek V4.1 Flash。使用 Pi Agent 已安装的 ForgeFlow 虚拟角色 `forgeflow/planner`、`forgeflow/worker`、`forgeflow/reviewer`。
- 首先使用 `litellm/deepseek-v4.1-flash` 完成 smoke，但正式调用出现 429 无可用部署，未以其他型号伪装完成。改为已验证的同模型供应源 `llm-pm/llm-pm-deepseek-0731/deepseek-v4.1-flash`。ForgeFlow worker 通过 read/write 工具生成 V3 脚本，reviewer 产生独立分析。
- GCP 的 ForgeFlow 为草案作者；**ChatGPT Web 独立接受审查和修复**：修正未注册的技能/实习 bullet ID、数据库事务边界与 Agent 版遗漏的证据核查。ForgeFlow 初稿与最终审核版本有可追溯差异，最终 PDF 不应被表述为未经审核的模型原样输出。
- 临时 ForgeFlow 模型策略仅存于 GCP 任务私有目录；未修改长期默认模型路由。

## 对 V2 的具体审查（基于实际 V2 内容）

1. **前端叙事偏架构**：V2 使用 `v2-cross-host`、`v2-agent-ui`，对 Vue 响应式状态与流式会话 UI 的描述不足。V3 改选更直接的 MemoFlow 响应式 / 流式交互与 BodySense SSE、类型化接口证据。
2. **全栈和前端共用叙述过多**：V2 MemoFlow 的“跨端共享应用层”及“共享 contracts”信息近似；V3 全栈改突出服务边界、BodyState 版本化与接口可测试性。
3. **三份实习要点岗位差异不足**：V2 前端、全栈、Agent 对 OLP AI Knowledge 的生成—保存—发布链路描述近似。V3 对同一真实企业经历使用岗位定向的 Profile-local 表述，不虚构新任职。
4. **Agent 项目的重点偏移**：V2 Agent 有证据/RAG 与工作流内容，但 ForgeFlow 两条亮点更偏一般质量约束。V3 明确并列“LangGraph checkpoint / 证据检索”和“Pi Agent 提交证据 / 供给策略解耦”。
5. **技术项可读性**：V2 某些技能行跨越多框架及运行时；V3 划分四个短主题。代价是四行比三行多占纸面，需要 PDF 单页验证。
6. **共享 Library 亮点和实际选择分离**：同一项目可以保存多条候选亮点，而一张简历只取两条。这样便于变体生成，但未选中的亮点会增加资料维护成本；V3 对所有新增条目采用唯一 `v3-* ` ID 并保留旧条目。
7. **V2 脚本的分阶段持久化**：旧版先保存 Library 再事务化创建 Profile，存在中途失败导致仅 Library 增量成功的窗口。最终 V3 脚本改为 **一个 SQLite 事务内校验、upsert Library、插入三份 Profile**，且重新核对源版本与不存在的目标 ID。
8. **渲染断言原本在脚本外**：V2/V3 的 `preview` 只输出 PDF 字节数；实际页数由独立 `pdfinfo` 核验。脚本没有内部硬性页数检查，未来可以追加 CI gate。
9. **ForgeFlow 历史期间问题**：当前 `forgeflow-pi` 保留了旧项目历史起始日期，不能推断 Pi 原生架构从旧项目起点就已存在；技术演进以 ForgeFlow 架构文档与提交记录为准。本次为了避免影响 V2，没有修改共享项目期间。
10. **指标证据边界**：未提供可验证的转化率、用户量、性能提升百分比，因此 V3 仍只陈述所做的工程设计及可追溯能力，不添加伪造数字。

**审查纠错**：ForgeFlow 初版评审误把 V2 文档中的 Revision/Artifact ID 与 SHA256 判断为占位值；核对后证实它们是真实 ID / 校验值。初版评审还误称 V3 已修复前的脚本为最终代码。此处以实际 DB、Git 和 Artifact 校验为准，错误结论不计入验收。

## V3 内容定位与取舍

| Profile | 两个项目 | 针对的核心能力 | 仍需权衡 |
|---|---|---|---|
| `ai-frontend-v3` | MemoFlow、BodySense | Vue/React/Electron、状态与 SSE 流式交互、类型化 UI 协作 | 技能 4 条，避免稀释重点 |
| `ai-fullstack-v3` | BodySense、MemoFlow | BodyState 版本、Go/Python 分层、Web HTTP + Electron IPC 共享应用接口 | 对 Agent 特性的展示少于 V2 |
| `ai-agent-app-v3` | BodySense、ForgeFlow (Pi) | checkpoint / 人工确认、RAG 证据链、模型角色与 Provider 供给隔离 | 不应夸大质量评测结果 |

每份选择 `sicau` 教育、`krjx` 已存企业实习两要点、两个项目每个两条亮点、`cet6` 证书；**没有新增公司或未经证实的实习**。V3 命名只表示不同简历版本，不代表系统业务版本号。

## 事实核对（只读源码）

| 陈述主题 | 核实位置 | 审查结果 |
|---|---|---|
| MemoFlow Vue Web、Electron Desktop、共享 contracts、PowerSync | `/home/dev/projects/memoflow/README.md` 18、39、63、72、93、101、113-117 行；当时 HEAD `d381bf442be` | 已确认仓库公开的项目架构说明；个别互动细节仍以代码变更/面试实例为准 |
| BodySense BodyState、Run/Turn/checkpoint、pgvector、LangGraph/PydanticAI、HTTP+SSE | `/home/dev/projects/bodysense/README.md` 3、37-51、60-95 行；`docs/architecture/diagnosis-replay-comparison.md` | 项目能力和工作流方向有文档依据；没有独立测量过用户成效 |
| ForgeFlow 原生 Pi-subagents、逻辑角色、Provider 分层、证据与单写者规则 | `/home/dev/projects/forgeflow/README.md` 11-47 行与 `docs/architecture.md`；当时 HEAD `981410a` | 架构与治理模型可核实，旧 Open SWE 阶段不再描述为现行 |
| 科睿金信 `krjx`、四川农业大学 `sicau`、CET-6 `cet6` | Job Harness `primary` ResumeLibrary 已存实体和 V2 Profile 引用 | 复用已存事实，不新增雇佣凭证 |

## 持久化安全与正式验收（2026-10-11）

- 执行文件：`scripts/resume-one-page-v3.mts`；新增 presentation `one-page-v3`、单独 v3 highlight ID、V3 Profile-local 技能和工作描述。原有 skill/work canonical IDs 复用，`validateResumeProfileReferences` 和 `resolveResume` 均通过。
- Oracle2 生产数据库在线备份：`/home/ubuntu/.local/share/job-harness/backups/job-harness-pre-resume-v3-20261011.sqlite3`；备份和事后数据库 `PRAGMA integrity_check = ok`。
- 在备份复制的 QA 库测试 `commit`：Profile `8→11`，Library `2→3`；第二次执行拒绝覆盖，数据库字节 SHA256 不变。**在 QA 通过后**才向生产 DB 执行同一脚本。
- 生产写入后新增三份 V3 Profile，总数 `11`；官方 `resume_revision_publish` + `resume_revision_artifact_materialize(kind=pdf)` 各三份。每份正式 PDF 经 `pdfinfo` 均为 A4（595.92 × 842.88 pt）且恰好 1 页；Artifact SHA256 与导出副本的文件 SHA256 相同。
- 比较在线备份和实际生产库：V1/V2 的 8 个历史 Profile、原有 15 条 Revision、19 份 Artifact **原始行全部不变**；42 条 Applications、2 个 Campaign 亦全部不变，未触发投递或站点附件更新。

| Profile | 正式 Revision | PDF Artifact | PDF SHA256 |
|---|---|---|---|
| `ai-frontend-v3` | `resume-rev-60c953a5-6d16-4559-bcf1-fca7052eba79` | `resume-artifact-18d4e18d-fecb-400c-96cb-3b2b99bcc57b` | `e12f56526fc8a8053c74038b0d89d15c949e9f9e8e93125d412b6db676f69b87` |
| `ai-fullstack-v3` | `resume-rev-25ada251-be6d-4e01-ab8a-f2d741a49b87` | `resume-artifact-4b115ab3-ed08-42d4-b763-bd3a2af4663d` | `3d7d54fef19276b444708fe0c5c41a99372bdb78779afafd9415e7294774bd62` |
| `ai-agent-app-v3` | `resume-rev-73c30809-d58e-41f0-a7e2-974f0dc7f9c2` | `resume-artifact-6992521a-9b65-4341-97a4-212e8be05509` | `d3064527a0c3d1bca25dddbf0032223fe53f74cb15b9d5c4eb71a21155f8a3b6` |

导出副本在 Oracle2 `/home/ubuntu/.local/share/job-harness/data/resumes-v3/`，各以姓名、方向、`-v3.pdf` 命名。现有 V1/V2、Campaign resume 选择与招聘自动化策略未改变。

## 后续版本建议

- 保留 V2/V3 对比；岗位命中情况和面试反馈如有真实样本，再调整权重，而不是为了简历密度写虚构指标。
- 如需 V4，分配新 Profile ID、presentation ID、highlight ID，并沿用事务、QA 数据库、PDF 页面、Artifact 校验门禁。
- 一张单页简历只能包含有限证据，某些高价值细节可沉淀为面试准备材料，不必硬塞到简历主体。
