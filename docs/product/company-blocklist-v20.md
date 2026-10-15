# 企业黑名单 V20 · Job Harness

## 产品模型

全局 `CompanyBlockRule` 是招聘筛选偏好，不是企业性质的客观裁定。
规则字段：`id`、`pattern`、`matchMode`（exact/prefix/contains）、`category`（former_employer/hr_agency/it_services/manual）、`note`、`active`、创建与更新日期。

- `exact`：精确法定名称（实习过的公司优先）。
- `prefix`：品牌名称位于企业名开头。
- `contains`：已知品牌片段；仅针对企业名称和企业别名，绝不针对岗位标题、JD 或联系人。
- 采用 NFKC 标准化和大小写规整；不同企业仅因为有“德科”等常见字串不自动命中“外企德科”。
- 规则可以在 /companies 新建、停用、重新启用和删除；改动不删除任何现有 Job/Listing/Observation/Application。

## 必须生效的业务入口

1. 新采集数据经过 `jobs.upsertJobsBatch` 时，对规则命中企业返回单项 rejected，并提供 `company-blocked` 原因，不阻断同批其他候选。
2. 搜索 API/Web 和 MCP 的 `searchJobs` 默认隐藏相关岗位。显式 `includeBlockedCompanies=true` 才显示历史岗位；列表标注其屏蔽状态。企业目录仍可查完整历史信息。
3. 原有 `SubmissionIntent`：`prepare` 和真正开始外部副作用的 `begin` 都重新核验公司。不可在规则启用后用之前准备的任务继续投递。
4. Browser/ATS `ApplyBundleFactory.create` 以及服务器 `start/resume/beginSubmit` 路径均再次核验；已经收到外部成功证据的确认/对账流程保留，不伪造或删除历史。
5. 邮件发送在调用 `SubmissionIntent.begin` 时核验；原有申请记录可正常补录。
6. 若独立 Hark 执行器不经过 Job Harness 上述入口，应在任何招聘站点外部动作前调用认证的 `GET /api/v1/company-blacklist`，采用同一名称/别名策略，不假设独立外部自动化已获得此策略。

## 规则建议

仅按用户个人偏好排除，并不意味着这些公司每一个岗位都是外包派遣。
- 前实习公司：`北京科睿金信技术有限公司`（exact / former_employer）与品牌简称 `科睿金信`（contains / former_employer），防止招聘网站使用简称导致漏筛。
- 外企德科及同品牌主体：`外企德科`（contains / hr_agency）。
- IT 服务/外包供应商个人排除清单：`软通动力`、`中软国际`、`博彦科技`、`法本信息`、`京北方`、`文思海辉`（contains / it_services）。
- 不得加入只有 `德科`、`科技`、`人力` 等泛关键词；实际名单可随时停用和恢复。
- 这不是“所有外包公司一律自动排除”的算法；其余主体先归纳实际用工关系，再由用户决定。

## 数据库和发布

V19→V20 **只新增** `company_block_rules`，默认空规则集，不触发任何历史岗位或投递记录迁移清洗。
生产发布先一致性备份、独立副本迁移演练、CI、容器烟测，再升级 Server/Web。
业务规则通过 authenticated REST upsert 落库，重新查询匹配数量与未命中样本后进行最终验收。2026-10-15 已通过主仓库 PR #29 完整 CI，Oracle2 V20 运行健康；生产使用 9 条规则，8,080 条历史岗位中 298 条被默认隐藏，43 条 Application 保留。
