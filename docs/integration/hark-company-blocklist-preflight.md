# Hark 招聘站点动作 · 企业黑名单预检契约

Job Harness（Oracle2）是企业黑名单的唯一事实来源。Hark 或其他独立招聘网站浏览器执行器，不允许自己维护复制的一套黑名单。

## 推荐调用

`POST /api/v1/company-blacklist/check`，HTTP Bearer 认证，JSON 请求：

```json
{ "companyName": "浙江外企德科人力资源服务有限公司" }
```

阻止示例响应：

```json
{ "companyName": "浙江外企德科人力资源服务有限公司", "blocked": true, "rule": { "id": "<rule-id>", "pattern": "外企德科", "matchMode": "contains", "category": "hr_agency", "note": null, "active": true, "createdAt": "<ISO time>", "updatedAt": "<ISO time>" } }
```

未命中：`{ "companyName": "星德科包装技术(杭州)有限公司", "blocked": false, "rule": null }`。

注意：`blocked:false` 仅表示没有被黑名单命中，并非岗位符合求职目标、可任意发送或被允许绕过招聘网站规则。输入必须是实际招聘企业名称；未知、空、歧义或登录页面仅给出猎头平台品牌时先停下来核实用工主体。

## 外部动作的强制顺序

1. 读取岗位的**真实企业名称**、网站招聘主体及（可核实时）真实用工企业；存在用工主体时，对每一个相关企业名称分别预检。不要以招聘平台名称替代用工企业。
2. 检索或准备建立候选时预检；在任何真实的打招呼、附简历、提交、发送邮件**前立即再预检**。一次运行内的早期结果不能代替最终动作前的新检查。
3. 当响应 `blocked:true`，立即放弃该岗位的**外部动作**，把规则名称和时间作为跳过证据沉淀；不得向用户提供“已经投递”的虚假记录。
4. 当 API 返回非 200、认证失效、网络故障、超时、输入公司名称缺失或响应无法解析时，**fail closed**：不进行招聘站点外部动作，记录待人工核查；不得自行认为 `blocked:false`。
5. 不要把 Job Harness 的通用 Bearer Token 放在网页、浏览器内容脚本、招聘站点请求头或聊天记录里。应由 Hark 的受信执行端通过已批准的服务器侧安全通道调用内部 API。
6. 新岗位写入 Job Harness 时，仍走 `upsertJobsBatch`，其后端已有第二道拦截；正式求职投递走 SubmissionIntent / Apply 控制面，作为最后一道拦截。直接浏览器操作绕过后端提交链路时，Hark 必须自主调用上述预检。

## 与现有 REST 的关系

- `GET /api/v1/company-blacklist`：只读列出全部规则，用于管理同步或审计。
- `POST /api/v1/company-blacklist/check`：官方匹配引擎，已包含 Unicode 规范化、企业别名查询、active 状态及 exact/prefix/contains 规则；**Hark 首选**。
- `POST /api/v1/jobs/batch`：屏蔽公司不能作为新岗位进入候选。
- `GET /api/v1/jobs`：默认隐藏屏蔽企业，`includeBlockedCompanies=true` 可以审计历史。

## 范围和验收

此契约提供一套可供 Hark 接入的稳定外部判定接口；Job Harness 不能阻止不经过此接口而在招聘网站直接点击的第三方 Agent。要宣称 Hark 已完整遵循黑名单，必须在 Hark 侧获得对命中企业、非命中企业、API 失联三类浏览器执行测试的实际证据。
