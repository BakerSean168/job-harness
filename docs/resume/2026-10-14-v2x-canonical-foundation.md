# Job Harness · Resume 2.x 基础规范（Canonical Foundation）

**状态：已定稿 · 2026-10-14**

**适用范围：** 正式投递用中文 A4 单页简历；从 `ai-frontend-v2-3` 开始验证。旧 `v2`、`v3`、`v4` Profile、PDF 和 Revision 为历史资产，不回写、不自动迁移。此处的 **2.x** 指基础呈现与作者数据标准，**不是**为每个岗位强制创建新的版本。

## 决策

| ID | 不变量 / 约定 | 验收方式 |
| --- | --- | --- |
| R2-01 | 默认一页 A4，白底黑字、明确的文字层级、无照片。若岗位明确需要，可另建有照片模板而不覆盖无照片版本 | `pdfinfo` 一页 A4；真实 PDF 渲染目检 |
| R2-02 | 页眉：姓名；「岗位名称｜2026届本科毕业生」；基础联系方式。取消「求职意向：」前缀，不默认添加性别和年龄 | ResolvedResume / PDF 文本 |
| R2-03 | 栏目顺序为教育 → 专业技能 → 实习经历 → 项目经历 → 证书；默认不单设长篇个人总结 | Profile.sectionOrder |
| R2-04 | 专业技能四组，**先基础再专项**。前端版须包含 JavaScript、TypeScript、HTML5/CSS3、Vue 3、React；不靠大而全技术列表冒充深入掌握 | ResolvedResume 关键词及四组结构 |
| R2-05 | 只写本人已确认的真实实习。单份实习 2～3 条具体问题/动作/结果；不编造百分比、用户量、虚假公司。用户已确认事实不反复要求认证 | Profile selections、提交前人工审查 |
| R2-06 | 两个互补项目，各自 **一个短品牌名 + 一句「项目简介」+ 技术栈 + 两条有辨识度的技术贡献**。项目名不塞岗位描述；同一份简历中已有中英文品牌的项目，统一采用「中文品牌 + 英文产品名」，例如「知行 MemoFlow / 体悟 BodySense」 | 项目组件渲染、长度与数量审计 |
| R2-07 | 「项目简介」回答**是什么、服务什么场景、如何形成业务闭环**；不是口号、技术堆砌或虚构生产成果。公开 GitHub About 的品牌话术与简历简介分开 | Product / Presentation 字段审查 |
| R2-08 | 个人项目角色明确为「独立开发（个人项目）」或相同事实的精炼写法；不要包装成公司工作岗位；个人贡献必须经项目源码及本人确认 | Presentation.role 和工程证据 |
| R2-09 | 每项目固定展示 **GitHub · 项目展示** 两个 HTTPS 链接。实际 PDF hyperlinks 必须能点击；项目展示需明确区分原型、测试截图、真实产品 | HTML href 与 PDF annotation 实测 |
| R2-10 | 采用 `compact-project-links-v2` 单独模板：无冗余「项目亮点：」标签；正文自然换行、不为凑一页无限缩字号、不出现「至今（持续维护）」重复标签 | PDF + HTML 回归 |
| R2-11 | 证书只保留核实项（现有 CET-6）；学校名称、211 属性、起止年月按事实填写；不修改本人已经确认的项目起始时间 | ResolvedResume |
| R2-12 | Library 记录可复用的**项目事实**，Presentation 记录每个方向的项目简介、角色与技术栈，Profile 决定选择顺序/技能/亮点；避免对另一份 Profile 的共享事实产生副作用 | ResumeSchema/resolveResume、数据库比对 |
| R2-13 | 每次迭代创建新 Profile 或发布**不可变 Revision/Artifact**，禁止覆盖历史 PDF；任何生产写入先 QA 事务、备份、版本守卫、差异验收 | SQLite 备份、EXCEPT diff 与 PDF SHA |
| R2-14 | 量化结果必须可解释其分母、代码版本、运行环境与测试日期；测试数量、评测通过率和生产准确率不可混写 | 工程验收报告 |
| R2-15 | **证据分层**：Source（源码存在） / Tested（可重跑测试） / Deployed（实际运行） / Demonstrated（录屏/公开可交互）四个独立标签。设计原型不能证明真实 3D 已上线 | 项目证据索引、发布链接实际检查 |
| R2-16 | 更新数据库/简历时不触发岗位投递，Job Harness Applications、Campaigns 与历史 Revision 不随简历草稿自动变化 | 写前写后逐表对比 |

## 2026 年岗位适配：共享结构，不共享表达重心

**前端：** 以 Vue/React 基础、复杂工作台状态、Three.js/GPU 拾取、AI 流式组件和人工确认交互为重点。Vue 岗优先 MemoFlow，React/3D 岗优先 BodySense。

