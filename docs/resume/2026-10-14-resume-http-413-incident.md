# 2026-10-14 · Resume 页面 HTTP 413 故障：复现、修复与回归

## 用户症状

Oracle2 上的 Job Harness `/resumes` 页显示「加载工作区时发生错误。」。Web SSR 每次加载时调用 `client.resume.preview({library,profile})`，并直接将完整的、可不断增长的 ResumeLibrary 再 POST 到 Server。

## 真实原因

- Web SSR `JobHarnessRestError` 在 `Object.preview` 返回 HTTP 413，Server 日志连续 `PayloadTooLargeError: request entity too large`；
- Job Harness 的 `apps/server/src/server.ts` 全局 `express.json()` 使用默认 100 KB 限制；
- 当前 ResumeLibrary v10 包含四套 V4 presentations/highlights 后，一次 `library + profile` 请求 UTF-8 编码大小约 **102,878 字节**，超过默认 102,400 字节，仅增加不到 500 字节就让整个简历工作区不可用；
- Web/API/renderer/Browser Bridge 容器和其 healthz 仍正常，健康检查无法发现某个具体业务路径的内容增长。

## 热修策略（不打开全站 JSON 大额度）

- **只针对经过 Bearer 认证的** `POST /api/v1/resume/preview`、`POST /api/v1/resume/preview/pdf` 和 `PUT /api/v1/resume/libraries/:libraryId` 使用 **512 KiB** 上限。
- 其他 REST API 保持原本的 100 KiB。
- 访问鉴权在较大 JSON parser 运行**之前**执行，防止不持有 Bearer token 的请求分配更多内存。现有默认未配置 authToken 时保留原本的本地开发语义。
- 请求体仍按各自的 Zod schema 校验，不改变权限、业务写入、ResumeLibrary / Profile 版本策略与历史 Revision。
- Server-only patch，不重建当前运行的 Web、BOSS Bridge、renderer 或站点上传扩展。

## 回归测试

- 125 KiB 的合法 JSON 预览：200；
- 125 KiB 但无认证：401；
- 600 KiB 的预览：413；
- 125 KiB 普通 Profile PUT：保持 413；
- 125 KiB 的资料库合法保存：200；
- 同一预览 PDF 路由经过解析，但隔离测试实例未配置 PDF 服务：503，而非 413。
- 测试文件 `apps/server/test/resume-api.spec.ts`，其测试库每次独立构建销毁。
- 原有端到端 API 和 MCP 集成测试同时运行；`apps/server` TypeScript 构建校验。

## 2.x 长期设计约束

该热修只是保障在线编辑路径的上限，**不是**无限增大 payload 配额。未来初次打开已保存 Profile 的 SSR **不得**把完整 ResumeLibrary/Profile 再 POST 回服务端；应由服务端凭授权读取 Profile + canonical Library 进行预览。编辑器的未保存 Draft 才使用 POST，并优先考虑 compact referenced-slice 实现，同时验证与全库解析后的一致性。页面也不应因为预览失败而使整个工作区崩溃，保存与 Revision 仍应可见。该约束由独立的 2.x 基础规范追踪。

## 生产验收要求

- 原生 `/api/v1/resume/preview` 携完整 v10 Library 返回 HTTP 200，PDF 同样；
- 用户 `/resumes?profile=ai-frontend-v2-3` 与 `/resumes?profile=ai-frontend-v4` 页面无 SSR 413；
- Server/Web/renderer/BOSS Bridge 都健康；Web/BOSS Bridge/renderer 容器 ID 保持不变；
- `resume_profiles`、`resume_libraries`、`resume_revisions`、`resume_artifacts`、`applications`、`campaigns` 不发生数据迁移与写入；
- 如失败，仅回滚 Server 镜像标签到 `job-harness:resume-v23-overlay-20261013`。
