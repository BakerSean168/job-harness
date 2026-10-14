# 中文技术岗简历表达规范调研（前端 / 全栈 / AI Agent 应用开发，2026–2027 校招 & 低年限社招）

调研日期：2026-10-14 · 范围：国内互联网大厂（字节、腾讯、阿里、美团等）的前端、全栈、AI Agent 应用开发岗位
方法：先做 web_search，再用 web_fetch 打开原页面核实关键结论。下面引用的每一条结论都在原页面里看过；只看过搜索摘要的来源，会标明「未核实」。

---

## 0. 先说明证据强度（重要）

- **没有找到、也没有打开任何一篇字节、腾讯、阿里、美团官方 HR 发的「简历写法规范」。** 本文的中文来源包括：知名技术社区作者（JavaGuide、程序员鱼皮）、牛客上自称面试官或 HRBP 的帖子、V2EX 面试官跟帖、简历平台（超级简历、不繁简历、面灵 AI）的指南。英文来源是 Laszlo Bock（前 Google 人力 SVP）的原文、Tech Interview Handbook（前 Meta Staff Engineer 所写）和 GreatFrontEnd。
- 文中的「**共识**」，指 3 个及以上互相独立的来源方向一致；「**个别观点**」指只有 1 到 2 个来源，或者来源之间有冲突。
- 简历平台和 AI 简历工具的博客（面灵 AI、不繁简历、超级简历、mybestresume）有带货动机。本文只采用其中可核对的写作原则，不采用它们给出的「通过率提升 X 倍」这类统计数字。

### 来源表（编号供全文引用）

| 编号 | 来源 | 日期 | 类型 |
|---|---|---|---|
| S1 | JavaGuide《程序员简历编写指南》 https://javaguide.cn/interview-preparation/resume-guide.html | 页面「最近更新 2026-05-17」 | 技术社区头部作者（看过 6000+ 份简历） |
| S2 | JavaGuide《校招没有实习经历怎么办？实习经历怎么写？》 https://javaguide.cn/interview-preparation/internship-experience.html | 最近更新 2026-05-19 | 同上 |
| S3 | Tech Interview Handbook《Writing your software engineer resume》 https://www.techinterviewhandbook.org/resume/ | Last updated 2026-08-07 | 前 Meta Staff Engineer / FAANG 面试官 |
| S4 | GreatFrontEnd《前端工程师简历指南》 https://www.greatfrontend.com/zh-CN/front-end-interview-playbook/resume | 页面无日期（2026-10-14 访问） | 同一作者 Yangshun Tay，前端专项 |
| S5 | Laszlo Bock《My Personal Formula for a Winning Resume》 https://www.linkedin.com/pulse/20140929001534-24454816-my-personal-formula-for-a-better-resume | 2014-09-29 | Google XYZ 公式原文 |
| S6 | 面灵AI《程序员简历怎么写才能过AI筛选？（2026）》 https://www.mianlingai.com/blog/developer-resume-writing-guide-2026/ | 2026-06-07 | AI 求职工具博客（作者自称做过招聘官） |
| S7 | V2EX《求前端大佬们帮忙优化下简历》 https://www.v2ex.com/t/1027252 | 2024-03-26 | 应届前端简历 + 多名面试官跟帖 |
| S8 | 编程导航《2026 年｜AI 全栈时代，前端简历别再只写前端技术了》 https://www.codefather.cn/post/2081626221422100482 | 2026-07-27 | 内推人 / 评审视角（转载自 Moment） |
| S9 | 程序员鱼皮《AI 时代，满分的程序员简历是怎么样的？》 https://ai.codefather.cn/post/2041795595743555585 | 2026-04-08 | 技术社区头部作者（改过几千份简历） |
| S10 | 牛客《校招/实习的简历到底要怎么写?》 https://www.nowcoder.com/discuss/779072845463724032 | 2025-07-27 | 自称 5 年面试经验、看过上千份简历 |
| S11 | 牛客《简历上要不要写主修课程、学生工作、自我评价》 https://www.nowcoder.com/discuss/720916904340156416 | 2025-03-20 | 求职者经验帖 |
| S12 | 不繁简历《自我评价还要不要写》 https://bufancv.com/blog/jianli-ziwo-pingjia-xie-bu-xie | 2026-09-01 | 简历平台 |
| S13 | 不繁简历《「精通/熟练/了解」是简历上最不可信的三个词》 https://bufancv.com/blog/jianli-jineng-lan-jingtong-shulian | 2026-09-05 | 简历平台 |
| S14 | 不繁简历《「负责 XX」改成果句的 6 种句式》 https://bufancv.com/blog/jianli-fuze-gai-chengguo-jushi | 2026-09-01 | 简历平台 |
| S15 | 不繁简历《工作经历倒序还是正序：起止时间和“至今”怎么写》 https://bufancv.com/blog/jianli-gongzuo-jingli-daoxu-haishi-zhengxu | 2026-09-27 | 简历平台 |
| S16 | 超级简历《简历中「项目经历」怎么写最好？》 https://www.wondercv.com/blog/0vwqesr6.html | 2025-04-11 | 简历平台（作者为前猎头 / HR，文中引用一份百人 HR 调研） |
| S17 | 《中文文案排版指北》 https://github.com/sparanoid/chinese-copywriting-guidelines | 长期维护（15.7k star） | 中英混排的事实标准 |
| S18 | My Best Resume《How to Show Software Engineering Impact Without Inventing Metrics》 https://mybestresume.ai/blog/software-engineer-resume-impact-without-metrics | 2026-08-02 | 英文简历平台 |

只看过搜索摘要、未打开原文（可作线索，不作依据）：掘金《AI 编程工具写进简历前，先准备好这套技术面试工作流》 https://juejin.cn/post/7659963099462500403 （2026-07-08，页面需要 JS，抓取失败）；华为云社区《2026 校招技术简历上这 3 个词》 https://bbs.huaweicloud.com/blogs/478239 （2026-05-27）。

---

## 1. 专业技能

### 1.1 规则

1. **【共识｜must】应届生和低年限求职者不写「精通」。** 写了就会被往深里挖，答不上来反而扣分。
   - S7：多名面试官跟帖。「写精通的我直接让 HR 过滤掉」；「看到有精通的话都会往里面深度问，答上来很加分，答不上来扣很多印象分」；「应届生简历技能全写精通……只会觉得有点 der」。楼里只有 1 楼和 3 楼主张「全写精通」，被大量反驳。
   - S6：「精通：能讲原理、能应付追问到第三层｜几乎不应该写，写了就是发信号弹」。
   - S13、S1 也有同类说法。
