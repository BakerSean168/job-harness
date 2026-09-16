---
tags:
  - analysis
  - career-harness
  - extension
  - plugin
  - ai
  - mcp
  - architecture
  - north-star
description: Career Harness 独立领域系统与 MemoFlow Future Extension Architecture 的北极星设计；冻结领域真值、扩展边界、Goal/Task/Schedule/AI 联动和未来 Cordis 兼容面
created: 2026-09-16T16:11:00+08:00
updated: 2026-09-16T16:11:00+08:00
status: proposed
---

# Career Harness × MemoFlow Extension — North-Star Architecture

> 状态：**Proposed / Planning Only**
> 本文是架构设计输入，不是已实施现状，不创建 Plugin Kernel ADR，也不代表 MemoFlow 已启用动态插件系统。

## 1. Executive Decision

Career Harness 定位为一个**独立成立的求职领域系统**，自身拥有 Company、Job、Application、JobSearchCampaign、DiscoveryRun 等求职事实；MemoFlow 通过一个薄的 Career Extension / Integration Adapter 消费它的公开能力。

核心原则：

> **Domain owns truth. Extensions contribute capabilities. Hosts compose capabilities. AI consumes tools.**

因此：

```text
Career Harness does NOT depend on MemoFlow.
MemoFlow does NOT read/write Career Harness persistence directly.
AI does NOT own Goal / Task / Job / Application product truth.
Integration code does NOT become a second domain owner.
```

V1 采用 **plugin-ready / build-time first-party extension**，不建设完整 Plugin Kernel，不引入 Cordis，不做动态 npm 安装、Marketplace、远程 UI bundle、第三方 sandbox 或 plugin-owned migration framework。

Career Harness 是未来 MemoFlow 插件架构的第一个真实外部业务验证场景；只有出现更多真实 optional modules 和扩展压力后，才重新启动 Cordis Compatibility Spike。

---

## 2. Current-System Evidence

### 2.1 MemoFlow 已经是 modular architecture，而不是 monolith

当前工作区已经按垂直 feature package 组织：

```text
packages/goal
packages/task
packages/schedule
packages/scheduler
packages/ai
packages/notification
packages/relation
...
```

`apps/*` 作为 runtime container / composition root；feature package 通过 application port、runtime contribution、transport seam 和 host composer 组合。

### 2.2 已存在插件化前置 seam

当前可验证的前置能力包括：

```text
ModuleManifest
  - commands
  - queries
  - relations
  - activities

RuntimeContribution
  - start()
  - stop()

ScheduledHandlerRegistry
  - handlerKey -> typed execution handler

AI product tools
  - Mastra createTool(...)
  - typed owner ports
  - host capability assembly
```

这意味着 Career Extension 不需要先推动一次“Everything is a Plugin”大重构。

### 2.3 当前插件研究结论必须继续保护

已有 `2026-08-25-plugin-kernel-oss-feasibility-and-deferment.md` 已确认：

- Cordis / DeepSeek Harness 值得未来 Compatibility Spike；
- 当前不建立 Plugin SDK / Marketplace；
- 当前继续使用 package、module、composer、Port、Registry 等局部 extension point；
- 真实扩展压力出现后再判断是否需要完整 kernel。

Career Harness 不推翻这一结论，而是给它提供第一个真实外部扩展样本。

### 2.4 当前 Relation 不是外部扩展通用图

`Relation` 当前 `SubjectTypes` 是 closed set：

```text
note | goal | task | reminder | habit | wallet
```

因此 V1 **不得**为了 Career 集成直接把外部资源偷偷塞进 Relation，或使用伪造 `wallet/habit` 类型。Career ↔ MemoFlow 的绑定由 integration-owned binding seam 负责；是否未来泛化到 Relation/Extension Graph 由真实第二个扩展需求决定。

---

## 3. Target Outcome

### 3.1 独立使用

用户可以完全不安装 MemoFlow，只使用 Career Harness：

