
# Recruitment Browser Runtime 深度整合方案

> Status: Draft / architecture plan  
> Date: 2026-09-20  
> Scope: Job Harness 浏览器自动化、旧 Job Application Copilot 能力复用、第三方开源招聘自动化项目的持续上游同步  
> Non-goal: 本文先确定架构与迁移策略，不立即重写现有可工作的 BOSS / ATS 生产路径。

## 1. 背景与问题

Job Harness 当前业务层已经形成较清晰的事实源：

- Campaign 决定目标岗位、城市、Resume Profile 与自动化开关；
- Job / Listing / Observation 保存岗位发现证据；
- Resume Profile / Revision / Artifact 管理简历选择与不可变 PDF；
- SubmissionIntent 表达“准备申请”的业务意图；
- ExecutionAttempt 表达一次技术执行；
- JobOutreachEvent 记录 BOSS 打招呼、回复、发简历等招聘沟通；
- Application / ApplicationSubmission 只在有真实申请证据后成立；
- EmailApplicationPackage 把邮件主题、正文、收件人、简历和 draftHash 冻结为一个可审计包。

问题主要集中在浏览器执行层。

旧 Job Application Copilot 的优势是浏览器权限宽、站点逻辑集中：一个浏览器扩展 / userscript 可以自己完成页面遍历、DOM 扫描、点击、填表、上传、等待、重试、跨 tab 协调和站点特殊处理。因此在 ChatGPT 开发时，用户几乎不需要参与插件刷新、浏览器启动和执行过程。

Job Harness 早期迁移则把浏览器操作拆得更细：

~~~
Job Harness / Apply Worker
  -> Browser Bridge
     -> scan / click / fill / select / upload / wait ...
        -> Browser Extension
~~~

这种拆分对审计和抽象有价值，但如果把它作为成熟招聘网站的主执行模型，会造成两个问题：

1. 原本上游项目已经验证过的站点状态机，被重新拆成大量 Job Harness Adapter / BrowserDriver 细节；
2. 每次网站变化都容易演变成“我们自己重新适配 DOM”，失去直接复用上游更新的价值。

BOSS 后来改成 Compatibility Runtime，本质上已经证明更合适的迁移方式：

~~~
Job Harness
  owns business truth / policy / resume / audit

mature BOSS runtime
  owns BOSS page state machine
~~~

本文把这一经验推广到整个招聘浏览器自动化层。

---

## 2. 核心结论

### 2.1 统一口径

后续采用：

> **业务状态细粒度，浏览器操作粗粒度；浏览器权限可以宽，外部业务副作用必须可配置、可追溯。**

Job Harness 不应该重新实现每个成熟开源项目已经维护好的 selector、点击序列、页面等待和站点恢复逻辑。

对于成熟站点，Job Harness 只下发业务任务：

~~~
collect
inspect-job
greet
send-resume
prepare-application
fill-application
submit-application
~~~

而不是远程编排：

~~~
scan
click div:nth-child(...)
wait
fill
click
scan
...
~~~

低级 BrowserDriver API 保留，但降级为：

- 新站点探索；
- characterization；
- 调试；
- 没有成熟 Site Runtime 时的 generic fallback；
- AI 临时接管工具。

### 2.2 目标系统定义

> **Job Harness = 求职自动化 Control Plane**  
> **Recruitment Browser Runtime = 高权限、隔离、可更新的 Execution Plane**

Control Plane 决定：

- 为什么执行；
- 对哪个岗位执行；
- 使用哪份 Resume；
- 当前 Campaign 允许执行到哪一步；
- 是否允许 recruiter outreach / email send / final submit；
- 最终外部结果是否有足够证据。

Execution Plane 决定：

- BOSS / 智联 / 猎聘 / 牛客 / Moka / 北森等页面具体如何操作；
- 页面变化后如何恢复；
- 如何等待、翻页、切 tab、处理动态 DOM；
- 如何调用成熟上游 Runtime。

---

## 3. 设计原则

### P1. Upstream-first，而不是 Adapter-first

存在成熟开源实现时，优先顺序：

~~~
直接复用成熟上游 Runtime
  > 对上游做薄封装 / overlay
  > 复用成熟通用 Form Engine
  > 自己写 Site Adapter
  > 最后才使用通用 AI Browser Agent
~~~

