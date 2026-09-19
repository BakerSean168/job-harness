# Job Application Copilot

一个本地优先的求职投递助手。Phase 1 直接复用 OpenJobAutofill 的表单填写能力，并接入 Resume Harness 的三套简历 profile；同时加入岗位规则评分、简历版本推荐、附件路由、打招呼文案和本地投递记录。

当前目标不是“无人值守海投”，而是把重复、低价值的网申操作自动化，同时保留最终提交等关键动作的人工确认。

## 当前已经能做什么

- 从 Resume Harness 同步 `AI Agent / AI Frontend / AI Fullstack` 三套结构化投递资料。
- 在插件弹窗中切换简历版本；自动填表、资料面板和附件路由立即使用当前版本。
- 复用 OpenJobAutofill 的表单扫描、字段匹配、React/Vue 受控输入兼容和国内招聘页面适配。
- 按当前 profile 自动路由对应 PDF；用户点击“上传当前简历附件”后，只处理明确的“简历 / Resume / CV”文件框，证件照、身份证、作品集等附件不会自动碰。
- 对当前岗位详情页同时运行三套 0–100 本地规则评分，展示强信号和风险信号，并推荐最匹配的简历版本；只有用户确认后才切换。
- 根据当前简历方向提供对应打招呼文案，并可一键复制。
- 将“公司 / 岗位 / URL / 匹配分 / 使用简历 / 状态”记录到浏览器本地 application ledger。
- 为 BOSS 每个 profile 同时生成 `screening-only` 与 `only-greet` Tampermonkey userscript；当前默认先跑真实岗位筛查，再决定是否开启首次打招呼。

## 为什么这样组合

### OpenJobAutofill：直接作为底座

OpenJobAutofill 是 MIT，已有本地资料库、字段扫描、本地规则 + 可选 AI 字段映射、资料面板和国内招聘网站适配。与其重新写一套脆弱的表单 engine，不如保持 upstream Git 历史并在上面增加求职工作流能力。

### czc-good-job：保留平台脚本，收敛默认后端

czc-good-job 是 MIT，平台脚本已经覆盖 BOSS 的岗位列表、详情页、聊天页和打招呼流程。BOSS DOM 与平台行为高度耦合，所以通用扩展不复制这部分逻辑。

默认路线改为：

```text
czc-good-job userscript
  -> Oracle2 tailnet-only screening-first backend
  -> Job Application Copilot 三套 profile + 同一套 JD scorer
```

这样 Windows 浏览器不需要安装 Python/Ollama；原 czc-good-job Python 后端仍保留为可选的完整 companion，只有明确需要多轮聊天能力时再启用。

### Autograph：只采用 Adapter 架构思想

Autograph 的“generic engine + per-ATS adapter”设计很适合未来的 Workday / Greenhouse / Lever / Moka / 北森适配层，但它是 GPL-3.0。当前 MIT-derived 扩展不复制其源码，只参考公开架构思想。

第三方项目边界见 [NOTICE.md](./NOTICE.md)。

## 目录

```text
job-application-copilot/
├── manifest.json
├── src/
│   ├── background.js             # profile bundle / PDF fetch / score / ledger
│   ├── content.js                # form engine / file input routing / page capture
│   ├── job-score.js              # local 0-100 rule scorer
│   ├── popup.html/js/css         # resume switch / autofill / attachment / score / ledger
│   └── options.*                 # local profile editor / optional AI field mapping
├── scripts/
│   ├── boss-companion-server.mjs       # Oracle2 screening-first BOSS backend
│   ├── generate-czc-good-job-config.mjs # config + Tampermonkey userscript generator
│   ├── publish-private-channel.mjs      # personal ZIP / PDFs / userscripts
│   └── private-channel-server.mjs
├── integrations/
│   └── czc-good-job/
├── deploy/systemd/
│   └── job-application-copilot-boss.service
├── tests/
│   ├── job-score.test.mjs
│   ├── resume-upload.e2e.mjs
│   └── fixtures/resume-upload.html
└── data/
    └── profile-bundle.json       # local-only, git ignored
```

## 与 Resume Harness 同步

Resume Harness 位于：

```text
/home/ubuntu/projects/resume
```

修改简历后执行：

```bash
cd /home/ubuntu/projects/resume
pnpm copilot:sync
```

这会从三份正式 profile 生成 OpenJobAutofill Profile V2、三份原版 OpenJobAutofill 可导入 JSON 和 `profile-bundle.json`，并把 bundle 同步到本扩展。

如果需要同时更新个人扩展 ZIP、三份 PDF 和 BOSS userscript：

```bash
cd /home/ubuntu/projects/job-application-copilot
pnpm private:publish
```

## Chrome / Edge 使用流程

1. 选择 `AI Agent / AI Frontend / AI Fullstack`。
2. 在岗位详情页点击 **评估当前岗位**，查看三套简历的比较与推荐。
3. 在网申页点击 **开始填写当前页面**。
4. 如果页面要求上传简历，点击 **上传当前简历附件**，确认页面显示的 PDF 文件名正确。
5. 人工检查绿色已填写和橙色待处理字段，尤其是敏感信息、开放题和特殊下拉框。
6. 手动提交。
7. 点击 **记录为已投递**。

自动填表不会自动点击最终 Submit。

## 私有下载 / 同步通道

Oracle2 当前使用：

```text
private channel local:   http://127.0.0.1:18789
private channel tailnet: https://oracle.taile92a8e.ts.net:10443
```

个人 ZIP 内包含：

- 扩展代码；
- `profile-bundle.json`；
- 三套当前正式 PDF，按 `data/resumes/<profileId>.pdf` 存放。