```text
ChatGPT Web / Other Agent
        |
       MCP
        |
Career Application Ports
        |
Company / Job / Application / Campaign / Resume Registry
        |
       DB
        |
      Web UI
```

它至少能够可靠回答：

- 收集过哪些岗位；
- 哪些是重复岗位；
- 哪些已经投递；
- 当前每个 Application 在哪个阶段；
- 使用过哪个 Resume Profile / Artifact；
- 某次岗位发现由谁、何时、通过什么来源产生；
- 某个找工作 Campaign 当前进展如何。

### 3.2 接入 MemoFlow

启用 Career Extension 后：

```text
MemoFlow Goal / Task / Schedule / AI
              |
       Career Extension
              |
         CareerGateway
              |
        Career Harness
```

实现：

- Goal 可以绑定一个 JobSearchCampaign；
- Career 能向 Goal 提供进度事实/指标，而不直接改 Goal 表；
- Career 能提出 TaskSuggestion，由 Task owner 在确认后创建任务；
- MemoFlow Scheduler 能触发 Career handler，而 Career 不复制时间真值；
- MemoFlow AI 能获得 Career tools，而 Career 不内置第二套 AI Provider；
- Career UI 可作为独立应用，未来再贡献 MemoFlow navigation/widget surface。

---

## 4. Non-Goals

V1 明确不做：

1. Career Harness 内置 LLM Provider 管理；
2. Career Harness 自己实现 Agent Framework；
3. Career Harness 自己实现 Web Search engine；
4. MemoFlow 与 Career 共用数据库表；
5. Career 直接写 MemoFlow Goal/Task/Schedule 表；
6. MemoFlow AI 直接写 Career Prisma/SQLite；
7. 动态 npm/plugin 下载；
8. Marketplace；
9. arbitrary third-party plugin sandbox / permission / signature；
10. remote Vue/React UI bundle loading；
11. Cordis adoption；
12. 为一个 Career 扩展立即抽象大型 `@memoflow/plugin-sdk`；
13. 自动向招聘平台提交真实申请作为 V1 核心能力。

真实申请动作未来即使加入，也必须是显式高权限 capability，并经过用户确认；V1 只负责记录与追踪 application truth。

---

## 5. State Ownership Matrix

| State / Truth | Authority |
| --- | --- |
| Goal / KR | MemoFlow Goal |
| Task / occurrence | MemoFlow Task |
| Calendar intent / user-facing schedule | MemoFlow Schedule / Planner |
| Durable invocation / attempt | MemoFlow Scheduler |
| Notification fact / delivery | MemoFlow Notification |
| MemoFlow AI thread / workflow runtime | Mastra |
| Company / Job | Career Harness |
| JobSearchCampaign | Career Harness |
| DiscoveryRun / JobObservation | Career Harness |
| Application / ApplicationEvent | Career Harness |
| Resume source content / generated PDF | Resume Harness |
| Resume metadata used by job search | Career Harness projection/reference |
| Knowledge markdown | Thought Forest |
| Goal ↔ Career Campaign activation/binding | MemoFlow Career Integration boundary |

Hard rule：任何一列不得出现两个 durable authorities。

---

## 6. Career Harness Domain Model

### 6.1 Core aggregates / entities

```text
Company
  |- CompanyAlias

Job
  |- JobSource
  |- JobExternalIdentity
  |- JobObservation
  |- JobSnapshot

Application
  |- ApplicationEvent

JobSearchCampaign
  |- TargetRole
  |- LocationPreference
  |- SearchConstraint
  |- ResumeProfileRef

DiscoveryRun
  |- executor
  |- query/context snapshot
  |- result summary

ResumeProfileRef
  |- external profile id
  |- version/hash/artifact reference
```

### 6.2 JobSearchCampaign 是 Career 与 Goal 联动的主要业务桥

Campaign 本身必须在 Career 独立运行时也有意义：

