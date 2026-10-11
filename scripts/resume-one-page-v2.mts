/**
 * Additive three-profile one-page resume experiment.
 * Sources: verified Job Harness primary ResumeLibrary plus current
 * MemoFlow / BodySense / ForgeFlow repository facts (2026-10-11).
 * PREVIEW writes no database mutations. COMMIT additively extends the
 * ResumeLibrary and creates new Profiles without modifying existing Profiles.
 *
 * Run inside the Job Harness server container from /app using tsx:
 *   tsx scripts/resume-one-page-v2.mts preview
 *   tsx scripts/resume-one-page-v2.mts commit
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { createResumeApplicationService, resolveResume } from '../packages/resume-application/src/index.ts';
import { validateResumeProfileReferences, ResumeLibrarySchema, ResumeProfileSchema } from '../packages/resume-contracts/src/index.ts';

const mode = process.argv[2] || 'preview';
if (!['preview', 'commit'].includes(mode)) throw new Error('Mode must be preview or commit');
const directory = '/data/resume-v2-staging';
mkdirSync(directory, { recursive: true });
const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
const resume = createResumeApplicationService(store);
const now = new Date().toISOString();
const zh = (text) => ({ 'zh-CN': text });
const V2_ID = 'one-page-v2';
const addons = {
  'dailyuse': {
    presentation: {
      id: V2_ID, name: null,
      description: zh('独立维护的 Web / Electron 多端效能系统，覆盖目标、任务、知识与 AI 工作台；统一应用层、领域接口与 Agent 交互。'),
      stack: zh('Vue 3、TypeScript、Electron、Node.js、PostgreSQL、PowerSync、Nx'),
      role: null,
    },
    highlights: [
      ['v2-cross-host', '跨端业务复用：', 'Web HTTP 与桌面 IPC 共用领域与应用层，统一状态更新、错误处理及业务交互，支持长期迭代。'],
      ['v2-agent-ui', 'AI 工作台交互：', '实现 Agent / 模型 / 权限选择、异步初始化期间草稿保留，以及多业务面板与聊天工作区联动。'],
      ['v2-byoa', '本地 Agent 接入：', '内置 Mastra 与 Codex、Claude Code、Pi Agent 等本地 BYOA Runtime 并存，提供可配置 Agent 实例和授权边界。'],
      ['v2-domain-contracts', '全栈契约：', 'Vue / Electron 共享业务 contracts，Express API 承接数据操作，结合 PostgreSQL / PowerSync 保持多端状态一致。'],
    ],
  },
  'body-sense': {
    presentation: {
      id: V2_ID, name: null,
      description: zh('持续开发的体态健康 AI 助手，以长程咨询、可修正 BodyState、知识引用与训练反馈构成可追溯业务闭环。'),
      stack: zh('React 19、TypeScript、Go / Gin、Python / FastAPI、LangGraph、PostgreSQL / pgvector、SSE'),
      role: null,
    },
    highlights: [
      ['v2-react-stream', '流式 AI 交互：', '用 SSE 与 reducer 分段渲染 token、工具调用、引用与人审状态，生成期间仍可操作会话与业务面板。'],
      ['v2-react-state', '复杂状态分层：', '以 TanStack Query 管理 Server State，独立管理流式 Run 和布局状态，减少多轮对话中的状态漂移。'],
      ['v2-service-boundary', '多服务职责：', 'React 负责交互、Go 维护会话与长期业务数据、Python 编排 Agent；用稳定 SSE 事件连接业务与推理状态。'],
      ['v2-body-state', '可修正长期状态：', '将症状、观察与反馈建模为有版本的 BodyState，分析与治疗引用具体状态版本，支持后续修正和回溯。'],
      ['v2-agent-recovery', '可恢复工作流：', '基于 LangGraph checkpoint 持久化 thread，结合 interrupt / resume 完成多轮追问、工具调用与人工确认。'],
      ['v2-rag-eval', '证据与评测：', '以 ASR、Embedding、pgvector 构建可溯源检索，结合风险拦截、引用核查与离线回放评估建议质量。'],
    ],
  },
  'forgeflow-pi': {
    presentation: {
      id: V2_ID, name: null,
      description: zh('基于 Pi Agent / pi-subagents 的轻量软件工程治理扩展，复用原生子 Agent 与审查能力，仅保留角色策略和确定性质量约束。'),
      stack: zh('Pi Agent、pi-subagents、TypeScript、TypeBox、LiteLLM、Git / CI'),
      role: null,
    },
    highlights: [
      ['v2-pi-roles', 'Pi 原生编排：', '复用 pi-subagents 管理子 Agent 生命周期，将 planner / worker / reviewer 等角色映射到可配置逻辑模型。'],
      ['v2-quality-gate', '工程质量约束：', '通过确定性预检、一工作树单写者及基于当前提交的证据要求，避免额外自研调度层与重复状态真值。'],
      ['v2-model-policy', '模型供给策略：', '将逻辑角色、物理模型与 Provider 供给分层，失败后仅对明确的供给错误进行受控回退。'],
    ],
  },
};

const specs = [
  {
    id: 'ai-frontend-v2', from: 'ai-frontend', name: '前端开发工程师 v2',
    skills: [
      ['frontend-frameworks-v2', '<strong>前端核心：</strong>熟悉 Vue 3、React 19、TypeScript、Pinia / Zustand 与 TanStack Query，能独立交付中后台及复杂交互模块。'],
      ['frontend-state-v2', '<strong>交互与状态：</strong>处理 Server State、缓存失效、乐观更新与 SSE 流式消息，覆盖加载、失败、中断及恢复状态。'],
      ['frontend-engineering-v2', '<strong>工程实践：</strong>熟悉 Vite、Nx / pnpm、Vitest、Playwright、GitHub Actions，具备 Web / Electron 共享应用层实践。'],
    ],
    work: [
      ['biz-dev', '使用 Vue3 + TypeScript 交付 OLP AI Knowledge 前端模块，串联会话生成、知识保存 / 发布、预览和批量管理，并与后端及测试完成联调。'],
      ['tech-debt', '重构 DDCC 文档打印：以原生 DOM 和 CSS Paged Media 替代 html2canvas 截图，处理长表分页、模糊与签批跨页问题。'],
    ],
    projects: [
      {id:'dailyuse', highlights:['v2-cross-host','v2-agent-ui']},
      {id:'body-sense', highlights:['v2-react-stream','v2-react-state']},
    ],
  },
  {
    id: 'ai-fullstack-v2', from: 'ai-fullstack', name: '全栈开发工程师 v2',
    skills: [
      ['fullstack-frontend-v2', '<strong>前端：</strong>Vue 3、React、TypeScript，能交付 Web / Electron 工作台、复杂表单与状态管理模块。'],
      ['fullstack-backend-v2', '<strong>后端与数据：</strong>Node.js / Express、Go / Gin、Python / FastAPI、PostgreSQL、Redis，具备 API、数据建模及跨服务联调实践。'],
      ['fullstack-ai-v2', '<strong>AI 应用：</strong>实践 Agent 工作流、结构化输出、工具调用、RAG、SSE、interrupt / resume 与模型网关集成。'],
      ['fullstack-engineering-v2', '<strong>工程交付：</strong>使用 Nx / pnpm、Docker、Vitest / Playwright、GitHub Actions 组织多服务测试和发布验证。'],
    ],
    work: [
      ['biz-dev-fs', '负责 OLP AI Knowledge 前端交付，打通生成、保存、发布及预览下载等业务流程，参与接口定义、联调和提测。'],
      ['collab-fs', '参与 BigBlueButton React 客户端定制，并排查 Docker 多阶段构建与缓存问题，完成局部构建及验证。'],
    ],
    projects: [
      {id:'body-sense', highlights:['v2-service-boundary','v2-body-state']},
      {id:'dailyuse', highlights:['v2-domain-contracts','v2-byoa']},
    ],
  },
  {
    id: 'ai-agent-app-v2', from: 'ai-agent-app', name: 'Agent 应用开发工程师 v2',
    skills: [
      ['agent-runtime-v2', '<strong>Agent Runtime：</strong>实践 LangGraph / PydanticAI、Pi Agent / pi-subagents 与 Mastra，熟悉工具调用、checkpoint、interrupt / resume 和 HITL。'],
      ['agent-rag-eval-v2', '<strong>RAG / Eval：</strong>以 ASR、Embedding、pgvector 构建可溯源检索链路，实践安全拦截、引用忠实度检查和离线回归。'],
      ['agent-fullstack-v2', '<strong>应用工程：</strong>Python / FastAPI、Go / Gin、TypeScript / React、PostgreSQL 与 LiteLLM；关注结构化校验、失败处理与业务写入边界。'],
    ],
    work: [
      ['ai-knowledge-agent', '在企业 OLP 项目中交付 AI Knowledge 前端，串联会话生成、知识保存 / 发布、预览下载及批量管理，使模型产出可审阅和复用。'],
      ['ai-hitl-agent', '实现 AI Match / Re-match → 用户确认 → 业务更新的交互流程，将模型建议与最终数据写入分离。'],
    ],
    projects: [
      {id:'body-sense', highlights:['v2-agent-recovery','v2-rag-eval']},
      {id:'forgeflow-pi', highlights:['v2-pi-roles','v2-quality-gate']},
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
    if (!project.presentations.some((item) => item.id === V2_ID)) {
      project.presentations.push(addon.presentation);
      changed = true;
    } else {
      const installed = project.presentations.find((item) => item.id === V2_ID);
      if (JSON.stringify(installed) !== JSON.stringify(addon.presentation)) throw new Error('Existing v2 presentation differs: ' + projectId);
    }
    for (const [id, label, detail] of addon.highlights) {
      const expected = { id, label: zh(label), detail: zh(detail) };
      const installed = project.highlights.find((item) => item.id === id);
      if (!installed) { project.highlights.push(expected); changed = true; }
      else if (JSON.stringify(installed) !== JSON.stringify(expected)) throw new Error('Existing v2 highlight differs: ' + projectId + '/' + id);
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
    description: zh('2026 届 ' + spec.name + '，A4 单页实验版本。'),
    onlineUrl: null,
    pdfName: zh('卢楼豪-' + spec.name.replaceAll(' ', '-')),
  };
  profile.positioning = zh(spec.name.replace(' v2', ''));
  profile.layout = { header: 'without-photo', pageSize: 'A4' };
  profile.sectionOrder = ['education', 'skills', 'work', 'projects', 'certificates'];
  profile.educationIds = ['sicau'];
  profile.skillIds = spec.skills.map(([id]) => id);
  profile.workSelections = [{ experienceId: 'krjx', bulletIds: spec.work.map(([id]) => id) }];
  profile.projectSelections = spec.projects.map(({id, highlights}) => ({ projectId:id, presentationId:V2_ID, highlightIds:highlights }));
  profile.certificateIds = ['cet6'];
  profile.summaryIds = [];
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
    const exists = await Promise.all(profiles.map((profile)=>store.getProfile(profile.id)));
    if (exists.some(Boolean)) throw new Error('A v2 profile already exists. Refusing overwrite.');
    if (library.version !== originalLibrary.version) {
      await resume.saveLibrary({ expectedVersion:originalLibrary.version, library });
      console.log('LIBRARY_VERSION ' + library.version);
    }
    await store.transaction(async tx => {
      for (const profile of profiles) {
        if (await tx.getProfile(profile.id)) throw new Error('Profile already exists: ' + profile.id);
        if (validateResumeProfileReferences(library, profile).length) throw new Error('Invalid profile ' + profile.id);
        resolveResume(library, profile);
        await tx.upsertProfile(profile);
      }
    });
    for (const profile of profiles) console.log('CREATED ' + profile.id);
  }
} finally {
  store.close();
}