不得因为 Job Harness 已经有 BrowserDriver / Adapter SPI，就默认重新实现站点细节。

### P2. 不 Fork 站点逻辑，除非没有其他选择

对第三方项目尽量维持“上游原样 + Job Harness 薄集成层”。

本地修改允许：

- 配置注入；
- Job Harness Task 输入适配；
- Job Harness Event / Evidence 输出适配；
- Resume Artifact 获取；
- 日志 / trace；
- 运行时生命周期；
- 必要的安全边界。

尽量禁止：

- 自己复制一份 selector 后长期维护；
- 为了适配 Job Harness 重写整个 upstream state machine；
- 在 upstream 源码中混入 Job Harness 数据库 / Domain 逻辑。

如果某个站点 bug 已被 upstream 修复，应优先升级 upstream，然后删除本地补丁。

### P3. Strangler migration

不做一次性“新架构替换所有旧代码”。

~~~
old/proven runtime
  -> Site Runtime Plugin
  -> characterization + live canary
  -> production
  -> 再删除重复 Job Harness adapter
~~~

### P4. Dedicated browser by default

招聘自动化默认运行于 Job Harness 专用浏览器 Profile，不占用用户平时使用的 Edge / Chrome。

### P5. Browser primitive 权限宽，业务副作用权限清晰

专用浏览器可以默认拥有：

- tabs；
- scripting；
- DOM read/write；
- navigation；
- file upload；
- extension storage；
- 招聘网站 host permission；
- localhost CDP debugging。

真正需要配置的是：

- 是否收集岗位；
- 是否打招呼；
- 是否发送 BOSS 简历；
- 是否填官网表单；
- 是否上传 Resume；
- 是否最终 submit；
- 是否发送招聘邮件。

### P6. Job Harness 仍是唯一事实源

第三方 Runtime 不拥有：

- canonical Job ledger；
- Resume Profile truth；
- Application truth；
- SubmissionIntent truth；
- Campaign policy；
- 最终成功状态。

第三方 Runtime 可以有短期运行缓存，但不能成为业务事实源。

---

## 4. 目标架构

~~~
                    ChatGPT / Daily Automation
                              |
                              v
+---------------------------------------------------------+
|               Job Harness Control Plane                 |
|                                                         |
| Campaign / Job / Resume / Outreach / SubmissionIntent   |
| Application / Audit / Automation Policy / Evidence      |
+-----------------------------+---------------------------+
                              |
                     coarse-grained task
                              |
                              v
+---------------------------------------------------------+
|            Recruitment Browser Supervisor               |
|                                                         |
| browser lifecycle / profile / runtime version / update  |
| login health / task dispatch / heartbeat / recovery     |
+-----------------------------+---------------------------+
                              |
              +---------------+----------------+
              |                                |
              v                                v
+---------------------------+      +---------------------------+
| Mature Site Runtime       |      | Generic Browser Runtime   |
|                           |      |                           |
| boss-czc-good-job         |      | Browser Form Engine       |
| zhaopin-upstream/runtime  |      | typed ATS playbook        |
| liepin-upstream/runtime   |      | BrowserDriver primitives  |
| ...                       |      | semantic fallback         |
+-------------+-------------+      +-------------+-------------+
              |                                  |
              +------------------+---------------+
                                 |
                                 v
                     Dedicated Edge / Chrome
                    persistent JobHarness profile
~~~

---

## 5. Site Runtime Plugin

成熟站点不再以几十个远程 DOM command 作为业务接口，而以 Site Runtime Plugin 暴露粗粒度能力。

概念接口：

~~~
RecruitmentSiteRuntime
  id
  version
  upstream identity
  capabilities
    discovery
    inspectJob
    outreachGreeting
    recruiterInbox
    sendResume
    formFill
    resumeUpload
    finalSubmit

  probe()
  execute(task) -> RuntimeEvent stream
  recover(attempt)
~~~

任务示例：

~~~
kind: fill-application
jobId: ...
listingId: ...
resumeArtifactId: ...
policy:
  fill: true
  uploadResume: true
  submit: false
~~~

Runtime 内部可以执行 30 次 DOM 操作，但 Job Harness 只看到稳定的事件：

~~~
task_started
job_opened
form_entered
form_filled
resume_uploaded
review_ready
human_required
submit_started
submission_confirmed
failed
~~~

