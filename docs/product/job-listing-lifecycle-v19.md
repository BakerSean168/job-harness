# JobListing 招聘截止日期与生命周期 · V19

## 业务边界

- `Job` 是机会身份与人工分流，不代表招聘网站是否仍开放。
- `JobListing` 是每个平台/ATS 的招聘发布事实。一个 Job 可能对应多个 Listing。
- `JobObservation` 是某时刻的采集/核验记录。再次出现在搜索结果中仅代表 observed，不等于确认开放。
- `Application` 独立于外部招聘状态；职位关闭绝不自动取消、拒绝或删除已投递记录。
- `CampaignJobState` 负责某求职计划的归档与恢复，不能修改全局 Job 的分流状态，也不能影响其他 Campaign。

## 关闭情况和截止时间

| 场景 | 处理 |
|---|---|
| 企业提前招满、取消、官网下架 | 有有效证据时 `closed_confirmed`，保留 `closureReason` 与证据；`closedAt` 是系统检测时间而非企业实际关停时间 |
| 招聘方公布精确截止时刻 | `applicationDeadline.precision=datetime`，截止后立即禁止新外部投递，宽限期后可归档 |
| 公布仅有日期（如 10 月 30 日） | `precision=date`，采用公告所在时区当日 **包含整天** 的语义 |
| 招满即止 | `closingPolicy=until_filled`；没有明确截止日期时禁止凭天数推断“招满” |
| 长期未抓到/出现 403/验证码/无法访问 | 仅能标注未核验，不得据此关闭或归档 |
| 某个平台关闭，另一平台仍可申请 | 不关闭整个 Job；按 Listing 独立判断 |
| 企业延期/重新开放 | 新证据确认 `open_confirmed`，更新/撤销 deadline，Campaign 才有资格从 archived 恢复 |
| 已经投递，之后截止 | 新外部投递受到限制；原 Application 继续保留流程与证据 |

## 数据和状态约定

`JobListing` 增加 `closingPolicy`、`applicationDeadline`、`lastVerifiedAt`、`lastVerifiedOpenAt`、`closureReason`。
`JobObservation` 增加 `verificationKind`、`evidenceUrl`、`note`。
SQLite V19 为增量迁移，新增 `campaign_job_states` 和 `campaign_job_state_events`；旧 `Job.state` 和投递管线保持不变。

`ListingApplyability`（服务端计算，不存第二份真相）：
- `confirmed_open`：近期明确确认可申请。
- `unverified`：页面可检索、信息过旧或无足够证据。
- `deadline_passed`：公布的截止时刻已过，但不代表招聘方已确认关闭。
- `closed`：有关闭核验证据。
- `conflict`：截止后又明确确认开放，应复核企业是否延期。

新外部投递意图的 `prepare` 与 `begin` 拒绝 `deadline_passed/closed/conflict`；旧申请记录不受影响。每次候选采集必须区分 `observed` 与 `open_confirmed`，并记录核验来源。

## Campaign 归档策略

先计算所有 Listing 可投性，再独立对 Campaign 求值：
1. 任一来源 confirmed_open / conflict / unverified 则不能自动归档；
2. 每个来源必须是可靠关闭，或有明确截止且宽限期已过，才能进入候选；
3. 48 小时（默认）宽限；只有日期没有时分时更保守地按本地自然日计算；
4. 有任何 Application、未终结的 SubmissionIntent 时均跳过；
5. 自动归档只更新 `campaign_job_states`，追加审计事件，不改全局 Job 状态、Listing 状态、Application；
6. 有比归档时间更新的 `open_confirmed` 后，可恢复到 active 并追加审计事件；
7. 重复执行幂等、失败回滚，归档记录永久可查；默认岗位列表隐藏当前 Campaign 的归档条目，可通过筛选包含已归档。

## 实施策略与安全门槛

- 服务端每日巡检默认只预演，需显式设置 `JOB_HARNESS_LIFECYCLE_AUTO_ARCHIVE=true` 才允许写入。
- 参数 `JOB_HARNESS_LIFECYCLE_CAMPAIGN_IDS` 限定目标 Campaign，`JOB_HARNESS_LIFECYCLE_GRACE_HOURS` 控制宽限。
- 人工预演：`pnpm jobs:lifecycle:sweep -- --db <sqlite-path> --campaign <id>`
- 明确写入：`pnpm jobs:lifecycle:sweep -- --db <sqlite-path> --campaign <id> --apply`
- 先进行数据库快照、P0 类型/单元/集成测试、真实数据 dry-run，再启用自动归档，不能直接在未经核验的历史 8000+ 岗位上批量把 Job.state 设成 closed。
- Hark 继续是独立外部投递执行器；本次只通过 Job Harness 的 SubmissionIntent 管道执行可投性硬门槛，不创建重复的浏览器/投递服务。

## 已覆盖的验收场景

- 日期末尾时区与分钟级 deadline、过期宽限、跨平台冲突；
- 年久未验证的 `active` 不能自动归档；
- 乱序爬取结果不覆盖新核验事实；
- 先准备、后超期：`begin` 阻止外部副作用；
- 重复归档幂等、跨 Campaign 隔离、带审计的重新开放；
- SQLite V18→V19 增量迁移与无副作用的预演；
- 对现有 `Job`、`Application` 及旧 REST/MCP consumer 保持兼容。