```text
JobSearchCampaign
  targetRoles: AI Agent / AI Fullstack
  cities: Hangzhou / Shenzhen / Shanghai
  graduationYear: 2026
  experience: 0-1y
  keywords: [...]
  exclusions: [...]
  sources: [...]
  resumeProfiles: [...]
  status: active | paused | completed | archived
```

MemoFlow Goal 不成为 Campaign 的父 aggregate，也不作为 Career DB foreign key。

### 6.3 Job 和 Application 必须继续严格分离

```text
Job state:
  discovered | shortlisted | ignored | closed | archived

Application stage:
  applied | screening | assessment | interview | offer | rejected | withdrawn
```

`ApplicationEvent` 是时间线真值；`currentStage` 是可验证投影/当前状态。

### 6.4 DiscoveryRun 不等于 Search Engine

Career Harness 只记录发现工作：

```text
DiscoveryRun
  executor: chatgpt-web | memoflow-ai | import | manual | other
  campaignId
  startedAt
  completedAt
  candidateCount
  insertedCount
  duplicateCount
  rejectedCount
```

真正的搜索能力属于外部 Agent / Search Capability。

---

## 7. Career Application Boundary

Career Domain 上方冻结稳定 application ports；所有 transport/agent/plugin 都只能经过这些边界。

目标 port family：

```text
CareerJobReadPort
CareerJobCommandPort
CareerApplicationReadPort
CareerApplicationCommandPort
CareerCampaignPort
CareerDiscoveryPort
CareerResumeReadPort
CareerAnalyticsReadPort
```

示例能力：

```text
searchJobs()
getJob()
checkDuplicate()
upsertJobsBatch()

listApplications()
getApplication()
recordApplication()
transitionApplication()

createCampaign()
getCampaign()
updateCampaign()
getCampaignProgress()

beginDiscoveryRun()
completeDiscoveryRun()

listResumeProfiles()
getResumeArtifact()
```

### 7.1 Idempotency

外部 Agent 可能重试，因此写能力必须优先设计成 idempotent：

- Job：source external id 优先，其次 canonical identity；
- Application：company/job/cycle guard + explicit idempotency key；
- DiscoveryRun：run id 不复用；batch item 单独返回 inserted / updated / duplicate / rejected；
- ApplicationEvent：event id / idempotency key 防重复追加。

### 7.2 Runtime validation

MCP、HTTP、MemoFlow adapter 的输入都使用同一 canonical schema，在 application/transport boundary runtime validate；模型 prompt 不是信任边界。

---

## 8. Transport / Adapter Architecture

同一组 Career application ports 对外可以有多个 adapter：

```text
                    Career Application
                           ^
       +-------------------+-------------------+
       |                   |                   |
      MCP                 HTTP              Web UI
       ^                   ^
ChatGPT Web         MemoFlow CareerGateway
```

V1 不允许：

```text
MCP -> DB
MemoFlow -> DB
Web UI -> DB
```

所有入口必须汇入 application boundary。

---

## 9. MCP Contract

MCP 是 ChatGPT Web 使用 Career Harness 的第一公民 transport，但不是业务 owner。

### 9.1 Read tools

优先保持工具少而稳定：

```text
career_context_get
career_jobs_search
career_job_get
career_job_duplicate_check
career_applications_list
career_application_get
career_campaigns_list
career_campaign_get
career_resumes_list
career_pipeline_stats
```

### 9.2 Write tools

```text
career_jobs_upsert_batch
career_job_state_set
career_application_record
career_application_transition
career_discovery_begin
career_discovery_complete
career_campaign_upsert
```

### 9.3 Tool safety

V1 不暴露真实招聘平台 `submit_application` tool。

记录“已经投递”与“执行真实外部投递”是两类权限：

```text
record application state = normal Career write
submit external application = future privileged action + explicit approval
```

---

## 10. MemoFlow Career Extension Boundary