这样既保留工程化审计，也不把站点状态机拆碎。

---

## 6. Browser Bridge 的重新定位

Browser Bridge 保留，但不再作为成熟 Site Runtime 的主要“远程 DOM RPC”。

新的定义：

> **Browser Runtime Control Link**

主要职责：

### Control Plane -> Browser

- claim task；
- task policy；
- exact Resume Artifact；
- short-lived business capability；
- runtime config；
- cancel / pause。

### Browser -> Control Plane

- heartbeat；
- runtime version；
- login / challenge health；
- RuntimeEvent；
- evidence；
- final result。

已有 scan / click / fill / select / upload / screenshot 等 primitive 继续保留给：

- Generic Runtime；
- characterization；
- 新站点；
- debug tooling；
- bounded semantic fallback。

---

## 7. Dedicated Recruitment Browser

### 7.1 目标体验

用户最终不应该再需要：

- 手动 Load unpacked；
- 手动点击扩展刷新；
- 手动同步 JS；
- 手动打开 BOSS / 智联页面；
- 每次开发后手动重启；
- 告诉 ChatGPT“我已经加载插件了”。

目标体验：

~~~
Job Harness 有任务
  -> Supervisor 检查专用 Browser
  -> 不存在则自动启动
  -> 自动加载当前 Runtime Bundle
  -> 保持持久登录 Profile
  -> 执行任务
  -> 失败自动恢复
~~~

### 7.2 Browser Profile

建议统一：

~~~
%LOCALAPPDATA%\JobHarness\Browser\Profile
~~~

而不是长期为 BOSS 单独维持另一个产品级体系。

迁移期间允许 BOSS Profile 与统一 Recruitment Browser Profile 并行，等新 Runtime 真实 canary 后再迁登录态。

### 7.3 Browser Supervisor

新增一个小型 Windows-side Supervisor。

职责：

- 自动启动 / 停止专用 Edge；
- 检测 browser crash；
- 保证 CDP localhost；
- 管理 extension/runtime bundle；
- 检查 Runtime version；
- 自动更新；
- 必要时自动重启 browser；
- 上报 login / challenge / health；
- 不持有 Job Harness 全局 DB 权限。

当前 PowerShell launcher 保留为 bootstrap / recovery 工具，不再是日常运行入口。

---

## 8. 插件与 Runtime 自动更新

### 8.1 当前问题

现在 BOSS launcher 已经能自动拉取生成后的 boss-copilot.js，但 manifest、background、shim、完整 extension bundle 发生变化时仍需要人工刷新或重启。

### 8.2 目标更新链

~~~
Upstream commit / Job Harness integration change
  -> build versioned Runtime Bundle
  -> CI checks
  -> publish manifest + SHA256
  -> Windows Supervisor polls
  -> download
  -> verify hash/version
  -> atomic replace
  -> reload or restart dedicated browser
  -> health check
  -> report active version
~~~

### 8.3 Reload 策略

开发模式：

~~~
bundle replace -> chrome.runtime.reload()
~~~

生产模式优先：

~~~
bundle replace -> restart dedicated browser
~~~

因为浏览器 Profile 持久化，重启不会等于重新登录。对专用浏览器而言，重启通常比复杂 hot reload 更可靠。

---

## 9. 上游项目复用策略

### 9.1 czc-good-job / BOSS

定位：BOSS Site Runtime 的直接上游。

当前公开主线已经包含：

- 搜索关键词轮换；
- 岗位规则打分；
- 自动打招呼；
- recruiter 新消息后发送指定简历；
- 无新岗位后切换关键词；
- 超时 / 详情 / 招呼异常恢复。

License: MIT。

策略：

- 继续作为 BOSS Runtime upstream；
- 不再自行重写 BOSS 搜索 / chat / resume DOM state machine；
- Job Harness 只维护 integration overlay、动态评分、Resume 选择、审计和 Campaign policy；
- 上游更新后优先 sync + characterization，而不是手工 cherry-pick selector。

### 9.2 OpenJobAutofill

定位：通用招聘表单兼容引擎。

公开项目目标本身就是：

- 扫描招聘申请表；
- 本地规则 + 可选 AI 理解字段；
- 支持常见 input / select / radio / checkbox / date；
- 只填能够确定的字段；
- 不自动最终提交。

License: MIT。

策略：