2. **【共识｜must】技能栏里的每个词，都等于主动给面试官出一道题。只写追问到第二层还答得上来的东西。**
   - S1：「简历上注明你会的东西才会被问到……技能熟练度在很大程度上也决定了面试官提问的深度」。
   - S6：「在写『熟悉某技术』之前，先问自己能不能在面试现场被追问到第二层」。
   - S13：「一个词经不起一句追问，它在纸上就是负债」。
3. **【较多来源｜should】等级词可以保留，但只保留两档（「熟悉 / 了解」或「熟练 / 了解」），并且要和项目证据对应上。**
   各来源对每档含义的理解基本一致（S6 表格、S13）：

   | 等级词 | 面试官默认的含义 | 预期追问深度 |
   |---|---|---|
   | 精通 | 讲得清原理、能做选型负责人、解决过疑难问题 | 追到第三层以上；应届生慎用 |
   | 熟悉 / 熟练 / 掌握 | 项目里实际用过，讲得清原理和选型理由 | 当作重点考察 |
   | 了解 | 读过文档或做过 demo | 一般不深挖 |

   **「了解」要不要写，来源之间有分歧：**
   - S1（JavaGuide）：JD 要求而你不会的技能，「花几天时间学习一下……写上自己了解这个技能」。
   - 智灵简历（面灵 AI 旗下，搜索摘要，未核实）：「『了解』不建议写」。
   - S13：干脆把分级词全部换成证据。

   → **结论：** 「了解」只用来覆盖 JD 关键词，而且数量要少。核心技能用证据写法（见下一条）。
4. **【多来源｜should】把形容词换成「锚」：技能后面跟上用在哪、量级多大、产出物是什么、有什么第三方凭据。**
   - S13 给了四种锚：任务场景、量级、可点开的产出物、第三方凭据。
   - S10 的模板里，技能栏单列「开源项目」「LLM」两项。
   - 锦上添花：S3 建议在技能后面附上量化描述（如代码行数）。
   - **边界**：技能栏只写「用在哪」，不写结果和增长率；结果放到经历栏（S13）。
5. **【共识｜must】技能按技术领域分组，不要整段堆砌；每组都要和 JD 对齐。**
   - S6：推荐「横向按模块分类」，例如「后端开发：熟悉 Java（…）、了解 Go（…）」，并批评「17 个技术名词……等于把每一个都标成『可以问我』」。
   - S4：至少分「语言 / 技术」两类；同一类别**列 1 到 2 个**就够（React、Vue、Angular 全列出来属于冗余）；优先写 JD 里出现的、影响架构的技术，**省略 Lodash 这种可替换的工具库**。
   - S3：格式为「[Skill summary]: [skills separated by |]」，JD 关键词也要在经历栏里出现。
   - S1：技能清单要按岗位要求动态调整。
6. **【多来源｜should】技能词和项目证据一一对应。** 技能栏里出现的核心词，至少要在一个项目或实习条目中出现，否则面试官会认为只是「听说过」。
   - S13 称之为「匹配用的索引」。
   - S2：在技能里写了、项目里没涉及的知识点，「也很大概率会被问到」。
   - 华为云社区（搜索摘要，未核实）：「把它们揉进经历里……技术栈是『用过的』而不是『听说过的』」。
7. **【共识｜avoid】技能栏不写软技能**（沟通、学习能力强、团队合作）。软技能放到经历里，用事实证明（S10、S12、S13；Bock 原文 S5 的「skill-based resume」示例也要求软技能配证据）。
8. **【个别观点｜avoid（有争议）】Office、计算机二级、CET-4 之类的低价值项。**
   - S10（牛客面试官）认为「计算机二级证书、软考证书、Excel/Office、英语四级……完全不能写进去」。
   - 超级简历的旧文则建议写 CET-6。
   - → 对技术岗而言，Office、计算机二级应删除；英语证书最多一行（如「CET-6」），可以放进教育栏。

### 1.2 2025–2026 年的新趋势

- **【多来源｜should】AI 相关技能单独成组。**
  - S9（鱼皮）：「如果今年你的简历上还没有 AI 相关的技能，那才可怕」。他建议 AI 技能分四层：AI 开发框架（RAG / MCP / Agent）、AI 应用实战、AI 编程工具、AI 编程模式。
  - S8：初筛时「纯前端技术栈写得再工整，也很难……单独把人托起来」。
  - S10 模板里也有「LLM」一栏。
- **【多来源｜should】AI 编程工具（Cursor / Claude Code / Copilot）可以写，但不能只列工具名，要写清「怎么用 + 人怎么把关」。**
  - S9：「不仅要会用这些 AI 工具，还要能开发工具、MCP Server 和 Agent Skills 来扩展这些工具的能力」。
  - 掘金 2026-07-08（搜索摘要，未核实）：建议写成「AI-assisted development workflow: used Cursor / Claude Code… with human review through diff, tests」。
  - JavaGuide 的 AI 编程面试题（博客园 2026-02-25，搜索摘要，未核实）：面试会问「用过什么 AI 编程工具」，回答要包含「AI 生成代码之后必须人工 Review」。
  - → **推荐句式：** 「AI 编程：日常使用 Claude Code / Cursor 做需求拆解、测试生成与重构，产出经 diff 评审与测试验证；为团队工作流编写过 N 个 Agent Skill / MCP Server」（N 必须是真实数字）。
- **【个别观点】S9 建议写上「Vibe Coding / SDD / Harness Engineering」这类方法论词，还认为写「项目 90% 以上代码由 AI 生成」是加分项。** 这只是一位作者的主张，没有面试官来源佐证。慎用：写了就要能讲清楚自己的把控点（需求、方案、评审、测试）。
- **【个别观点但论证充分｜should，适用于 Agent 岗】写 Agent 时不要停在「调模型、接工具」，要体现系统化能力。** S8 指出同质化严重的写法有：「JWT、双 token、RBAC、请求拦截器、SSE 或 WebSocket 流式、分片上传、虚拟列表……十条里七八条读起来像同一篇教程拆出来的」。评审想看到的是运行时 / 预算、显式状态机、评测回归闸门、可观测（trace / 成本）、HITL 审批这些内容。

### 1.3 句式模板