扩展读取简历附件时优先从 Oracle2 私有通道拉取最新 PDF 并校验 SHA-256；Oracle2 不可达时回退到个人 ZIP 内置 PDF。

## BOSS Browser Provider

BOSS 真实测试的主路径已经从 Tampermonkey 提升为可替换的 Playwright Browser Provider：

```text
Boss screening runner
  -> BrowserProvider
     -> SteelProvider (Oracle2 self-host, current primary)
     -> LocalCdpProvider (Windows dedicated Chrome fallback)
  -> BossAdapter
  -> job-score.js
  -> .local/boss-browser/runs/*.json
```

Oracle2 自建 Steel：

```text
local API/CDP: http://127.0.0.1:3000
Tailnet Live View: https://oracle.taile92a8e.ts.net:10445/ui
Docker: jac-steel
```

Steel self-host 不依赖 Cloud Profile API。本项目通过 `/v1/sessions/:id/context` 导出 cookies / localStorage / sessionStorage / IndexedDB，并在下一 Session 创建时通过 `sessionContext` 注入；针对当前 self-host 版本 domain/origin key 不一致的问题，`SteelProvider` 会做兼容归一化。跨两个全新 Chromium Session 的 Cookie、localStorage、sessionStorage 恢复已有 smoke test。

登录/安全验证采用人工接管：

```bash
pnpm boss:browser:login
```

该命令保持 Playwright 与 Steel Session 连接，等待用户在 Live View 完成 BOSS 登录或安全验证；成功后保存本地 Context 并释放 Session。真实筛查：

```bash
pnpm boss:browser:screen -- --provider steel --profile ai-agent-app --keyword "AI Agent" --max 20
```

筛查 runner 只搜索、读取岗位/JD并本地评分，不包含创建聊天、打招呼、发送简历或最终投递动作。

Windows 本机备用路径由 `scripts/windows-start-boss-chrome.ps1` 启动独立 `%LOCALAPPDATA%\JobApplicationCopilot\ChromeProfile` 和 `127.0.0.1:9222` CDP；不会连接日常 Chrome 默认 Profile。

## BOSS screening-first companion

Oracle2 常驻：

```text
local:   http://127.0.0.1:18788
tailnet: https://oracle.taile92a8e.ts.net:10444
mode:    screening-first
```

三套 profile 的 API 基址：

```text
/p/ai-agent-app
/p/ai-frontend
/p/ai-fullstack
```

每个基址提供 `client-config`、`tags`、`get-introduce`、`get-job-score` 和 `log-action`。`reply / is-need-resume / is-need-works` 在默认服务中明确返回 `only_greet_mode`，避免误启用自动聊天。

生成 userscript：

```bash
pnpm czc:profiles
```

产物：每个 profile 都有 `boss-screening.user.js` 与 `boss-copilot.user.js`。筛查版固定 `JAC_SCREENING_ONLY=true`、阈值 42，只读取岗位/JD、评分和记录日志，硬阻断创建聊天；only-greet 版保留阈值 58。两者都内置 `JAC_HARD_ONLY_GREET=true`，不会进入多轮自动聊天或自动发送简历。`pnpm private:publish` 会把 6 份脚本同时发布到私有下载页。

详细说明见 [integrations/czc-good-job/README.md](./integrations/czc-good-job/README.md)。

## 验证

基础检查：

```bash
pnpm check
```

浏览器级本地回归：

```bash
pnpm test:e2e
```

E2E 使用真实 MV3 扩展 + Chromium，依次验证三套 profile：姓名 / 手机号 / 邮箱会匹配当前 profile，简历文件框会收到正确 PDF，证件照文件框保持为空。

Moka 真实公开申请页 smoke test：

```bash
pnpm test:moka-live
```

这个测试使用全假 profile 和假 PDF，在进入公开职位申请页后拦截所有 `POST / PUT / PATCH / DELETE` 请求，再验证 Moka adapter、姓名/手机号/邮箱自动填写，以及“上传简历”和普通“上传附件”的区分。默认 URL 可以通过 `JAC_MOKA_JOB_URL` 覆盖，因此公开职位失效时可以换成新的 Moka 职位详情页；测试不会点击最终提交。

## 隐私边界

- Resume Harness 中没有的身份证号、出生日期、家庭、地址、薪资等字段不会被 exporter 猜测或生成。
- `profile-bundle.json`、`.local/`、个人 PDF 和 companion 日志均不进入 Git。
- AI 字段映射只发送字段目录/页面结构，实际简历值仍在本机匹配和填写。
- application ledger 只保存在 `chrome.storage.local`。
- Oracle2 私有下载和 BOSS companion 都通过 Tailscale Serve 暴露为 tailnet-only，不使用公网 Funnel。
- BOSS 当前默认先运行 screening-only：真实读取岗位和 JD、评分、记录 session；不会创建聊天。筛查规则稳定后才切换 only-greet。

## 下一阶段

- 将通用 page capture 正式拆成 `ATSAdapter` contract。
- 对 Moka、北森、牛客、智联、飞书招聘做真实网申页面回归；再补 Workday / Greenhouse / Lever / Ashby。
- BOSS 增加“只评分 / 人工确认打招呼 / 自动打招呼”三级模式，而不是直接扩大无人值守范围。
- application ledger 增加 `saved → applied → written-test → interview → offer/rejected` 状态流转、JD hash、notes 与 follow-up date。
- 为重复开放题建立本地 answer memory，敏感字段继续人工确认。

## License

本仓库直接基于 MIT-licensed OpenJobAutofill 演进，保留其 `LICENSE` 与 upstream Git 历史。第三方项目的具体使用边界见 [NOTICE.md](./NOTICE.md)。