- Browser Form Engine 尽可能维持 upstream-derived；
- 定期同步字段识别和 UI framework 兼容修复；
- Job Harness 不重复维护同类 React/Vue controlled-input hack；
- final submit 仍属于 Job Harness policy，而不是 Form Engine。

### 9.3 Autograph

定位：国外 ATS adapter 参考 / 可选外部 Runtime。

公开 README 声明支持 21 个 ATS，包括 Workday、Greenhouse、Lever、Ashby、SmartRecruiters、Oracle HCM、iCIMS、SuccessFactors 等，并采用 per-ATS adapter。

License: GPL-3.0。

策略：

- 不能像 MIT 代码一样无条件 vendoring 到 Job Harness MIT 主仓并重新许可；
- 默认作为 architecture / characterization reference；
- 如果未来确实需要直接运行，优先做“独立 GPL Runtime + IPC”边界，或在明确接受许可影响后再决定；
- 不复制代码到 MIT package。

### 9.4 AIHawk

当前原始仓库已经 archived，且历史上受到平台政策 / provider 插件问题影响。

策略：

- 只作为自动申请系统 failure-mode / workflow reference；
- 不作为核心持续 upstream；
- 不投入迁移成本。

---

## 10. Upstream Registry

新增统一上游清单，例如：

~~~
upstreams:
  czc-good-job:
    repository: https://github.com/czc6666/czc-good-job
    license: MIT
    pinnedCommit: ...
    integration: direct-runtime
    importedPaths:
      - web_script.js
    localOverlay: integrations/site-runtimes/boss

  openjobautofill:
    repository: https://github.com/Br1an67/OpenJobAutofill
    license: MIT
    pinnedCommit: ...
    integration: form-engine
    localOverlay: packages/browser-form-engine
~~~

每条必须记录：

- repo URL；
- license；
- pinned commit / tag；
- last checked；
- imported paths；
- local patch set；
- upstream diff；
- characterization suite；
- production promoted version。

---

## 11. 上游快速同步机制

目标不是“永远 pin 住旧版本”，而是：

> 上游更新后，尽可能做到一条命令生成可 review 的升级。

建议增加：

~~~
pnpm upstream:check
pnpm upstream:diff <runtime>
pnpm upstream:sync <runtime>
pnpm upstream:test <runtime>
~~~

流程：

~~~
fetch upstream
 -> compare pinned commit
 -> license/provenance check
 -> materialize pristine upstream
 -> apply Job Harness overlay
 -> build Runtime Bundle
 -> characterization tests
 -> synthetic smoke
 -> paused real-browser canary
 -> promote
~~~

### 11.1 Pristine upstream + overlay

不要把第三方代码直接改得无法识别。

建议目录思想：

~~~
third_party/
  czc-good-job/
    upstream/
    UPSTREAM.md

integrations/
  site-runtimes/
    boss/
      adapter
      overlay/
      characterization/
~~~

如果不希望增加完整 source tree，也可以由 build script 根据 lockfile 拉取固定 commit，输出到 build cache；关键原则仍是“原始 upstream 与 Job Harness overlay 分离”。

### 11.2 Upstream Watch

自动化任务可每周检查：

- upstream 是否有新 commit / release；
- manifest / permission 是否变化；
- imported path 是否变化；
- license 是否变化。

有更新时只生成 UpgradeCandidate：

~~~
upstream old -> new
changed files
local patch conflicts
characterization result
rollout recommendation
~~~

不要直接无人值守升级生产浏览器。

---

## 12. 关于“风控”的明确口径

### 12.1 不能做的假设

不能假设：

> “开源自动投递项目已经把招聘平台所有风控都处理好了，所以 Job Harness 完全不用关心。”

公开项目通常能处理的是：

- 页面等待；
- 重试；
- 超时恢复；
- 关键词轮换；
- 某些登录 / 验证异常的检测；
- 已联系岗位去重；
- 站点特定流程。

但平台账号风控会持续变化，并且可能与账号年龄、操作频率、IP、登录设备、行为节奏、当日联系量和验证挑战有关。

以当前公开的 czc-good-job README 为例，它明确宣传关键词轮换、自动招呼、消息后发简历和异常恢复，但没有公开承诺“完整绕过 / 解决 BOSS 风控”。

### 12.2 Job Harness 应做什么

原则不是自己研发“反检测系统”。

而是：