**全栈：** 以明确的前后端 API/数据建模、可恢复幂等操作、事务/缓存/同步和跨端契约为主；Agent 是实战应用亮点，不能覆盖基础后端能力。

**AI Agent 应用开发：** 以可持久化工作流、工具权限、人工审批、安全评测、错误恢复及业务写入边界为主；全栈能力说明如何把 Agent 真正落地产品。

**AI 全栈：** 只匹配明确的 AI 全栈岗位，前端交互、后端数据、Agent 编排各有可辩护的端到端证据。不将四份简历合并成同质版本。

不同岗位只能调整 **Presentation / Profile / projectSelections** 和技术亮点的先后顺序；不得未经核实地增加项目已上线、高可用、准确率等描述。

## 当前基线与审计工具

- 正式 front-end 2.x 基线：`ai-frontend-v2-3`，`compact-project-links-v2`，`one-page-v2-3`，现有不可变 Revision #1、PDF。
- 真实页面 `/resumes?profile=ai-frontend-v2-3`；PDF 双链接与一页 A4 在发布时已验证。
- 只读脚本：`scripts/resume-v2x-foundation-audit.mts [profileId] [--pdf=<file>]`，使用 ResumeStore + resolver + renderer 检查基础契约；若提供 PDF 则检查一页 A4 和四条可点击 hyperlink。**不修改库、不触发投递、不发布 Revision**。
- 策略及自动化测试：`scripts/resume-v2x-foundation-policy.ts`、`packages/resume-renderer/test/v2x-foundation-policy.spec.ts`。
- 其它旧版本留存，用于回看和比较，不能宣称自动满足此规范。

## 2026-10-14 实际验收

在 Oracle2 使用当前线上只读 ResumeStore、正式 `ai-frontend-v2-3` Profile（v1）、当前 ResumeLibrary（v10）和当时发布的 **正式不可变 PDF**，执行：

```bash
JOB_HARNESS_DB=/home/ubuntu/.local/share/job-harness/data/job-harness.db \
  pnpm exec tsx scripts/resume-v2x-foundation-audit.mts ai-frontend-v2-3 \
  --pdf=/home/ubuntu/.local/share/job-harness/data/resumes-v2-3/卢楼豪-前端开发工程师-v2.3.pdf
```

结果：模板 `compact-project-links-v2`，技能 **4**、实习 **1**、项目 **2**、实际链接 **4**，PDF 1 页 A4，GitHub/Showcase 4 条 PDF 注解真实可点击，**errors=[]，warnings=[]**。额外单元测试 `packages/resume-renderer/test/v2x-foundation-policy.spec.ts` 3/3，通过后与现有 renderer tests 7/7 联合执行，共 **10/10**。

这是内容结构及已发布 PDF 的验收，不等同于 BodySense 的最新 3D 运行态验收；后者仍需单独完成真实可交互演示验证。本次只读验收未更改任何数据库记录、自动投递或历史 Artifact。

## 工作区故障防再发（独立于简历内容）

2026-10-14 的 HTTP 413 根因是 Web SSR 将当前完整 v10 Library 再 POST 到 Server，约 102,878 字节，超过 100 KiB。已修复为三个经 Bearer 校验的草稿/资料库端点专属 **512 KiB** 请求大小限制，所有其它 REST API 仍受默认 100 KiB 限制，部署与测试见 [HTTP 413 事故记录](./2026-10-14-resume-http-413-incident.md)。

**后续结构性改造约束：** 已保存简历的 SSR 默认应由服务端凭 profile ID 直接获取预览结果，无需再次上传完整 Library；只有「未保存的编辑草稿」才需要 POST，且应考虑只传被引用的 Presentation/Highlights 并验证与全量 resolve 结果等价。即便预览服务失败，工作区仍应显示 Profile 列表与保存功能，而非整页错误。该结构性改造应有独立技术 PR/集成回归和受控 Web 发版门禁，不应借由本次热修未经测试地重建陈旧的定制 Web 镜像。

## 真实项目证据要求

- MemoFlow：跨端 Vue/Electron 工作台、语义动作、fencing 租约、Mastra 可恢复工作流与 Agent Gateway 等内容均有代码/测试证据，公共发布态独立核验。
- BodySense：GPU 颜色 ID 离屏拾取、POST SSE 事件规约、LangGraph/Go 事件恢复、评测/金丝雀等有源码证据；具体展示图必须标记是否只是 Penpot 设计稿。请勿把模型评测结果等同医学准确率。
- 每条技术亮点应在内部证据台账指向具体源码、测试及可观测行为；无可辩护性时删掉，不靠术语包装。

## 版本策略与下一步边界

本阶段不启动 V4.1，不覆盖 2.3，也不对既有 18 份 Profile 做强制迁移。**先保证 Job Harness 在线、2.x 标准可复现、PDF 对齐、旧数据不变**。未来四个岗位的选材依此基础再单独进行，避免新的角色版本复制 `classic-v1` 的链接与冗余标签问题。