```
【分组 + 等级 + 锚】
前端：熟悉 React 18 / TypeScript（Hooks、并发渲染；在 X 项目中实现虚拟列表与 SSR）；了解 Vue 3
工程化：熟悉 Vite、pnpm monorepo、Vitest、Playwright（为 X 项目搭建 CI 自动化测试）
后端 / 全栈：熟悉 Node.js（NestJS）、PostgreSQL、Redis；了解 Docker 部署
AI 应用：熟悉 LLM 应用开发（RAG、Function Calling / MCP、流式输出）；在 X 项目实现 Agent 状态机与评测集
AI 编程：日常使用 Claude Code / Cursor 做重构与测试生成，产出经 diff 评审与测试验证

【不分级（S13 推荐）】
React / TypeScript：独立完成 2 个线上项目的前端（链接见项目栏）
```

### 1.4 好坏对比

| ❌ 坏 | ✅ 好 | 理由 |
|---|---|---|
| 精通 HTML5、CSS3、JavaScript、Vue、React、Angular、jQuery、Node.js、Webpack | 前端：熟悉 React / TypeScript（X 项目主力）；了解 Vue 3 ｜ 工程化：Vite、Vitest | 应届生写「精通」会被深挖；同类框架全列是冗余（S4）；平铺 17 个词「等于每一个都标成可以问我」（S6） |
| 熟悉 AI 大模型，会使用 ChatGPT、Cursor | AI 应用：熟悉 RAG、MCP 工具调用、SSE 流式；在 X 项目实现带人工确认的 Agent 执行流 | 只写工具名，没有区分度（S8、S9） |
| 学习能力强，具备良好的团队协作能力 | （删除；改写到经历里，比如「与后端约定 OpenAPI 契约并编写 Mock」） | 软技能不放技能栏（S10、S13） |
| 熟悉 nextjs、ts、vue3、h5 | 熟悉 Next.js、TypeScript、Vue 3、HTML5 | 大小写和缩写不规范，面试官会在意（S1、S17） |

---

## 2. 项目经历

### 2.1 结构（共识）

S1、S6、S10、S14、S16 以及《全民简历》前端范文等来源给出的结构基本一致：

```
项目名称｜个人角色｜起止时间（YYYY.MM – YYYY.MM）｜线上地址 / GitHub
项目简介：1–2 行。说明是什么、给谁用、解决什么问题，以及规模或状态（已上线 / 用户量 / Star）
技术栈：React + TypeScript + NestJS + PostgreSQL（只写名词，不解释技术是做什么的）
亮点 / 职责：3–5 条。每条都是「动词 + 场景 / 问题 + 技术方案 + 结果」
```

1. **【共识｜must】项目简介不超过 2 行，重点写「你做了什么」，不写「项目是什么」。**
   - S1：「项目介绍尽量压缩在两行之内」；「重点是突出自己做了什么，而不是介绍项目是做什么的」。
   - S7 面试官：「你不是来推销产品的，是来展示你能力来面试的」。
2. **【共识｜must】技术栈行只列名词。** S1：「技术架构直接写技术名词就行，不要再介绍技术是干嘛的了」。S4：技术栈利于 ATS 排名。
3. **【多来源｜must】写清个人角色和边界，尤其是团队项目。**
   - S14 的句式五：要写出「哪部分不是我做的」。
   - S18：区分你的决策和团队结果。
   - S3 的 Google XYZ 实践里也有「As a team member, contributed to…」的写法（原文 S5）。
4. **【多来源｜should】附上可访问的线上地址或 GitHub。**
   - S9：「上线项目是最能增加真实性的方法，没有之一」。
   - S3、S4：项目名链接到 GitHub；README 要配截图。
   - S6：空仓库「比不放 GitHub 更减分」。
5. **【共识｜should】选 2–3 个项目，宁精勿多；项目之间的侧重点要互补。**
   - S1：「精选 2~3 即可」。
   - S3：「at least 2 projects」。
   - S9：「重点写 1 到 3 个项目」，组合是「AI 应用开发项目 + AI 编程项目 + 技术轮子类项目」（这个组合本身属于个别观点）。
6. **【共识｜must】避免每条都围绕同一个技术点；避免全是增删改查（CRUD）或流水账。**
   - S1 第 3、5 条：「尽量减少纯业务的个人职责介绍」「避免个人职责介绍都是围绕一个技术点来写」。
   - S8：同质化工程项不能成为唯一的差异点。

### 2.2 主流句式

- **Google XYZ（S5 原文）：** 「Accomplished [X] as measured by [Y] by doing [Z]」。即以主动动词开头、给出量化结果、给出对比基线、说明怎么做到的。中文化后的语序通常是「通过 Z，实现 X，Y」或「动词 + Z → X（Y）」。
- **STAR：** S1、牛客 S10 系列、超级简历都推荐它。但在简历条目里，S/T 要压缩成半句，A/R 写具体（国家大学生就业服务平台文章的提法是「情境（S）和任务（T）可以简略说明，但行动（A）和结果（R）一定要具体明确」，见搜索摘要 https://www.ncss.cn/ncss/zd/jl/202509/20250919/2293429359.html ，未打开原文）。
- **中文技术简历最常用的是「技术 + 场景 + 效果」（S1 第 6 条），即「动词 + 技术方案 + 问题 / 场景 + 结果」。** S6 的公式是「强动词 + 技术栈细节 + 解决的具体问题 + 量化结果」。
- **S3（TIH）：** 「[Accomplishment summary]: [Action] that resulted in [quantifiable outcome]」。

**句式模板**

```
T1（XYZ）：通过 <技术方案 Z>，<动词> <对象>，使 <指标> 从 <A> 降至 / 提升到 <B>（<测量口径>）
T2（问题驱动）：针对 <具体问题 / 约束>，<设计 / 实现> <方案>，<可观察的结果>
T3（从无到有）：<搭建 / 设计> <之前不存在的东西>，<现在被谁用 / 覆盖多少场景>
T4（无数字）：<动词> <系统 / 模块>，<具体机制>，<避免了什么失败 / 让什么成为可能>
T5（团队边界）：作为 <角色>，<你的动作>；<哪部分由他人负责>
```

### 2.3 强动词表与弱动词问题

