# Suggested ChatGPT starter prompts

- 加载当前求职目标、岗位漏斗和待恢复的 SubmissionIntent，先告诉我今天最需要处理什么，不要直接执行外部投递。
- 继续搜集符合当前 Campaign 的前端 / 全栈 / Agent 岗位；发现后增量写入 Job Harness，并在结束时完成 DiscoveryRun。严格按 Campaign `automation` 模块执行后处理：官网/ATS 可独立准备与安全填表，招聘邮箱可独立生成邮件草稿；最终 ATS 提交与邮件发送保持独立开关。
- 继续当前 BOSS 定向沟通：先读取 `boss_runtime_status`；没有活动任务时按 Campaign `outreach.autoStartEnabled` 或当前显式指令决定是否 `boss_runtime_start`。Runtime 运行期间读取 `boss_greetings_pending`，根据每个 JD 和真实简历临时生成自然招呼；不符合硬性要求的直接 skip，合适的用 `boss_greeting_resolve` 发送；完成有界批次后按需要 `boss_runtime_pause`。
- 针对这个 Job 读取 `ai-agent-app` 的 Resume authoring context，给出你准备改哪些 selections/overrides；确认后保存、发布 Revision 并生成 PDF Artifact。
- 检查 `external_confirmed` / `persistence_pending` 的投递意图，只做本地 reconciliation；不要再次打开招聘网站重复投递。
- 查看最近的 Applications pipeline，列出超过一周没有事件的活跃投递，并让我决定是否更新阶段或补充备注。