### 10.1 Dependency direction

唯一允许方向：

```text
MemoFlow Career Extension
        -> Career public client/contracts
        -> Career Harness API
```

禁止：

```text
Career Core -> @memoflow/*
MemoFlow Career Extension -> Career persistence implementation
```

### 10.2 V1 先使用薄 integration package

建议未来实现：

```text
packages/career-integration/
  client/
  application/
  contributions/
    ai/
    goal/
    task/
    schedule/
  runtime/
```

但 V1 不因此创建完整通用 Plugin SDK。

### 10.3 CareerGateway

MemoFlow 只看到 narrow gateway：

```text
CareerGateway
  getCampaign(...)
  getCampaignProgress(...)
  searchJobs(...)
  getApplication(...)
  listApplications(...)
  recordApplication(...)
  requestDiscovery(...)
```

HTTP/Tailscale/local-network 只是 infrastructure adapter；Goal/Task/AI 不知道网络实现。

---

## 11. Extension / Contribution Model

长期目标采用 declarative manifest + typed contributions，而不是万能 Service Locator。

概念模型：

```text
ExtensionManifest
  id
  version
  compatibleHost
  provides[]
  requires[]
  activationIntents[]

ExtensionContributions
  AI tools
  Goal assistance / metrics
  Task suggestions
  Schedule handlers
  Navigation / widgets      (later)
  Settings                  (later)
```

原则：

- manifest 是数据，不包含任意 host internals；
- contribution 注册返回 disposable；
- host 负责 activation/deactivation lifecycle；
- extension 只能拿到声明的 narrow capability；
- 不提供 `ctx.db` / global `BusinessService` / arbitrary service locator；
- version mismatch fail closed；
- required capability 缺失时 extension 不得伪成功。

### 11.1 为什么这样对未来 Cordis 友好

未来若 Cordis Spike 通过，可以机械映射：

```text
manifest requires/provides -> Cordis service dependency
registration disposable    -> Cordis effect ownership
start/stop                  -> plugin lifecycle
contribution registry       -> Context service/registry
```

Career Domain / Application 无需改写。

---

## 12. Goal Integration

### 12.1 User journey

用户创建 Goal：

```text
“3 个月内找到杭州 AI Agent / AI 全栈工作”
```

流程：

```text
Goal created
  -> AI / intent analysis
  -> canonical intent: career.find-job
  -> Extension Catalog matches Career capability
  -> UI recommends Career Extension
  -> user enables/binds
  -> Career Campaign created or selected
  -> IntegrationBinding persisted
```

AI 可以负责“理解与推荐”，但启用 extension 和创建 durable binding 必须走 product command，并可让用户确认。

### 12.2 IntegrationBinding

不要扩展当前 closed Relation SubjectTypes 来偷渡外部资源。

V1 由 career-integration owner 一个小型 binding：

```text
IntegrationBinding
  identityId
  hostKind: goal
  hostId
  extensionId: career
  resourceKind: campaign
  resourceId
  status: active | paused | detached
  createdAt
  updatedAt
```

这是 integration truth，不是 Goal truth，也不是 Campaign truth。

未来第二/第三个外部扩展出现后，再判断是否抽成通用 ExtensionBinding package。

### 12.3 Goal progress

Career 不直接修改 KR。

正确路径：

```text
Goal read/progress assembler
        -> Career metric contribution
        -> CareerGateway
        -> Campaign/Application facts
        -> metric projection
```

例如：

```text
career.applications.submitted.weekly = 3
career.interviews.active = 1
career.jobs.shortlisted = 12
```

Goal owner 决定这些事实如何映射为 KR progress。

当前 Goal 的 Task -> Goal progress 使用专用 durable outbox/handler；Career metric 不应未经设计直接伪装成 Task contribution。需要时为 external metric 单独设计 owner-approved contract。

---

## 13. Task Integration

Career 只能贡献 `TaskSuggestion`，Task 仍拥有 Task truth。

