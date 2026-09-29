# Suggested ChatGPT starter prompts

- 加载当前求职目标、岗位漏斗和待恢复的 SubmissionIntent，先告诉我今天最需要处理什么，不要直接执行外部投递。
- 继续搜集符合当前 Campaign 的前端 / 全栈 / Agent 岗位；发现后增量写入 Job Harness，并在结束时完成 DiscoveryRun。严格按 Campaign `automation` 模块执行后处理：官网/ATS 可独立准备与安全填表，招聘邮箱可独立生成邮件草稿；最终 ATS 提交与邮件发送保持独立开关。
- 继续当前 BOSS 定向沟通：先读取 `boss_runtime_status`，并在当前 ChatGPT 会话负责生成招呼时先调用 `boss_greeting_resolver_ready`；没有活动任务时按 Campaign `outreach.autoStartEnabled` 或当前显式指令决定是否 `boss_runtime_start`。Runtime 运行期间读取 `boss_greetings_pending`，用 `boss_greeting_claim` 获取交互式单写者 lease，根据被 claim 的 JD 和真实简历生成自然招呼；未及时 claim 的请求在短暂优先窗口后由 Groq/Qwen 后台 resolver 接管，最终仍有 deterministic fallback；完成有界批次后按需要 `boss_runtime_pause`。
- 用成熟上游 Runtime 收集智联岗位：先 `career_discovery_begin`，再读 `recruitment_collection_runtime_status(site=zhilian)`；已登录时按 Campaign 启动 `recruitment_collection_runtime_start`，完成有界采集后 stop + sync 到该 DiscoveryRun。若要求登录，停止并让我在打开的 Camoufox 窗口中登录，不要退回逐 DOM 重写。
- 针对这个 Job 读取 `ai-agent-app` 的 Resume authoring context，给出你准备改哪些 selections/overrides；确认后保存、发布 Revision 并生成 PDF Artifact。
- 检查 `external_confirmed` / `persistence_pending` 的投递意图，只做本地 reconciliation；不要再次打开招聘网站重复投递。
- 查看最近的 Applications pipeline，列出超过一周没有事件的活跃投递，并让我决定是否更新阶段或补充备注。