> **站点行为优先继承成熟 upstream；Job Harness 只提供平台无关的 supervisory safety。**

Job Harness 自己只保留：

- action budget；
- cooldown；
- duplicate guard；
- stop-on-challenge；
- stop-on-login-expired；
- bounded retry；
- account-level pause；
- human-required 状态。

不实现：

- CAPTCHA 绕过；
- 验证码自动破解；
- 指纹伪装军备竞赛；
- 为逃避平台限制而持续修改站点特征。

一旦 upstream 已经处理 pacing / challenge detection，就优先原样复用，不再写第二份。

---

## 13. 权限模型

### 13.1 Browser Runtime 默认高权限

这是 Job Harness 专用 Browser，不是用户日常浏览器，因此可以默认允许：

~~~
navigation
tabs
DOM read
DOM write
click
scroll
file upload
download
local extension storage
site cookies/session through browser profile
localhost CDP
~~~

无需为每个 click 发短期 token。

### 13.2 业务副作用按 Campaign 配置

推荐统一成：

~~~
automation:
  collection:
    enabled: true

  outreach:
    bossGreetingEnabled: true
    bossResumeFollowupEnabled: true

  officialSite:
    prepareEnabled: true
    fillEnabled: true
    submitEnabled: false

  email:
    draftEnabled: true
    sendEnabled: false
~~~

这里才是用户真正关心的权限。

### 13.3 保留低成本系统边界

即使 Browser 权限宽，也不需要赋予：

- Job Harness 全局数据库 token；
- SSH；
- 任意 shell；
- 任意本机文件系统；
- 服务器 root；
- 非招聘站点全局 cookie。

Supervisor 只管理：

- Job Harness Browser 进程；
- Job Harness Browser Profile；
- Runtime Bundle；
- localhost CDP；
- Job Harness scoped task transport。

---

## 14. Runtime Version 与可追溯性

每一个 ExecutionAttempt / Outreach run 都应该记录：

~~~
jobHarnessVersion
browserSupervisorVersion
browserRuntimeVersion
extensionVersion
siteRuntimeId
siteRuntimeVersion
upstreamProject
upstreamCommit
formEngineVersion
policySnapshotHash
~~~

例如失败时直接看到：

~~~
siteRuntime=boss-czc-good-job
siteRuntimeVersion=1.4.2+jh3
upstreamCommit=abc123
extensionVersion=0.4.0
browser=edge
~~~

而不是再猜“是不是插件没有刷新”。

---

## 15. Site Runtime Health

Job Harness Web 增加 Automation / Browser Runtime 状态视图：

~~~
Browser Supervisor    Online
Dedicated Edge       Running
Profile              Healthy
Runtime Bundle       Current
Current Task         Idle

BOSS                 Ready       Logged in
Zhilian              Ready       Logged in
Liepin               Ready       Login expired
Nowcoder             Ready       Logged in
Moka                 Available   Not canary-proven
~~~

SiteHealth 至少包括：

- runtime installed；
- version；
- login state；
- challenge detected；
- last successful task；
- last error；
- upstream update available；
- production proof level。

---

## 16. AutomationRun Projection

现有领域实体继续保持独立，不强行合并。

额外增加只读 projection：

~~~
AutomationRun
  daily-2026-09-20
    discovery: 120
    inserted: 36
    shortlisted: 18
    bossGreetingSent: 7
    bossResumeSent: 2
    officialPrepared: 5
    formFilled: 4
    emailDrafted: 3
    emailSentConfirmed: 0
    applicationsConfirmed: 1
    humanRequired: 2
~~~

它不替代 DiscoveryRun / ExecutionAttempt / Application，只提供运营视角。

---

## 17. 迁移阶段

### Phase 0 — Inventory / Freeze

目标：先明确哪些能力已经存在，避免重复写。

输出：

- legacy Copilot capability inventory；
- current Job Harness capability inventory；
- upstream project registry；
- duplicated implementation matrix；
- 每个 Runtime 的 production proof 状态。

此阶段不删除任何生产代码。

### Phase 1 — Browser Supervisor

优先恢复旧 Copilot 最有价值的 UX：

> 用户不再参与浏览器启动、extension 刷新、runtime sync 和 crash recovery。

完成：

- Dedicated Recruitment Browser；
- Windows Supervisor；
- auto start；
- auto bundle sync；
- auto reload/restart；
- login health；
- active runtime version reporting。