示例：

```text
ApplicationEvent: INTERVIEW_SCHEDULED
  -> Career Extension derives suggestion
  -> “准备腾讯 Agent 工程师一面”
  -> user/AI review
  -> TaskApplicationPort.create(...)
```

建议 contract：

```text
TaskSuggestion
  sourceExtension
  sourceResourceRef
  title
  description?
  suggestedDueAt?
  rationale
  dedupeKey
```

TaskSuggestion 不是 Task；未接受前不进入 Task DB。

---

## 14. Schedule / Scheduler Integration

时间真值继续由 MemoFlow Product Time / Schedule / Scheduler 持有。

用户说：

```text
“每天早上 8 点搜索新的 AI Agent 岗位”
```

接入 MemoFlow 后应形成：

```text
MemoFlow Schedule intent
  -> Scheduler durable invocation
  -> handlerKey: career.discovery.run
  -> Career Extension handler
  -> CareerGateway.requestDiscovery(campaignId)
```

Career Harness 不再自己保存“每天 8 点”作为第二套 scheduler truth。

### 14.1 Search executor 可以缺席

`career.discovery.run` 不应假设 Career 内置搜索引擎。

更稳妥的模型：

```text
Scheduled handler
  -> create/request DiscoveryRun
  -> Discovery executor claims/handles request
  -> external Agent performs search
  -> upsert jobs
  -> complete DiscoveryRun
```

executor 可以是：

```text
chatgpt-web
memoflow-ai
manual/import
future search provider
```

如果 host 没有 Web Search / Agent executor，run 必须显式进入 waiting/unavailable，而不是静默标记 succeeded。

---

## 15. AI Integration

### 15.1 Career Harness 不拥有第二套 AI Provider

Career 只提供 deterministic tools / context。

```text
Career Application Port
       ^             ^
       |             |
 MCP Adapter     MemoFlow Mastra Adapter
       |             |
ChatGPT Web      MemoFlow Assistant
```

### 15.2 MemoFlow AI tool contribution

Career Extension 可以向 Mastra tool registry 贡献：

```text
career_jobs_search
career_job_get
career_jobs_upsert_batch
career_applications_list
career_application_transition
career_campaign_get
career_discovery_request
```

具体 tool implementation 只能调用 `CareerGateway`。

### 15.3 Human approval boundary

建议：

```text
read Career data                  -> no approval
store discovered Job              -> normal write, idempotent
record/transition known pipeline  -> normal write
create MemoFlow Task              -> follow Task/AI existing approval semantics
schedule recurring discovery      -> persistent config, approval
external job application submit   -> future privileged action, explicit approval
```

---

## 16. Resume Integration

Resume Harness 继续拥有 resume content truth。

Career 保存的是 registry/projection：

```text
ResumeProfileRef
  source = resume-harness
  profileId
  displayName
  version
  artifactUri/path
  contentHash
  generatedAt
```

Career 可以记录：

```text
Application -> ResumeProfileRef/version
```

从而回答“这个岗位当时投的是哪份简历”。

Career 不重新实现 Resume Editor。

---

## 17. Knowledge Integration

Thought Forest 继续拥有 Markdown knowledge truth。

Career 只保存稳定 ref / projection：

```text
KnowledgeRef
  source: thought-forest
  path/id
  title
  tags
```

未来可链接：

```text
JobRequirement -> KnowledgeRef
InterviewEvent -> KnowledgeRef
Company -> KnowledgeRef
```

但不复制正文作为第二份长期真值。

---

## 18. Identity, Auth and Permissions

### 18.1 不共享数据库 session

MemoFlow 和 Career 是两个 owner system，不通过“读同一个 user 表”耦合。

### 18.2 V1 integration auth

建议使用 scoped integration credential：

```text
career.read
career.write
career.discovery.request
```

MemoFlow `CareerGateway` 保存/解析 integration credential；Career API 验证 scope。