- **【共识｜avoid】不要用光秃秃的「负责 / 参与 / 协助」开头，后面又不跟具体内容。**
  - S10：「大量使用 参与 / 协助 这些非常弱的动词，而且最后的成果完全没有量化，这几乎是不能接受的」。
  - S9：「面试官……最怕看到的就是『参与了 xx 项目』，然后就没了」。
  - S14：「『负责』描述的是分工，不是产出」，并给出「换人测试」：遮住公司名，这句话对谁都成立的话，就等于没写。
  - **细节：** JavaGuide 自己的示例里也有「负责订单模块核心流程开发，实现……」这样的写法（S2）。所以问题不在「负责」这个词本身，而在它后面有没有具体对象、方案和结果。规则应该写成「负责 + 空泛对象」避免使用，而不是全文禁止这个词。
- **强动词（按意图分组，来源 S9、S14、S6、牛客 / 伯乐青狼整理，经综合）：**
  - 从无到有：设计、搭建、实现、开发、封装、构建、落地、上线
  - 改进：重构、优化、迁移、升级、收敛、替换、统一、降低、提升、压缩
  - 排障 / 保障：定位、排查、修复、根除、加固、监控、回滚
  - 推动 / 协作：主导、推动、牵头、对接、制定（规范）、评审、带教
  - 质量：覆盖（测试）、校验、评测、度量
  - **慎用：** 「主导」「从 0 到 1」「独立负责」「架构」。这些词会把追问引到你不一定接得住的地方（牛客 2026-09 帖《只因为简历多写了一句话，面试直接挂了》，搜索摘要，未核实；S14 也说「『从 0 到 1』这四个字本身别写进简历」）。

### 2.4 没有量化数据怎么写（不编造）

- **【共识｜must】不编造数字。**
  - S9：「不要编造这些数据，最好是你真实测试得来的……比如压力测试，用个 JMeter 工具点几下」。
  - S18：「A number is optional. A verified change is not」。
  - S14 的改后示例里也标注了「数字全是编的示例」。
  - 一份 2026-03 的 AI 改简历提示词（腾讯新闻）甚至把「不要自己编数字」写成了硬规则。
- **【多来源｜should】没有数字时，可以换用以下几类证据（S18、S14、S13）：**
  1. 可复现的自测数字（Lighthouse、bundle 体积、JMeter / k6 压测、评测集准确率），并注明口径；
  2. 规模和范围（N 个页面 / 组件 / 接口、N 个工具、N 条评测用例）；
  3. 消除的失败模式（「重复提交」「流式中断后无法恢复」）；
  4. 留存物（文档、Skill 包、npm 包、README、设计文档）；
  5. 状态（已上线 / 已开源 / 内测中 / 暂停），不隐瞒。
- **【前端专项｜should】可以量化的维度（S4）：** 性能（加载时间、Lighthouse、包体积）、测试（数量、覆盖率）、SEO、可访问性（a11y 问题数、WCAG 等级）、工具链现代化（jQuery → React、引入 TypeScript）。

### 2.5 条目数量与长度

- **【多来源｜should】每个项目写 3–5 条，每条 1–2 行。**
  - S14：一段经历「四五条就到顶了」。
  - S1 的上限是 6–8 条（JavaGuide 允许校招 2 页，所以偏多，属于上限异常值）。
  - 一页简历按 3–5 条更现实。
  - 每条 1–2 行：Rishishah97/resume-builder 转引 r/EngineeringResumes 的规则「1-2 lines long」（GitHub，搜索摘要，未核实）；S1 也要求「精简语言」。
- **【个别观点｜should】一份简历里，「救火型」条目最多一两条，「体量打底」条目放一条（S14）。**

### 2.6 好坏对比

| ❌ 坏 | ✅ 好 |
|---|---|
| 负责前端页面开发，参与需求讨论，确保前后端无缝对接 | 基于 React 18 + Zustand 重构首页长列表，采用虚拟列表，FCP 从 3.2s 降至 1.1s（S6 示例，数字为来源构造） |
| 使用 Redis 做缓存，提高了系统性能 | 针对会话列表首屏慢，引入 Redis 缓存最近会话并在写入时失效，本地压测 P95 从 X ms 降至 Y ms（k6，100 并发） |
| 负责 Agent 开发，接入大模型和工具调用 | 将 Agent 循环改为显式状态机（推理 / 调工具 / 等待确认 / 恢复），高风险工具执行前进入人工审批；为 30 条用例建立回归评测，Prompt 改动在 CI 中自动对比基线（数字需为真实值） |
| 对页面进行性能优化（图表的渲染速度） | 将 ECharts 大数据量折线图改为按需采样 + Canvas 渲染，1 万点数据拖动不卡顿（自测，Chrome Performance 面板无长任务） |
| 性能提升 300%（无口径） | 打包体积 2.1 MB → 860 KB（gzip 前，vite build 输出），通过路由级代码分割与移除 moment |

**面试官 / HR / ATS 视角的理由：**
- 面试官「对着简历问」，每条都是追问入口（S1、S6、S10）。
- HR 和 AI 预筛按 JD 关键词以及「问题—行动—结果」结构来判断（S6；S3 说明 ATS 按关键词频率和位置评估）。
- 编造的数字「面试官觉得假的话可能连面试机会都没有」（S9）。

---

## 3. 实习 / 工作经历（和项目经历的差异）

### 3.1 规则

1. **【共识｜must】按时间倒序排列；抬头一行写清公司、部门、岗位、起止时间。**
   - S1：「工作经历建议采用时间倒序」。
   - S3：「[Company], [Location] | [Job Title] | [MM/YYYY]」。
   - S15：倒序是默认写法，因为读者最先想知道「你现在是什么水平」。
2. **【多来源｜should】开头一行交代产品或团队、业务规模，然后再写条目。**
   - S9：「用一行话写清楚你负责的产品和数据规模……日活多少、PV 多少」。
   - S4：要写出「规模、复杂性和影响」。
   - S16：先用一句话描述职能和成绩。
3. **【多来源｜must】实习里做的项目，直接写在实习条目下面，不要在「项目经历」里再写一遍。** S16：「超过 50% 的 HR 不喜欢看到写一段【工作经历】，又写一段【项目经历】的简历」（百人 HR 调研，样本出处未公开）。S2 也允许两种放法，但同一份内容只写一处。
4. **【共识｜must】工作经历要写业务语境和协作，比项目经历更强调对业务的贡献、上线、稳定性。**
   - S9 给了三个维度：架构设计 / 决策、新技术落地产生业务价值、监控运维与问题排查。
   - S4：要突出「对过去或当前雇主业务目标的贡献」。
   - S2 的实习示例覆盖了：功能链路、组件封装、性能优化、线上死锁排查、「独立负责 7 个功能需求与 3 个线上问题修复」这种体量打底条目。
