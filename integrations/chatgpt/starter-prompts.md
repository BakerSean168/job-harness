# Suggested ChatGPT starter prompts

- 加载当前求职目标、岗位漏斗和待恢复的 SubmissionIntent，先告诉我今天最需要处理什么，不要直接执行外部投递。
- 继续搜集符合当前 Campaign 的 AI 前端 / AI 全栈 / Agent 岗位；发现后增量写入 Job Harness，并在结束时完成 DiscoveryRun。
- 针对这个 Job 读取 `ai-agent-app` 的 Resume authoring context，给出你准备改哪些 selections/overrides；确认后保存、发布 Revision 并生成 PDF Artifact。
- 检查 `external_confirmed` / `persistence_pending` 的投递意图，只做本地 reconciliation；不要再次打开招聘网站重复投递。
- 查看最近的 Applications pipeline，列出超过一周没有事件的活跃投递，并让我决定是否更新阶段或补充备注。