未来多用户时可以迁 OAuth / service connection，但 public application contract 不需要变化。

### 18.3 MCP auth

MCP 与 MemoFlow integration token 可以是不同 credential/scope，不因为都是用户本人而默认共享万能 secret。

---

## 19. Failure and Retry Semantics

### 19.1 Tool failure

AI-facing tool 返回 stable typed failure；不让 provider/raw DB message 决策业务分支。

### 19.2 Retry

- idempotent query：host/model 可以有限重试；
- idempotent write：同 idempotency key 安全重试；
- external search：DiscoveryRun 记录 attempt；
- 非幂等外部真实投递：V1 不提供；未来必须单独 receipt/approval/idempotency 设计。

默认 corrective retry 不无限循环；无领域特殊规则时最多 3 次后进入 explicit failure / human action。

### 19.3 Offline / Career service unavailable

MemoFlow 不得把 Career unavailable 当作 Goal/Task corruption。

应表现为：

```text
extension status = degraded/unavailable
Goal/Task core remains usable
cached projection may be stale and labelled as stale
writes fail closed
```

---

## 20. Proposed Repository Boundaries

### 20.1 Career Harness repository

目标结构：

```text
career-harness/
  apps/
    web/
    api/

  packages/
    contracts/
    career/
      domain/
      application/
      infrastructure/
      transport/
    persistence-sqlite/
    resume-adapter/
    knowledge-adapter/
    mcp/
    client/

  docs/
    architecture/
```

不要求为了“看起来 DDD”过度拆 package；关键是依赖方向和 public port 稳定。

### 20.2 MemoFlow repository

第一版只增加一个薄 integration feature，而不是 Plugin SDK：

```text
packages/career-integration/
```

当第二/第三个外部扩展出现且重复 seam 已经可观察，再提炼：

```text
ExtensionManifest
ExtensionCatalog
ContributionRegistry
ExtensionBinding
```

到通用 package。

---

## 21. Plugin Maturity Levels

### Level 1 — Plugin-ready（现在）

```text
independent domain
stable ports/contracts
host-neutral client
lifecycle-aware adapter
typed contribution seams
disposable registration design
```

### Level 2 — First-party Extension Host（Career 接 MemoFlow）

```text
build-time / boot-time known extension
enable/disable
capability compatibility check
AI/schedule/goal/task contributions
integration binding
```

### Level 3 — Full Plugin Runtime（未来满足触发条件后）

候选能力：

```text
dependency resolver
service registry
effect ownership
loader/profile
runtime activation
third-party permission/sandbox
UI contribution loader
plugin migrations
marketplace
```

只有出现多个真实 optional modules 后才启动 Cordis Compatibility Spike。

---

## 22. Cordis Compatibility Boundary

未来 Spike 必须证明：

1. 能包住现有 `career-integration` 而不改 Career Domain；
2. 能把 contribution registration 变成 reversible effects；
3. capability dependency 比当前 host composition 更简单；
4. disable/unload 后 handler/tool/listener 完整 cleanup；
5. 不要求 Goal/Task/AI/Scheduler 重写为 Cordis-native domain；
6. 不要求 Career DB 与 MemoFlow DB 合并；
7. 不要求先建设 Marketplace/remote UI loader。

出现以下情况则停止 Spike：

```text
必须先改 owner domain
必须重写 scheduler
必须重写 Mastra runtime
必须把所有 host DI 改为 service locator
必须把外部数据搬入 MemoFlow DB
```

---

## 23. Primary End-to-End Vertical Slice

第一条必须打通的跨系统 vertical slice：

```text
1. User creates Goal: “找到 AI Agent 工作”
2. AI identifies intent = career.find-job
3. Career extension is recommended
4. User confirms enable/bind
5. Career Campaign is created
6. IntegrationBinding links Goal -> Campaign
7. ChatGPT Web searches jobs
8. MCP career_jobs_upsert_batch stores new jobs
9. User applies to one job externally
10. MCP career_application_record stores Application + Resume ref
11. MemoFlow Goal detail reads campaign metric projection
12. Application enters interview
13. Career derives TaskSuggestion
14. User confirms
15. MemoFlow Task owns created preparation task
```