5. **【多来源｜should】岗位名称可以向目标岗位靠拢，前提是真实。** S4 举例：官方头衔是「软件工程师」、实际做的大多是前端时，可以写「软件工程师（前端）」，以提高 ATS 相关性。
6. **【共识｜avoid】不写「个人收获」大段，不写职责说明书式的句子。**
   - S7 面试官点评原帖：「『负责开发多个前端项目』『与后端团队紧密合作……确保前后端无缝对接』这种 b 话是个前端都会这么干」。
   - S1：「个人收获」可选，而且通常不必写。
7. **【多来源｜should】涉密或不便公开的数据，用相对值、区间或脱敏后的文档替代（S9、S14）。**

### 3.2 句式模板

```
XX 科技｜前端开发实习生｜2025.07 – 2025.12
所在团队负责 <产品>（<规模：DAU / 内部用户数 / 业务线>）
- <体量打底> 独立交付 N 个需求、修复 M 个线上问题，代码均通过 Code Review
- <问题驱动> 排查 <线上问题现象>，定位到 <根因>，通过 <方案> 根除
- <改进> 将 <环节> 从 <旧做法> 改为 <新做法>，<前后变化>
- <协作边界> 作为前端对接人与 <后端 / 算法> 约定 <接口 / 协议>；<模型侧> 由 <他人> 负责
```

### 3.3 好坏对比

| ❌ 坏 | ✅ 好 |
|---|---|
| 负责项目的持续迭代开发与维护；个人收获：深入了解了前端开发…… | 实习 5 个月独立交付 12 个需求、修复 4 个线上问题；排查表单重复提交问题，定位到按钮防抖缺失 + 接口未幂等，前后端协同加幂等键后同类工单清零（数字示例） |

---

## 4. 个人总结 / 自我评价

### 4.1 规则

1. **【共识｜avoid】不写性格类、态度类形容词**：开朗、认真负责、学习能力强、抗压能力强、吃苦耐劳、热爱技术。
   - S11：「这些点，你但凡缺哪个，我也不想要你啊」。
   - S10：「必须有佐证，尴尬的自我吹嘘会让我对简历的好感度迅速的下降」。
   - S12：「一个不可能为假的陈述，信息量是零」。
   - S1：「勤奋、吃苦这些比较虚的东西就不要扯了」。
   - S9：「这种话谁不会写？」
2. **【有分歧｜should】要不要保留这一栏：**
   - 主张保留并放到最前面：S3（TIH 强烈推荐 Professional Summary，少于 50 词，开头写岗位名词）、S10（顶部写 3–4 句个人摘要：定位 + 核心经验 + 关键技能 + 最亮成就）。
   - 主张多数人删掉：S12（只有三种情况才值得写：读不出定位、有别处放不下的决定性信息、岗位考书面表达）；S9（「如果你实在找不到有说服力的事例……直接删掉」）。
   - → **结论：** 能写出 2–3 行有证据的定位句就写，并改名为「个人优势」或「个人摘要」，放在最上方；写不出就删掉，把版面让给项目。转方向的人（比如应届生投 AI Agent 岗）更适合写，因为要先把定位钉住（S12 标准一）。
3. **【共识｜must】每一个说法都要在下文找到对应证据，最好就在句子里带上数据或链接。**
   - S9：「说自己『全栈能力强』，后面跟着『已上线 10+ 个可访问产品』」。
   - S12：摘要「是下面经历栏的索引」，不引入新信息。
4. **【多来源｜should】篇幅控制在 3 行或 50 词以内**（S3 少于 50 词；S12 三到五行，必填时不超过三行）。
5. **【个别观点】网申系统里如果有必填的自我评价框，照样只写事实，不超过三行（S11、S12）。**

### 4.2 句式模板

```
（定位）<岗位方向> 应届生，<主攻技术方向>；
（证据）独立开发并上线 <N> 个项目（<最有分量的那个：用户 / Star / 场景>），<一项与 JD 对齐的核心能力 + 证据>；
（差异）<一个别人没有、但可以核验的点：开源贡献 / 竞赛 / 发布的 npm 包 / Agent Skill>。
```

### 4.3 好坏对比

| ❌ 坏 | ✅ 好 |
|---|---|
| 具备强大的学习能力，乐于不断探索学习；具有良好的沟通技能，善于倾听和团队合作；热爱运动，身体素质好；能够承受压力，具备较强的吃苦耐劳精神（S7 原帖真实写法） | 前端 / AI 应用方向应届生。独立开发并部署 2 个全栈项目（均可在线访问）；在 X 中实现带人工确认与评测回归的 Agent 执行流；为 Claude Code 编写并开源 N 个 Skill（数字需真实） |

---

## 5. 教育背景、证书 / 奖项、简历标题 / 求职意向

### 5.1 教育背景

- **【共识｜must】写全学校、学历、专业、起止时间（或毕业时间）。** S1：要让面试官「知道你的学历、专业、毕业学校以及毕业的日期」；超级简历：「一定要注明毕业时间」。
- **【多来源｜should】应届生和工作 3 年以内的人，把教育放在靠前位置**（S3：「if you are still in school or have less than 3 years of experience, you may put Education first」）。工作满 3 年以上后，放到经历后面。
- **【多来源｜should】成绩好才写 GPA 或排名。** S3：GPA 3.5/4.0 以上才写。S9：「排名前 20% 以上，就果断写上去……不太好看，就不要主动暴露短板」。
- **【个别观点｜avoid】就业简历不写主修课程。** S11：主修课程「只适用于考研保研面试简历」；如果写了，就要能接住追问。
- **【个别观点｜should】教育和奖项可以合并成一栏，节省空间（S9）。**

模板：`四川XX大学｜本科｜XX专业｜2022.09 – 2026.06｜GPA 3.6/4.0（专业前 15%）`（数值仅为示例）

### 5.2 证书 / 奖项

- **【共识｜should】只写和岗位相关、有含金量的奖项，按认可度排序；不知名的比赛往后放或者删掉。** S1：ACM、天池这类比赛「一定要写一下……适当往前放」；S9：「面试官看到一堆没听过的比赛名称，反而会觉得你在凑数」；S3：「Only include achievements related to the job application」。
- **【should】格式写作「年份｜名次 / 量化｜赛事名」**（S3：「2016 | Best All-Round Product out of 50 teams | Facebook Hackathon」）。
- **【个别观点，有冲突｜avoid】计算机二级、Office、CET-4、学生工作、党员身份等信息：S10 主张全部不写；S11 主张学生工作对技术岗「屁用没有」，有可量化的突出贡献时例外。** 另一方面，超级简历建议英语证书「只写最高的就可以」。→ 技术岗建议：只保留 CET-6（或 CET-4 高分）一项，放进教育行；其余删除。

