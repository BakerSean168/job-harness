# Oracle2 前端 v2.3 · Server 渲染层部署与回滚

日期：2026-10-13

## 根因

`resumePreviewPdf` API 在 **Job Harness Server** 先使用 `renderResumePreviewHtml` 生成 HTML，再将 HTML 发送给独立 PDF renderer。仅更新 renderer 容器不足以更新 Server 中的旧版模板。

第一次正式 PDF 预览仍有旧 `项目亮点：`、长 GitHub 地址、`(持续维护)`，并溢出到 **两页**。错误候选 PDF 没有发布为 Revision，也没有修改任何生产 Resume 数据。

## 部署约束与实现

当前 Server 依赖本机定制镜像 `job-harness:boss-groq-secret-85ebcb2`，Web/Boss Bridge 同样使用该定制运行时。不能贸然用标准 Dockerfile 全组重建替换其他运营能力。

`deploy/resume-v23-server-overlay.Dockerfile` **基于当前 Server 原始定制镜像**，仅增量复制本次已合并且通过测试的 `packages/resume-renderer/src/`、`templates/` 和新的 `scripts/resume-frontend-v2-3.mts`。Server 使用 `tsx` 直接运行 workspace TS，所以独立复制源文件足够，不替换原 Server API、Browser Bridge、Web 或 Job Harness 数据。

镜像：
- 旧 Server 回滚镜像：`job-harness:boss-groq-secret-85ebcb2`
- Renderer 新镜像：`job-harness-renderer:frontend-v23-20261013`
- Server overlay：`job-harness:resume-v23-overlay-20261013`

运行时只针对 `server` 执行 `docker compose up -d --no-deps --no-build server`，**不能**使用 `--remove-orphans`。失败时将 `JOB_HARNESS_IMAGE` 恢复为旧镜像并只重建 Server。

## 部署前验证

- Job Harness PR #14 的 verify / e2e / deployment 已全部成功并合并。
- Renderer 镜像通过离线 HTML 冒烟测试：4 条项目超链接、2 个正确名称、无旧冗余标题。
- Server overlay 采用原始 Server 镜像作为底座独立构建并通过相同的离线 HTML 冒烟测试。
- 源码 renderer 测试通过 7/7，TypeScript builder 通过。

## 发布门槛

- [ ] Server / renderer 变为 healthy；Web 和 Boss Bridge 保持旧 Container/Image ID。
- [ ] 官方 Preview PDF 为 **A4 单页**，实际 PDF hyperlink annotations 包含 4 条外部项目链接。
- [ ] QA 数据库提交/重复提交防护，正式 SQLite 在线备份验证。
- [ ] 新 `ai-frontend-v2-3` Profile/Revision/PDF 独立发布，v2.2 及更早快照不变。
- [ ] 应用和 Campaign 原始数据逐行无变化，所有临时分支与测试 DB 在验收后清理。