这条路径成功后，插件化价值已经被真实验证，不需要 Marketplace 才算成功。

---

## 24. Protected Contracts

实施任何 Career/MemoFlow integration 时必须保护：

1. `MemoFlow owns product truth; Mastra owns AI runtime truth`；
2. Goal / Task public application ports 不被 Career bypass；
3. Scheduler 继续 feature-neutral，执行 typed registered handler；
4. current `ScheduledHandlerRegistry` 的 unknown/payload-invalid fail-closed 语义；
5. Relation 当前 closed subject vocabulary 不被临时 hack；
6. Resume Harness 继续拥有 resume source truth；
7. Thought Forest 继续拥有 knowledge content truth；
8. Career Domain 不 import `@memoflow/*`；
9. Career transport 不直接暴露 persistence row；
10. 插件化不引入第二 Agent runtime；
11. 不因为 Career 而提前绑定 Cordis；
12. disable/unavailable Career 不得破坏 MemoFlow 核心 Goal/Task 使用。

---

## 25. Phased Roadmap

### Phase 0 — Contract baseline

**Goal:** 冻结 Career standalone domain、public ports、MCP contract 和 MemoFlow integration boundary。

Deliverables：

- Career domain vocabulary；
- canonical schemas；
- ownership matrix；
- MCP tool contract；
- integration binding contract；
- CareerGateway contract；
- first vertical-slice acceptance tests definition。

Exit evidence：无需运行 Career 实现即可从 contract 明确判断谁拥有每个状态。

### Phase 1 — Career Harness standalone V1

**Goal:** 不依赖 MemoFlow 完成 Job/Application/Campaign/Resume Registry + Web UI/API。

Vertical slice：

```text
create campaign -> upsert discovered jobs -> dedupe -> record application -> timeline -> dashboard
```

### Phase 2 — MCP first-class adapter

**Goal:** ChatGPT Web 可以完整读取上下文、批量写岗位、记录 application，并且所有写入可去重/审计。

### Phase 3 — MemoFlow Career integration

**Goal:** 只实现最小真实联动：

```text
Goal binding
Career metric read
AI tool contribution
Schedule handler contribution
TaskSuggestion -> confirmed Task create
```

不实现动态 plugin loader。

### Phase 4 — Hardening

- scoped auth；
- service unavailable/degraded；
- retry/idempotency；
- stale projection；
- audit trail；
- backup/export；
- extension enable/disable cleanup。

### Phase 5 — Plugin architecture evidence review

只有已经出现更多 optional modules 或明显重复 extension wiring 时：

- 总结 Career extension 实际 pain points；
- 判断是否抽通用 Extension Catalog/Binding/Registry；
- 满足触发条件后执行 Cordis Compatibility Spike。

---

## 26. Execution Tickets — Next Stage

### CH-0001 — Freeze Career domain vocabulary

**Goal:** 用 schema/文档冻结 Company、Job、Application、Campaign、DiscoveryRun、ResumeProfileRef 的职责和状态机。
**Protected contracts:** 不引用 MemoFlow 类型；Job/Application 分离。
**Acceptance:** 每个实体有 owner、identity、lifecycle、dedupe/idempotency 规则。

### CH-0002 — Freeze Career public port contract

**Goal:** 定义 transport-neutral read/write ports 和 canonical DTO/schema。
**Dependencies:** CH-0001。
**Acceptance:** MCP/HTTP/未来 MemoFlow client 能共享同一 application semantics。

### CH-0003 — Freeze MCP surface