### 5.3 简历标题 / 求职意向

- **【共识｜must】最上方写清「意向岗位 + 城市」（加到岗时间）。** S1：「你想要应聘什么岗位，希望在什么城市」，也可以并入个人信息。
- **【多来源｜should】岗位名称和投递的 JD 保持一致（ATS 和 HR 按关键词匹配）。** S4 建议在简历中「尽可能多地散布『前端』」；S3：要贴近 JD 的用词。一个方向一个版本。
- **【个别观点｜should】在岗位名后面用括号点明差异化经验，例如「前端开发工程师（具备 AI Agent 全栈开发经验）」（S9）。** 前提是项目栏里真的有对应证据。
- **【共识｜should】联系方式那一行放 GitHub、作品集、博客链接**，前提是链接里有实质内容（S9、S3、S6；S7 面试官建议把博客链接「拿到最上面」）。
- **【多来源】照片可放可不放，技术岗通常不需要；要放就放证件照（S1、S6）。** 薪资：锤子简历（2025-11）建议写区间，但这是个别平台的观点；校招简历一般不写。
- 文件名：`姓名-岗位-学校/届别.pdf`。这是行业惯例，本次没有找到核实过的来源。

---

## 6. 中文简历的通用格式约定

1. **【多来源｜should】页数：应届生和 5 年以内经验，首选一页。**
   - S3：「Use only 1 page」。
   - S4：「少于 5 年，最好保持在一页以内，不超过两页」。
   - S6：「校招一页」。
   - **分歧：** S1（JavaGuide）主张「校招生 2 页之内……不需要非把内容压缩到一页」。
   - → 结论：目标一页；内容确实硬的话，最多两页，而且第一页就要能看到项目或实习（S9：「要保证简历的第一页能够看到你的工作经历或者项目经历」）。
2. **【共识｜must】用 PDF 投递，文本要能选中、能解析；单栏布局；不用图片或表格承载关键信息；不放页眉页脚。**
   - S1：「一定要使用 PDF 格式投递」。
   - S3：文字要「easily highlightable」，不要用设计软件，不用 header/footer。
   - S4：「使用单列格式」，正文最小 11px。
   - S6：Word 可能被 AI 筛选系统解析出错。
   - **自检方法：** 全选复制，粘贴到纯文本里，看顺序和字符是否正常（S3「plain text file test」）。
3. **【共识｜must】使用标准栏目名，栏目名里不加符号或 emoji**（S3：「Never add symbols to your headers」）。中文标准名：个人信息 / 求职意向、教育背景、专业技能、实习经历、项目经历、获奖经历、个人优势。
4. **【共识｜must】时间格式全文统一，写到月。** 推荐 `2025.07 – 2025.12`，进行中写「至今」，不要写「现在」「Present」。S15：「年份写全四位；月份补足两位……起止之间的分隔只用一种」，并且简历和网申表上的日期要一致。S3 用的是 MM/YYYY，S1 的示例里自己就混用了「2019.09 - 2022.01」和「2017-05~2018-06」。可见格式选哪种都行，关键是统一。
5. **【共识｜must】技术名词按官方大小写写，不用自造缩写。**
   - S1：「java->Java，spring boot->Spring Boot……很多面试官都会在意这个细节」。
   - S17 的正例：「熟悉 TypeScript、HTML5，至少理解一种框架（如 React、Next.js）」；反例：「Ts、h5、RJS、nextjs」。
   - **前端 / AI 常见易错写法：** JavaScript（不写 Javascript）、TypeScript、Node.js、Next.js、Vue 3 / Vue.js、React、Tailwind CSS、Vite、webpack（官方是小写）、pnpm（小写）、GitHub（不写 Github）、PostgreSQL、MySQL、Redis、Docker、Kubernetes、LangChain、LangGraph、OpenAI、Claude Code、Cursor、MCP、RAG、SSE、WebSocket。
6. **【多来源｜should】中英文、中文和数字之间加空格；数字和单位之间加空格；% 和 ° 不加空格；全角标点前后不加空格；中文语境用全角标点，数字用半角**（S17；S1 也说「中文和数字英文之间加上空格的话看起来会舒服一点」）。S17 自己说明，中文标点的部分用法「略带有个人色彩」；引号用直角引号还是弯引号存在争议，只要统一即可。
7. **【多来源｜should】术语全文一致。** 同一个东西只用一种叫法（例如「Agent」和「智能体」二选一，「大模型」和「LLM」二选一）；同一个技术在技能栏和项目栏的写法要一致。直接依据有：S17「专有名词使用正确的大小写」，S15「同一个日期在简历和网申表里要写成一样」，以及 S3 关于 ATS 关键词频率的说明。**全文统一用词这一条是本文据此推断得出的，没有找到单独讨论它的来源。**
8. **【惯例｜should】条目省略主语，不用「我 / 本人」开头。**
   - 依据：S3 要求主动语态；腾讯新闻 2026-03 的提示词规则写明「不要出现『本人』」；英文社区规则「No personal pronouns」（resume-builder 转引 r/EngineeringResumes，未核实）。
   - **注意：** 中文来源里也有带「我」的示例，例如 S1 的好例句「我作为后端技术负责人……」，S14 句式五里的「我方负责验收标准」。所以这条按 should 处理：条目开头不加主语；需要划清团队边界时，可以用「本人负责 / 由 X 负责」。
9. **【惯例｜should】条目结尾的标点全文统一（要么都加句号，要么都不加）。** 英文社区规则是 bullets 结尾不加句号（未核实）；中文没有找到核实过的规范，统一即可。
10. **【共识｜should】一岗一版：** 按目标 JD 调整技能顺序、项目侧重点和关键词（S3、S4、S9、S12）。同一家公司不要投太多不同方向的岗位（S3：ATS 能看到你投的所有岗位）。
11. **【多来源｜must】网申表单要认真填。** S3：很多公司只看表单字段，「it is possible that your resume is never seen」。国内大厂（字节、腾讯、阿里、美团）的校招都走自家招聘官网表单。这一点是本文的推断，没有核实各家系统的具体解析行为。

