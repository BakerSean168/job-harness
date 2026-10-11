/**
 * Additive three-profile one-page resume experiment (V3, independent alternative emphasis).
 * Sources: verified Job Harness primary ResumeLibrary plus current
 * MemoFlow / BodySense / ForgeFlow repository facts (2026-10-11).
 * PREVIEW writes no database mutations. COMMIT additively extends the
 * ResumeLibrary and creates new Profiles without modifying existing Profiles.
 * V3 reuses the verified `krjx` enterprise internship, `sicau` education and
 * `cet6` certificate only; no invented employment, tenure or usage metrics.
 *
 * Run inside the Job Harness server container from /app using tsx:
 *   tsx scripts/resume-one-page-v3.mts preview
 *   tsx scripts/resume-one-page-v3.mts commit
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { validateResumeProfileReferences, ResumeLibrarySchema, ResumeProfileSchema } from '../packages/resume-contracts/src/index.ts';

const mode = process.argv[2] || 'preview';
if (!['preview', 'commit'].includes(mode)) throw new Error('Mode must be preview or commit');
const directory = '/data/resume-v3-staging';
mkdirSync(directory, { recursive: true });
const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
const now = new Date().toISOString();
const zh = (text) => ({ 'zh-CN': text });
const V3_ID = 'one-page-v3';
const addons = {
  'dailyuse': {
    presentation: {
      id: V3_ID, name: null,
      description: zh('长期维护的 Web / Electron 多端效能系统（MemoFlow），整合目标、任务、知识与 AI 工作台；共享应用层与领域接口，强调响应式交互与状态一致性。'),
      stack: zh('Vue 3、TypeScript、Electron、Node.js、PostgreSQL、PowerSync、Nx'),
      role: null,
    },
    highlights: [
      ['v3-memoflow-reactive', '响应式界面：', '以 Vue 3 组合式 API 与响应式依赖追踪构建多端工作台，界面状态与领域数据保持单向同步，减少手工 DOM 操作与隐式状态。'],
      ['v3-memoflow-workflow', '复杂业务流：', '将目标、任务、知识与 AI 工作台的多步操作拆为可组合交互，覆盖批量编辑、级联筛选与中途取消等真实使用路径。'],
      ['v3-memoflow-stream', '流式会话界面：', '聊天工作区按消息与工具调用增量渲染，生成期间仍可继续输入、切换业务面板或回看历史，不阻塞其它操作。'],
      ['v3-memoflow-state', '状态正确性：', 'Web HTTP 与桌面 IPC 复用同一应用层状态更新入口，避免多端写入分叉，并为失败与重试定义统一处理。'],
      ['v3-memoflow-test', '可测试性：', '领域与应用层以显式接口和依赖注入组织，核心交互逻辑可在无 Electron 环境下通过单元测试验证。'],
    ],
  },
  'body-sense': {
    presentation: {
      id: V3_ID, name: null,
      description: zh('体态健康 AI 助手，以长程咨询、可版本化 BodyState 与训练反馈构成可追溯业务闭环；React 交互层与 Go / Python 服务分层。'),
      stack: zh('React 19、TypeScript、Go / Gin、Python / FastAPI、LangGraph、PostgreSQL / pgvector、SSE'),
      role: null,
    },
    highlights: [
      ['v3-bodysense-ui-stream', '流式交互与渲染：', 'React 侧按 SSE 事件分段更新回答、工具调用与引用，长回答生成期间界面保持可交互。'],
      ['v3-bodysense-state-version', '状态版本化：', '将症状、观察与反馈记录为带版本的 BodyState，分析与建议引用具体版本，支持后续修正与回溯。'],
      ['v3-bodysense-api-contract', '类型化契约：', '前后端以类型化接口描述会话、BodyState 与训练数据的读写，边界输入在进入领域逻辑前完成校验。'],
      ['v3-bodysense-boundary', '领域边界：', 'Go 服务负责会话与长期业务数据，Python 服务负责推理编排，通过稳定事件协议解耦交互层与模型侧变化。'],
      ['v3-bodysense-evidence', '检索与引用核验：', '结合 Embedding、pgvector 和引用核查构建可溯源检索流程，使用离线回放排查缺乏依据的建议。'],
      ['v3-bodysense-checkpoint', '检查点与恢复：', '持久化会话线程与中间步骤，中断后可续跑多轮追问、工具调用与人工确认。'],
    ],
  },
  'forgeflow-pi': {
    presentation: {
      id: V3_ID, name: null,
      description: zh('基于 Pi Agent / pi-subagents 的软件工程治理扩展，以检查点续跑、证据链与确定性审查约束支撑长任务交付。'),
      stack: zh('Pi Agent、pi-subagents、TypeScript、TypeBox、LiteLLM、Git / CI'),
      role: null,
    },
    highlights: [
      ['v3-pi-checkpoint-resume', '检查点与续跑：', '复用 Pi 会话与子 Agent 能力保存任务进度，长任务中断后可从检查点继续，而不重放已完成步骤。'],
      ['v3-pi-evidence', '证据链：', '交付判定绑定当前提交与可复现命令输出，新改动使旧证据失效，避免以历史结论代替现实验证。'],
      ['v3-pi-policy-provider', '策略与供给解耦：', '逻辑角色与物理模型、Provider 供给分层描述，供给变更不影响角色语义与审查规则。'],
      ['v3-pi-review-invariants', '确定性审查约束：', '以单写者工作树、预检不变量与独立只读审查构成可重复的评审流程，减少对主观判断的依赖。'],
    ],
  },
};

const specs = [
  {
    id: 'ai-frontend-v3', from: 'ai-frontend-v2', name: '前端开发工程师 v3',
    skills: [
      ['frontend-frameworks-v2', '<strong>框架与语言：</strong>Vue 3（组合式 API）、React 19、TypeScript，能独立实现中后台与多端界面模块。'],
      ['frontend-state-v2', '<strong>响应式与状态：</strong>区分 Server State 与本地交互状态，处理缓存、乐观更新、SSE 流式更新及加载 / 失败 / 中断态。'],
      ['frontend-foundations-v2', '<strong>交互质量：</strong>面向复杂工作流设计状态机式交互，关注边界输入、可测试性与回归验证。'],
      ['frontend-engineering-v2', '<strong>工程工具：</strong>Vite、Nx / pnpm、Vitest、Playwright、GitHub Actions；具备 Web 与 Electron 共享代码实践。'],
    ],
    work: [
      ['biz-dev', '使用 Vue 3 + TypeScript 交付 OLP AI Knowledge 前端：覆盖会话生成、知识保存 / 发布、预览与批量管理，参与接口联调与提测。'],
      ['tech-debt', '重构 DDCC 文档打印：以原生 DOM 与 CSS 分页媒体替代截图方案，处理长表分页、模糊与签批跨页问题。'],
    ],
    projects: [
      {id:'dailyuse', highlights:['v3-memoflow-reactive','v3-memoflow-stream']},
      {id:'body-sense', highlights:['v3-bodysense-ui-stream','v3-bodysense-api-contract']},
    ],
  },
  {
    id: 'ai-fullstack-v3', from: 'ai-fullstack-v2', name: '全栈开发工程师 v3',
    skills: [
      ['fullstack-frontend-v2', '<strong>类型化契约：</strong>以 TypeScript 定义前后端共享接口与领域模型，让编译期检查覆盖请求 / 响应与状态变更。'],
      ['fullstack-backend-v2', '<strong>后端与数据：</strong>Node.js / Express、Go / Gin、Python / FastAPI、PostgreSQL / Redis，具备 API 设计、数据建模与多服务联调实践。'],
      ['fullstack-foundations-v2', '<strong>领域边界：</strong>按业务职责划分服务与模块，明确数据归属与写入入口，避免跨层直接操作状态。'],
      ['fullstack-engineering-v2', '<strong>交付与验证：</strong>Nx / pnpm、Docker、Vitest / Playwright、GitHub Actions，组织多服务构建、测试与发布检查。'],
    ],
    work: [
      ['biz-dev-fs', '负责 OLP AI Knowledge 前端交付，打通生成、保存、发布到预览下载的业务链路，参与接口定义与联调。'],
      ['collab-fs', '参与 BigBlueButton React 客户端定制，并排查 Docker 多阶段构建缓存问题，完成局部构建与验证。'],
    ],
    projects: [
      {id:'body-sense', highlights:['v3-bodysense-state-version','v3-bodysense-boundary']},
      {id:'dailyuse', highlights:['v3-memoflow-state','v3-memoflow-test']},
    ],
  },
  {
    id: 'ai-agent-app-v3', from: 'ai-agent-app-v2', name: 'Agent 应用开发工程师 v3',
    skills: [
      ['agent-runtime-v2', '<strong>Agent 运行时：</strong>LangGraph / PydanticAI、Pi Agent / pi-subagents、Mastra；熟悉工具调用、检查点、interrupt / resume 与人工确认。'],
      ['agent-rag-eval-v2', '<strong>证据与评测：</strong>以 ASR、Embedding、pgvector 构建可溯源检索，结合引用核查与离线回放评估输出质量。'],
      ['agent-fullstack-v2', '<strong>应用工程：</strong>Python / FastAPI、Go / Gin、TypeScript / React、PostgreSQL 与 LiteLLM，关注结构化校验、失败处理与业务写入边界。'],
      ['agent-foundations-v2', '<strong>治理与解耦：</strong>把策略、模型供给与执行分层，通过确定性约束与只读审查保证流程可重复。'],
    ],
    work: [
      ['ai-knowledge-agent', '在企业 OLP 项目中交付 AI Knowledge 前端，使会话生成到知识发布、预览下载的链路可审阅、可复用。'],
      ['ai-hitl-agent', '实现 AI Match / Re-match → 用户确认 → 业务更新流程，将模型建议与最终数据写入分离。'],
    ],
    projects: [
      {id:'body-sense', highlights:['v3-bodysense-checkpoint','v3-bodysense-evidence']},
      {id:'forgeflow-pi', highlights:['v3-pi-evidence','v3-pi-policy-provider']},
    ],
  },
];

function assembleLibrary(original) {
  const library = structuredClone(original);
  let changed = false;
  // Keep the retired Open SWE/LangGraph ForgeFlow record untouched for history.
  // Add Pi-native ForgeFlow as a distinct project identity for current versions.
  if (!library.projects.some((project) => project.id === 'forgeflow-pi')) {
    const old = library.projects.find((project) => project.id === 'forgeflow');
    if (!old) throw new Error('Missing source ForgeFlow project');
    const current = structuredClone(old);
    current.id = 'forgeflow-pi';
    current.name = zh('ForgeFlow（Pi Agent 软件工程治理扩展）');
    current.period = { ...current.period, note: null };
    current.presentations = [];
    current.highlights = [];
    library.projects.push(current);
    changed = true;
  }
  for (const [projectId, addon] of Object.entries(addons)) {
    const project = library.projects.find((project) => project.id === projectId);
    if (!project) throw new Error('Missing project in library: ' + projectId);
    if (!project.presentations.some((item) => item.id === V3_ID)) {
      project.presentations.push(addon.presentation);
      changed = true;
    } else {
      const installed = project.presentations.find((item) => item.id === V3_ID);
      if (JSON.stringify(installed) !== JSON.stringify(addon.presentation)) throw new Error('Existing v3 presentation differs: ' + projectId);
    }
    for (const [id, label, detail] of addon.highlights) {
      const expected = { id, label: zh(label), detail: zh(detail) };
      const installed = project.highlights.find((item) => item.id === id);
      if (!installed) { project.highlights.push(expected); changed = true; }
      else if (JSON.stringify(installed) !== JSON.stringify(expected)) throw new Error('Existing v3 highlight differs: ' + projectId + '/' + id);
    }
  }
  if (changed) {
    library.version = original.version + 1;
    library.updatedAt = now;
  }
  return ResumeLibrarySchema.parse(library);
}

function assembleProfile(base, spec) {
  const profile = structuredClone(base);
  profile.id = spec.id;
  profile.version = 1;
  profile.name = zh(spec.name);
  profile.output = {
    documentTitle: zh('卢楼豪 - ' + spec.name),
    description: zh('2026 届 ' + spec.name + '，A4 单页实验版本（v3）。'),
    onlineUrl: null,
    pdfName: zh('卢楼豪-' + spec.name.replaceAll(' ', '-')),
  };
  profile.positioning = zh(spec.name.replace(' v3', ''));
  profile.layout = { header: 'without-photo', pageSize: 'A4' };
  profile.sectionOrder = ['education', 'skills', 'work', 'projects', 'certificates'];
  profile.educationIds = ['sicau'];
  profile.skillIds = spec.skills.map(([id]) => id);
  profile.workSelections = [{ experienceId: 'krjx', bulletIds: spec.work.map(([id]) => id) }];
  profile.projectSelections = spec.projects.map(({id, highlights}) => ({ projectId:id, presentationId:V3_ID, highlightIds:highlights }));
  profile.certificateIds = ['cet6'];
  profile.summaryIds = [];
  // Reuse canonical skill/work IDs; localized v3 wording stays Profile-local.
  profile.overrides = [
    ...spec.skills.map(([id, value]) => ({ kind:'skill', skillId:id, value:zh(value) })),
    ...spec.work.map(([id, value]) => ({ kind:'work-bullet', experienceId:'krjx', bulletId:id, value:zh(value) })),
  ];
  profile.createdAt = now;
  profile.updatedAt = now;
  profile.archivedAt = null;
  return ResumeProfileSchema.parse(profile);
}

try {
  const originalLibrary = await store.getLibrary('primary');
  if (!originalLibrary) throw new Error('primary ResumeLibrary not found');
  const library = assembleLibrary(originalLibrary);
  const bases = await Promise.all(specs.map((spec) => store.getProfile(spec.from)));
  if (bases.some((x) => !x)) throw new Error('A source active Profile is missing');
  const profiles = specs.map((spec, i) => assembleProfile(bases[i], spec));
  for (const profile of profiles) {
    const issues = validateResumeProfileReferences(library, profile);
    if (issues.length) throw new Error(profile.id + ' invalid refs: ' + JSON.stringify(issues));
    resolveResume(library, profile);
    writeFileSync(join(directory, profile.id + '.json'), JSON.stringify({library,profile}, null,2));
  }
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
    preparedAt: now, mode, originalLibraryVersion: originalLibrary.version,
    candidateLibraryVersion: library.version,
    profiles: profiles.map((profile)=>({id:profile.id,name:profile.name['zh-CN']})),
  }, null, 2));
  if (mode === 'preview') {
    for (const profile of profiles) {
      const response = await fetch('http://127.0.0.1:3000/api/v1/resume/preview/pdf', {
        method: 'POST',
        headers: {'authorization': 'Bearer ' + process.env.JOB_HARNESS_AUTH_TOKEN, 'content-type': 'application/json'},
        body: JSON.stringify({ library, profile }),
      });
      if (!response.ok) throw new Error(profile.id + ' PDF preview failed ' + response.status + ': ' + (await response.text()).slice(0,500));
      const bytes = Buffer.from(await response.arrayBuffer());
      writeFileSync(join(directory, profile.id + '.pdf'), bytes);
      console.log('PREVIEW ' + profile.id + ' PDF_BYTES=' + bytes.byteLength);
    }
  } else {
    // One SQLite transaction prevents partially installed V3 Library content.
    await store.transaction(async tx => {
      const liveLibrary = await tx.getLibrary('primary');
      if (!liveLibrary || liveLibrary.version !== originalLibrary.version) {
        throw new Error('ResumeLibrary changed since V3 candidate preparation; retry with fresh data.');
      }
      for (const base of bases) {
        const live = await tx.getProfile(base.id);
        if (!live || live.version !== base.version) {
          throw new Error('Source V2 Profile changed during preparation: ' + base.id);
        }
      }
      for (const profile of profiles) {
        if (await tx.getProfile(profile.id)) throw new Error('Profile already exists: ' + profile.id);
        if (validateResumeProfileReferences(library, profile).length) throw new Error('Invalid profile ' + profile.id);
        resolveResume(library, profile);
      }
      if (library.version !== originalLibrary.version) await tx.upsertLibrary(library);
      for (const profile of profiles) await tx.upsertProfile(profile);
    });
    if (library.version !== originalLibrary.version) console.log('LIBRARY_VERSION ' + library.version);
    for (const profile of profiles) console.log('CREATED ' + profile.id);
  }
} finally {
  store.close();
}