**Goal:** 用最小稳定工具集覆盖当前 ChatGPT Web 求职流程。
**Dependencies:** CH-0002。
**Acceptance:** “搜索 -> 去重 -> 入库 -> 投递记录 -> pipeline 查询”不需要 DB access。

### CH-0004 — Freeze MemoFlow CareerGateway + IntegrationBinding — completed 2026-09-16

**Goal:** 在独立 Job Harness V1 获得生产证据后，冻结 Goal ↔ Campaign 绑定和 MemoFlow 到 Career 的 narrow gateway。已通过 `@job-harness/client` CareerGateway、host-owned `CareerIntegrationBindingSchema` 与 REST Pipeline/Discovery parity 落地；MemoFlow runtime integration 仍未实施。
**Dependencies:** CH-0002 + standalone V1 evidence。
**Protected contracts:** 不扩 Relation closed vocabulary；不直接访问 Career DB；Job Harness core 不依赖 `@memoflow/*`。

### CH-0005 — Define first host contribution seams from real MemoFlow code — next

**Goal:** 等 Job Harness standalone flow 可用后，再根据真实接入需求定义 AI tool / schedule handler / metric / task suggestion seams。
**Dependencies:** CH-0004。
**Acceptance:** 不出现万能 PluginContext/ServiceLocator，不为了未来插件化提前侵入 host。

### CH-0006 — Create Career Harness repository skeleton — completed early

**Goal:** 独立仓库已经先行创建，以确保 Career/Job Harness 从第一天就是独立 bounded context。仓库只建立目录、contracts、test harness 与 architecture，不先堆 UI，也不接入 MemoFlow。
**Dependencies:** repository bootstrap 已完成；CH-0001..0003 在该独立仓库内继续冻结。

---

## 27. Verification Matrix

| Invariant | Verification |
| --- | --- |
| Career 独立于 MemoFlow | Career package graph 不允许 `@memoflow/*` |
| MemoFlow 不碰 Career DB | integration package 只依赖 Career client/contracts |
| Goal/Task owner 不被 bypass | integration tests 只通过 public application ports |
| Search engine 可替换 | DiscoveryRun executor 是外部 capability，不 import search provider in domain |
| Scheduler 单一真值 | recurring rule 只存在 MemoFlow Schedule when integrated |
| AI 可替换 | MCP 与 Mastra adapter 对同一 Career application contract 做 contract tests |
| Extension disable 安全 | dispose 后 tool/handler/listener registry 无残留 |
| Relation 不被 hack | relation subject schema 不因 Career V1 修改 |
| Application timeline 可审计 | currentStage 可由 ordered events 验证 |
| Agent retry 安全 | upsert/batch/application event idempotency tests |

---

## 28. Open Decisions — Not Blocking Phase 0

以下问题暂不需要在创建 domain contract 前决定：

1. Career Harness 最终产品名是 `Career Harness` 还是 `Job Harness`；namespace 先使用稳定的 `career.*`。
2. standalone V1 使用 SQLite 还是 PostgreSQL；单用户部署默认倾向 SQLite，但 public port 不依赖数据库。
3. MemoFlow integration credential 最终是 static scoped token 还是 OAuth；gateway contract 先与 auth mechanism 解耦。
4. Career Web UI 是否以后嵌入 MemoFlow；V1 继续独立 UI。
5. 是否把 IntegrationBinding 泛化成全产品 ExtensionBinding；只有第二个真实外部 extension 出现后再决定。

---

## 29. Architecture Decision Summary

现在应该实施的不是“完整插件系统”，而是：

```text
Career Harness
  = independent bounded context/product
  + stable application contract
  + MCP-first harness
  + plugin-ready integration seam

MemoFlow Career Extension
  = thin adapter
  + real contribution points
  + no duplicated truth
```

Career Harness 将作为 Future MemoFlow Extension Architecture 的第一个 production-shaped proof：先用真实业务找出正确的 extension points，再决定是否抽象通用 Plugin SDK / Cordis Runtime。