---

## 7. 「多来源一致的规范」和「个别观点」汇总

**多来源一致（可以当硬规则）：**
不写「精通」（应届生）· 技能分组并对齐 JD · 技能栏的词必须有项目证据 · 项目写「做了什么」而不是「项目是什么」· 技术栈行只写名词 · 条目写「技术 + 场景 + 结果」· 避免光秃秃的「负责 / 参与 / 协助」· 不编造数字 · 自我评价不写形容词 · 倒序 · PDF、单栏、可解析 · 技术名词规范大小写 · 一岗一版。

**个别观点或存在分歧（按需取用）：**
「了解」写不写（S1 写 vs 智灵简历不写）· 页数一页还是两页（S1 两页 vs S3/S4/S6 一页）· 自我评价留还是删（S3/S10 留 vs S12/S9 视情况删）· 写「90% 代码由 AI 生成」是加分（只有 S9）· 求职意向加括号写 AI 经验（只有 S9）· 主修课程不写（S11）· CET-4 / 计算机二级不写（S10）· 每个项目 6–8 条（只有 S1）· 薪资区间（锤子简历）。

---

## 8. 机器可读规则清单（JSON Lines，一行一条）

字段：`id`、`section`（skills / projects / experience / summary / education / awards / header / format）、`rule`、`strength`（must / should / avoid）、`consensus`（multi / single / conflict）、`sources`。