### Phase 2 — Site Runtime Contract

新增粗粒度 RecruitmentSiteRuntime contract。

先适配已有 BOSS Compatibility Runtime，不重写内部逻辑。

完成标准：

~~~
Job Harness task
 -> Site Runtime
 -> mature BOSS state machine
 -> Job Harness event/evidence
~~~

### Phase 3 — BOSS 正式 Plugin 化

将当前“特殊 Compatibility Runtime”改造成第一个标准 Site Runtime Plugin：

~~~
boss-czc-good-job
~~~

保留原 upstream state machine。

Bridge 只做 task/event transport。

真实 canary 覆盖：

- search；
- inspect；
- greeting；
- recruiter reply；
- resume follow-up；
- pause / challenge / login recovery。

### Phase 4 — Generic Form Engine 上游化

把 Browser Form Engine 明确改造成 upstream-synced component：

- OpenJobAutofill upstream pin；
- local patch manifest；
- sync script；
- characterization fixtures；
- generated extension runtime。

目标：以后 React/Vue/Ant/Element 等表单细节优先跟 upstream。

### Phase 5 — 恢复旧 Copilot 非 BOSS 能力

重新审计旧 Copilot / OpenJobAutofill 已经存在的：

- 智联；
- 猎聘；
- 牛客；
- Moka；
- 北森 / iTalentX；
- 飞书招聘；
- HotJob；
- 智业；
- generic Ant / Element / Arco / TDesign。

对每一个站点先判断：

~~~
已有成熟 upstream state machine?
  yes -> 直接包装成 Site Runtime
  no  -> Generic Form Runtime / existing typed adapter
~~~

禁止默认“重新写一个 adapter”。

### Phase 6 — 去重

在新路径经过真实 canary 后，才删除：

- 重复 selector；
- 重复 routing；
- 不再使用的 micro-bridge；
- 过渡期 compatibility special case；
- 同一站点两份独立 retry / pacing 逻辑。

### Phase 7 — Upstream maintenance automation

完成：

- weekly upstream check；
- UpgradeCandidate report；
- one-command sync；
- CI characterization；
- staged promotion；
- version rollback。

---

## 18. 测试策略

### 18.1 Characterization first

迁移上游项目之前先冻结行为。

每个成熟 Runtime 至少记录：

- 支持 URL；
- 登录态判断；
- job extraction；
- form entry；
- resume upload；
- outreach；
- success / failure detection；
- challenge / human-required 行为。

### 18.2 Test pyramid

~~~
unit
  site runtime adapter / contract transformation

fixture characterization
  sanitized DOM snapshots

synthetic browser smoke
  local pages / known test pages

paused real-browser canary
  inspect only

bounded live canary
  explicit permitted side effect

production promotion
~~~

### 18.3 Upstream upgrade gate

升级 upstream 必须通过：

- provenance / license；
- clean build；
- diff review；
- existing characterization；
- runtime contract；
- no new permissions without review；
- no unexpected side effects；
- rollback bundle available。

---

## 19. 发布与回滚

每个 Runtime Bundle 内容：

~~~
manifest.json
bundle-version.json
runtime files
upstream-lock.json
SHA256SUMS
~~~

生产发布：

~~~
candidate
 -> canary
 -> promoted
~~~

Supervisor 至少缓存：

~~~
current
previous-known-good
~~~

更新失败：

~~~
atomic rollback
 -> restart dedicated browser
 -> report rollback reason
~~~

---

## 20. 工程边界

### Job Harness Domain 不允许依赖

- DOM；
- Chrome APIs；
- Edge；
- Playwright；
- upstream JS globals。

### Site Runtime 不允许直接写

- SQLite；
- Application；
- Resume database；
- Campaign；
- SubmissionIntent。

### Supervisor 不允许

- 自己决定投哪个岗位；
- 自己选择 Resume；
- 绕过 Campaign policy；
- 把“无错误”当成提交成功。

---

## 21. 不做什么

当前不建议：

1. 为每个招聘网站重新写一套 Job Harness 原生 adapter；
2. 为了“架构纯洁”把已验证的 legacy runtime 全部翻译成 TypeScript；
3. 删除 BOSS Compatibility Runtime 后再从 BrowserDriver 重写；
4. 把所有浏览器操作都做成 MCP Tool；
5. 做通用 CAPTCHA bypass；
6. 让 LLM 成为每一个 click 的默认决策者；
7. 把第三方 upstream 自动更新后不经测试直接推生产；
8. 复制 GPL 代码进 MIT 包而忽略许可证边界。