```jsonl
{"id":"SK-01","section":"skills","rule":"应届/低年限不写「精通」；写了会被追问到原理层，答不上严重扣分","strength":"avoid","consensus":"multi","sources":["S7","S6","S13","S1"]}
{"id":"SK-02","section":"skills","rule":"只写能被追问到第二层的技术；技能栏每个词都是面试题","strength":"must","consensus":"multi","sources":["S1","S6","S13"]}
{"id":"SK-03","section":"skills","rule":"等级词最多保留两档（熟悉/了解），且熟悉级必须有项目证据","strength":"should","consensus":"multi","sources":["S6","S13","S1"]}
{"id":"SK-04","section":"skills","rule":"「了解」仅少量用于覆盖JD关键词，核心技能不靠「了解」","strength":"should","consensus":"conflict","sources":["S1","S13"]}
{"id":"SK-05","section":"skills","rule":"用锚替代形容词：技能后附用在哪/量级/产出物/第三方凭据之一；技能栏不写结果","strength":"should","consensus":"multi","sources":["S13","S3"]}
{"id":"SK-06","section":"skills","rule":"按技术领域分组（语言/框架/工程化/后端/AI应用/AI编程），每类1-2个代表技术，不堆砌同类框架","strength":"must","consensus":"multi","sources":["S4","S6","S3"]}
{"id":"SK-07","section":"skills","rule":"优先列JD出现的、影响架构的技术；省略可替换的工具库（如Lodash）","strength":"should","consensus":"single","sources":["S4"]}
{"id":"SK-08","section":"skills","rule":"技能栏核心词须在项目/实习条目中出现至少一次","strength":"must","consensus":"multi","sources":["S13","S2","S3"]}
{"id":"SK-09","section":"skills","rule":"技能栏不写软技能（沟通/学习能力/团队合作）","strength":"avoid","consensus":"multi","sources":["S10","S12","S13","S5"]}
{"id":"SK-10","section":"skills","rule":"技术岗删除Office/计算机二级；英语只保留最高一项","strength":"avoid","consensus":"conflict","sources":["S10"]}
{"id":"SK-11","section":"skills","rule":"AI相关技能单独成组（RAG/MCP/Agent/流式等），面向AI Agent岗为必备关键词","strength":"should","consensus":"multi","sources":["S9","S8","S10"]}
{"id":"SK-12","section":"skills","rule":"AI编程工具写「用途+人工把关方式」，不只列Cursor/Claude Code工具名；做过Skill/MCP扩展要写","strength":"should","consensus":"multi","sources":["S9"]}
{"id":"SK-13","section":"skills","rule":"Agent能力避免只写调模型/接工具；体现运行时、状态机、评测、可观测、HITL","strength":"should","consensus":"single","sources":["S8"]}
{"id":"PR-01","section":"projects","rule":"每个项目含：名称、角色、时间、链接；简介≤2行；技术栈行；3-5条亮点","strength":"must","consensus":"multi","sources":["S1","S6","S10","S14"]}
{"id":"PR-02","section":"projects","rule":"简介写「是什么/为谁/解决什么/规模或状态」，篇幅给「你做了什么」","strength":"must","consensus":"multi","sources":["S1","S7"]}
{"id":"PR-03","section":"projects","rule":"技术栈行只写技术名词，不解释技术用途","strength":"must","consensus":"multi","sources":["S1","S4"]}
{"id":"PR-04","section":"projects","rule":"条目用「动词+技术方案+问题/场景+结果」（XYZ/STAR压缩版）","strength":"must","consensus":"multi","sources":["S5","S1","S6","S3"]}
{"id":"PR-05","section":"projects","rule":"避免「负责/参与/协助+空泛对象」；以具体强动词开头","strength":"avoid","consensus":"multi","sources":["S10","S9","S14","S6"]}
{"id":"PR-06","section":"projects","rule":"慎用「主导/从0到1/独立负责/架构」除非能接住追问","strength":"should","consensus":"single","sources":["S14"]}
{"id":"PR-07","section":"projects","rule":"不编造数字；数字须有口径、可复现（自测工具/评测集）","strength":"must","consensus":"multi","sources":["S9","S18","S14"]}
{"id":"PR-08","section":"projects","rule":"无数字时用规模、消除的失败模式、留存物、上线/开源状态作证据","strength":"should","consensus":"multi","sources":["S18","S14","S13"]}
{"id":"PR-09","section":"projects","rule":"团队项目写清个人边界（哪部分由他人负责）","strength":"must","consensus":"multi","sources":["S14","S18","S5"]}
{"id":"PR-10","section":"projects","rule":"附可访问的线上地址/GitHub，README完整；空仓库不放","strength":"should","consensus":"multi","sources":["S9","S3","S4","S6"]}
{"id":"PR-11","section":"projects","rule":"精选2-3个项目，侧重点互补；避免同质化教程式工程项堆砌","strength":"should","consensus":"multi","sources":["S1","S3","S9","S8"]}
{"id":"PR-12","section":"projects","rule":"条目不全围绕同一技术点，不全是纯业务CRUD","strength":"avoid","consensus":"single","sources":["S1"]}
{"id":"PR-13","section":"projects","rule":"每条1-2行；一页简历每项目3-5条（JavaGuide上限6-8条为两页场景）","strength":"should","consensus":"multi","sources":["S14","S1"]}
{"id":"PR-14","section":"projects","rule":"前端优先量化：加载时间/Lighthouse/包体积/测试覆盖/a11y/SEO/技术迁移","strength":"should","consensus":"single","sources":["S4"]}
{"id":"EX-01","section":"experience","rule":"倒序；抬头写公司|岗位|起止时间","strength":"must","consensus":"multi","sources":["S1","S3","S15"]}
{"id":"EX-02","section":"experience","rule":"开头一行交代产品/团队与业务规模","strength":"should","consensus":"multi","sources":["S9","S4","S16"]}
{"id":"EX-03","section":"experience","rule":"实习中的项目写在实习条目下，不在项目经历重复","strength":"must","consensus":"multi","sources":["S16","S2"]}
{"id":"EX-04","section":"experience","rule":"比项目经历更强调业务贡献、上线、线上问题排查、协作边界；可用「独立交付N需求/修复M线上问题」打底","strength":"should","consensus":"multi","sources":["S9","S4","S2"]}
{"id":"EX-05","section":"experience","rule":"不写「个人收获」大段与职责说明书式句子","strength":"avoid","consensus":"multi","sources":["S7","S1"]}
{"id":"EX-06","section":"experience","rule":"头衔可在真实前提下向目标岗位靠拢（如「软件工程师（前端）」）","strength":"should","consensus":"single","sources":["S4"]}
{"id":"SU-01","section":"summary","rule":"不写性格/态度形容词（开朗/认真负责/学习能力强/抗压/吃苦耐劳/热爱技术）","strength":"avoid","consensus":"multi","sources":["S11","S10","S12","S1","S9"]}
{"id":"SU-02","section":"summary","rule":"能写出有证据的2-3行定位句才保留（放顶部），否则删除让位项目","strength":"should","consensus":"conflict","sources":["S3","S10","S12","S9"]}
{"id":"SU-03","section":"summary","rule":"每个说法须有可核验证据（数字/链接），且是下文经历的索引","strength":"must","consensus":"multi","sources":["S9","S12","S10"]}
{"id":"SU-04","section":"summary","rule":"长度≤3行或≤50词","strength":"should","consensus":"multi","sources":["S3","S12"]}
{"id":"ED-01","section":"education","rule":"写全学校、学历、专业、起止或毕业时间","strength":"must","consensus":"multi","sources":["S1","S3"]}
{"id":"ED-02","section":"education","rule":"应届/<3年经验教育放前；≥3年放经历后","strength":"should","consensus":"single","sources":["S3"]}
{"id":"ED-03","section":"education","rule":"GPA≥3.5/4或排名前20%才写","strength":"should","consensus":"multi","sources":["S3","S9"]}
{"id":"ED-04","section":"education","rule":"就业简历不列主修课程（除非能接住追问）","strength":"avoid","consensus":"single","sources":["S11"]}
{"id":"AW-01","section":"awards","rule":"只写岗位相关、有认可度的奖项，按含金量排序；格式「年份|名次/量化|赛事」","strength":"should","consensus":"multi","sources":["S1","S9","S3"]}
{"id":"AW-02","section":"awards","rule":"技术岗不写学生工作/社团（有量化突出贡献除外）","strength":"avoid","consensus":"conflict","sources":["S11","S10"]}
{"id":"HD-01","section":"header","rule":"顶部写意向岗位+城市（+到岗时间），岗位名与JD一致，一方向一版本","strength":"must","consensus":"multi","sources":["S1","S4","S3"]}
{"id":"HD-02","section":"header","rule":"岗位名后括号点明真实差异化经验（如「具备AI Agent全栈开发经验」）","strength":"should","consensus":"single","sources":["S9"]}
{"id":"HD-03","section":"header","rule":"联系方式行放GitHub/作品集/博客链接（须有实质内容）","strength":"should","consensus":"multi","sources":["S9","S3","S6","S7"]}
{"id":"FM-01","section":"format","rule":"应届/低年限目标一页，最多两页；第一页必须出现项目/实习","strength":"should","consensus":"conflict","sources":["S3","S4","S6","S1","S9"]}
{"id":"FM-02","section":"format","rule":"PDF投递、文本可选可解析、单栏、不用页眉页脚/图片承载关键信息；做纯文本粘贴自检","strength":"must","consensus":"multi","sources":["S1","S3","S4","S6"]}
{"id":"FM-03","section":"format","rule":"栏目用标准名称，标题不加符号/emoji","strength":"must","consensus":"single","sources":["S3"]}
{"id":"FM-04","section":"format","rule":"时间写到月且全文统一格式（推荐YYYY.MM – YYYY.MM，进行中写「至今」）；与网申表一致","strength":"must","consensus":"multi","sources":["S15","S3","S1"]}
{"id":"FM-05","section":"format","rule":"技术名词官方大小写（JavaScript/TypeScript/Node.js/Next.js/GitHub/webpack/pnpm），不用自造缩写（ts/h5/nextjs）","strength":"must","consensus":"multi","sources":["S1","S17"]}
{"id":"FM-06","section":"format","rule":"中英文、中文与数字间加空格；数字与单位间加空格（%除外）；中文用全角标点、数字用半角","strength":"should","consensus":"multi","sources":["S17","S1"]}
{"id":"FM-07","section":"format","rule":"同一概念全文同一术语（Agent/智能体、LLM/大模型二选一）","strength":"should","consensus":"single","sources":["S17","S15"]}
{"id":"FM-08","section":"format","rule":"条目省略主语，不以「我/本人」开头；需划清团队边界时可写「由X负责」","strength":"should","consensus":"conflict","sources":["S3"]}
{"id":"FM-09","section":"format","rule":"条目末尾标点全文统一","strength":"should","consensus":"single","sources":[]}
{"id":"FM-10","section":"format","rule":"每次投递按JD调整关键词与项目侧重；同公司不投过多不同方向岗位","strength":"should","consensus":"multi","sources":["S3","S4","S9","S12"]}
{"id":"FM-11","section":"format","rule":"网申表单字段认真填写，内容与简历一致","strength":"must","consensus":"single","sources":["S3","S15"]}
```