---

## 22. 第一轮实施建议

下一轮正式实施只做三件事，不碰站点业务状态机。

### RBR-001 — Upstream Registry

建立：

- upstream lock；
- provenance；
- license；
- sync 状态；
- current pinned commit；
- local patch inventory。

先把 czc-good-job、OpenJobAutofill 纳入。

### RBR-002 — Browser Supervisor

让 Job Harness 可以自动：

- 启动 Dedicated Browser；
- 自动同步完整 Runtime Bundle；
- 自动重启 / reload；
- 上报 browser / runtime / login health。

做到开发完插件后用户不再手工刷新。

### RBR-003 — Site Runtime Contract + BOSS Adapter

只把当前已经工作的 BOSS Runtime 包进正式 Site Runtime contract。

**不重写 BOSS JS。**

证明粗粒度：

~~~
Task -> Runtime -> Events
~~~

能够完整代替当前 BOSS 特殊 Bridge 编排后，再继续其他站点。

---

## 23. 验收标准

这一轮架构优化最终应达到：

1. ChatGPT 修改浏览器 Runtime 后，用户不需要手动 reload extension；
2. Job Harness 能自动启动自己的独立浏览器，完全不影响用户日常浏览器；
3. 浏览器登录态持久化；
4. BOSS 成熟逻辑继续直接复用上游实现；
5. upstream commit / Runtime version 对每次执行可追溯；
6. 上游更新可以在一条标准 sync 流程中拉取、比较、测试和发布；
7. 成熟站点不再要求 Job Harness 自己逐 click / selector 重新实现；
8. Browser Bridge 退回 transport + fallback primitive；
9. external side effects 由 Campaign 业务开关决定，而不是限制每一个 DOM primitive；
10. challenge / login / rate-limit 异常能暂停并进入 human-required，而不是盲目重试；
11. 第三方许可证和 provenance 清晰；
12. 新路径经过真实 canary 后再删除旧实现。

---

## 24. 当前决策摘要

| 议题 | 决策 |
| --- | --- |
| 是否继续逐站点手写 Adapter | 否，upstream-first |
| BOSS 是否重写 | 否，继续直接复用成熟 runtime |
| Browser Bridge 是否删除 | 否，降级为 Control Link + generic fallback |
| 浏览器权限 | Dedicated Browser 内默认宽权限 |
| 权限控制颗粒度 | 业务副作用级，而不是 click 级 |
| 是否自动更新 extension | 是，由 Supervisor 管理 |
| 是否自动启动专用浏览器 | 是 |
| 是否共享日常浏览器 Profile | 否 |
| 是否直接跟踪 upstream 更新 | 是，pin + sync + canary |
| 是否假设 upstream 完全解决平台风控 | 否 |
| 是否自己研发 CAPTCHA / 反检测 | 否 |
| 风控相关站点行为由谁维护 | 优先 upstream Runtime |
| Job Harness 自己保留什么 | budget / cooldown / challenge-stop / audit |
| GPL 上游是否直接复制进 MIT 主仓 | 默认否 |
| 何时删除现有过渡实现 | 新 Runtime 真实 canary 之后 |

---

## 25. Upstream research snapshot

Checked: 2026-09-20.

- czc-good-job: https://github.com/czc6666/czc-good-job — MIT；BOSS 专用；公开主线包含搜索关键词轮换、规则评分、自动招呼、消息后发送简历、异常恢复。
- OpenJobAutofill: https://github.com/Br1an67/OpenJobAutofill — MIT；招聘表单扫描 / 填充；明确不自动最终提交。
- Autograph: https://github.com/tonybolivar/autograph — GPL-3.0；公开声明支持 21 个 ATS，适合作为 adapter / reference，但直接 vendoring 需要单独处理 GPL 边界。
- AIHawk: https://github.com/feder-cr/Jobs_Applier_AI_Agent_AIHawk — archived；仅作历史架构与 failure-mode 参考。

该列表不是永久白名单。每次引入 / 升级 upstream 都重新检查维护状态、License、权限变化和实际行为。
