/**
 * Additive job-harness authoring: Resume V5 (2026-10-14).
 * JD-driven skills / project intros / highlights (docs/resume/2026-10-14-v5-roles.md),
 * written per docs/resume/2026-10-14-writing-norms.md. New candidate-pool
 * entities only: 14 SkillBlocks (v5-*), 24 ProjectHighlights (v5-*),
 * 8 ProjectPresentations (one-page-v5-*), 4 Profiles (*-v5). Nothing existing
 * is modified; internship bullets are copied from the v4.1 source Profiles.
 *
 * Execute in the running Server container (/app):
 *   node_modules/.bin/tsx scripts/resume-v5-roles.mts check|preview|commit|publish
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { renderResumeHtml } from '../packages/resume-renderer/src/index.ts';
import {
  ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences,
} from '../packages/resume-contracts/src/index.ts';
import { auditV2xFoundation } from './resume-v2x-foundation-policy.ts';

const MODE = process.argv[2] ?? 'check';
if (!['check', 'preview', 'commit', 'publish'].includes(MODE)) throw new Error('Expected check | preview | commit | publish');
const BASE_LIBRARY_VERSION = 12;
const ROOT = process.env.RESUME_V5_STAGING || '/data/resume-v5-roles-staging';
const EXPORT_DIR = process.env.RESUME_V5_EXPORT || '/data/resumes-v5';
const API = process.env.JOB_HARNESS_API || 'http://127.0.0.1:3000/api/v1';
const zh = (s: string) => ({ 'zh-CN': s });
const now = new Date().toISOString();
mkdirSync(ROOT, { recursive: true });
type ProjectId = 'dailyuse' | 'body-sense';
const NAMES: Record<ProjectId, string> = { dailyuse: '知行 MemoFlow', 'body-sense': '体悟 BodySense' };
const ROLE_LINE = '独立开发（个人项目）';

// ---- SkillBlocks ----------------------------------------------------------
const SKILLS: Record<string, string> = {
  'v5-fe-base': '<strong>前端基础：</strong>熟悉 JavaScript（ES6+）、TypeScript、HTML5/CSS3，理解闭包、原型链与事件循环。',
  'v5-fe-framework': '<strong>框架与组件化：</strong>熟悉 Vue 3 / Pinia、React Hooks，基于 shadcn-vue 封装业务组件；了解微信小程序。',
  'v5-fe-perf': '<strong>状态与性能：</strong>熟悉 TanStack Query 与 Pinia / Zustand，实践虚拟列表、路由懒加载、按需渲染。',
  'v5-fe-eng': '<strong>工程化：</strong>熟悉 Vite、pnpm / Nx、ESLint，使用 Vitest、Playwright、GitHub Actions 做 CI 回归。',
  'v5-fs-frontend': '<strong>前端：</strong>熟悉 JavaScript（ES6+）、TypeScript、Vue 3 / Pinia、React Hooks，实现 AI 工作台与 SSE 流式 UI。',
  'v5-fs-backend': '<strong>后端：</strong>熟悉 Node.js（Express 5）、Go（Gin / GORM），使用 Python（FastAPI），实践 RESTful API 设计。',
  'v5-fs-data': '<strong>数据：</strong>熟悉 PostgreSQL / Prisma 数据建模、事务与行锁，使用 Redis、pgvector，实践幂等写入。',
  'v5-fs-backend-data': '<strong>后端与数据：</strong>熟悉 Node.js（Express 5）、Go（Gin / GORM），使用 Python（FastAPI）、PostgreSQL / Prisma、Redis，实践 RESTful API、OpenAPI 契约与幂等写入。',
  'v5-fs-ai': '<strong>AI 应用：</strong>基于 Mastra / LangGraph 实现工具调用、人工确认与可恢复工作流，通过 MCP 向外部 Agent 开放业务能力。',
  'v5-fs-eng-ai': '<strong>工程与 AI 编程：</strong>使用 Docker、Nx、GitHub Actions 实践按改动范围的 CI；日常用 Claude Code / Codex 重构与生成测试，产出经 diff 评审与测试验证。',
  'v5-ag-orch': '<strong>Agent 编排：</strong>熟悉 Python、LangGraph（Postgres 检查点、interrupt / resume）与 Mastra Workflow，实现多节点对话图、追问续跑与人工审核。',
  'v5-ag-tools': '<strong>工具调用：</strong>熟悉 Function Calling 与 MCP，使用 PydanticAI 类型化输出、Zod Schema 约束工具参数，实践工具白名单、分级审批与默认拒绝。',
  'v5-ag-rag': '<strong>RAG 与记忆：</strong>使用 Embedding + pgvector 实现已审核知识检索、重排与引用归因；设计带来源与有效期的长期记忆，按 token 预算组装上下文。',
  'v5-ag-eval': '<strong>Prompt 与评测：</strong>将 Prompt / 工具 / Schema 版本化为不可变配置，以 Pydantic Evals 离线评测与影子 / 金丝雀灰度管理变更；日常用 Claude Code / Codex 辅助开发，产出经 diff 评审与测试验证。',
};

// ---- ProjectHighlights (candidate pool; Profiles select two per project) ----
type H = readonly [id: string, label: string, detail: string];
const HL: Record<ProjectId, H[]> = {
  dailyuse: [
    ['v5-mf-agent-stream', '流式 Agent 交互：', '设计判别联合的 Agent 事件流，增量渲染文本、工具审批与追问卡片，支持中止和刷新后恢复待审批任务，并以 Playwright E2E 覆盖。'],
    ['v5-mf-hitl-form', '人机协同编辑：', 'AI 以类型化语义动作逐步填写原生目标表单，结合 fencing 租约与用户接管，阻止过期的 AI 写入覆盖人工编辑。'],
    ['v5-mf-list-perf', '列表性能：', '为 Electron 本地知识库引入虚拟列表与按文件身份失效的内容缓存，万篇文档重复搜索不再重复读取正文。'],
    ['v5-mf-query-adapter', '缓存与双端适配：', '抽象 Web HTTP / Electron IPC 双端适配，在试点模块统一 TanStack Query 缓存失效调度，同轮合并、去重重复刷新。'],
    ['v5-mf-durable-write', '可恢复写入：', '用 Mastra 持久化工作流串联审核与提交，以确定性实体 ID 作幂等键，进程崩溃或部分失败后只补做缺失操作。'],
    ['v5-mf-mcp-gateway', 'MCP 网关：', '基于 MCP 与 OAuth scope 向外部 Agent 开放 6 个只读业务工具，每次调用二次校验权限，并记录审计、限制请求预算。'],
    ['v5-mf-powersync', '本地优先同步：', '重构 PowerSync 连接生命周期，离线保留本地库、切换账户后释放全部 Worker；上行 CRUD 批量在单个 Prisma 事务中应用。'],
    ['v5-mf-contracts', '契约分层：', '用 Nx 共享 Zod 契约，同一用例同时暴露 HTTP 路由与 Electron IPC，并以架构边界测试阻止跨层依赖。'],
    ['v5-mf-hitl-workflow', '人在回路工作流：', '基于 Mastra suspend / resume 串联澄清、人工审核与业务写入，确定性 ID 保证重试幂等，部分失败可选择重试或接受部分结果。'],
    ['v5-mf-tool-policy', '工具治理：', '工具按只读 / 修改 / 执行分级审批，未分类工具默认拒绝，并接入原生 ask_user 与 MCP 限权网关。'],
    ['v5-mf-semantic-actions', '语义动作：', '定义 Zod 校验的目标语义动作工具，按 actionId 去重并拒绝陈旧 revision，避免重复或乱序的工具调用产生重复写入。'],
    ['v5-mf-context', '上下文工程：', '实现分区 token 预算的上下文组装器，低信任内容不提升优先级，并对密钥脱敏、为检索内容加防注入约束。'],
  ],
  'body-sense': [
    ['v5-bs-gpu-picking', '三维人体拾取：', '基于 GPU 颜色 ID 离屏渲染与深度测试拾取可见人体区域，支持点选、框选与画笔标注，配合按需渲染控制开销。'],
    ['v5-bs-resumable-stream', '可恢复流式对话：', 'SSE 事件经 JSON Schema 校验后由 reducer 增量渲染，网络中断时按事件序号补拉，API 重启后对话可继续。'],
    ['v5-bs-hitl-cards', '交互卡片：', '把 Agent 追问、工具调用、风险提示与失败 / 取消状态投影为可交互卡片，用户回答后续跑同一次运行。'],
    ['v5-bs-durable-runtime', '可恢复运行时：', 'Agent 运行事件在事务内按序号落库、支持断点重放，租约心跳与 CAS 终态回收失联任务，避免多实例重复执行。'],
    ['v5-bs-contract-first', '契约优先：', '以 OpenAPI / Protobuf 维护契约并生成代码，CI 做破坏性变更与变异检查，Go / Python / Web 共 1500+ 测试。'],
    ['v5-bs-temporal-model', '时态数据模型：', '设计 BodyState 事实模型，记录来源与有效期，以替代链和不可变修订保留完整变更历史。'],
    ['v5-bs-rollout-go', '灰度发布：', '在 Go 侧实现 Agent 冠军 / 影子 / 金丝雀三阶段灰度，按 SHA-256 加盐稳定分流，可回滚到历史配置。'],
    ['v5-bs-config-release', 'Agent 工程化：', '将 Prompt / 工具 / Schema 版本化为不可变配置，离线评测非劣后经影子 / 金丝雀灰度晋级，并完成预发回滚演练。'],
    ['v5-bs-langgraph', '人在回路编排：', '用 LangGraph 编排 8 节点对话图，interrupt 与 Postgres 检查点实现追问后续跑，续跑时校验配置版本。'],
    ['v5-bs-rag', '证据检索：', '实现 pgvector 证据检索，仅检索已审核知识，以词法门控过滤高余弦误召回后重排，回答附引用归因。'],
    ['v5-bs-guardrail', '安全护栏：', '在 LLM 前置风险信号检测节点，按版本迭代否定语义规则并受回归集约束，含糊表述按阳性保守处理。'],
    ['v5-bs-structured-output', '结构化输出：', '用 PydanticAI 类型化输出与工具注册 / 参数校验执行器约束 LLM 工具调用，未知工具和缺参调用直接拒绝。'],
  ],
};

// ---- Profiles ----------------------------------------------------------------
type Pres = { description: string; stack: string; highlights: [string, string] };
interface Spec {
  id: string; from: string; fromVersion: number; role: string; presentationId: string;
  tech: string; skills: [string, string, string, string];
  order: [ProjectId, ProjectId]; projects: Record<ProjectId, Pres>;
}
const MF = {
  fe: 'AI 原生个人效率平台（Vue 3 Web + Electron 桌面端），AI 对话可实时驱动目标、任务、知识库等原生界面，经用户审核后写入。',
  fs: 'AI 原生个人效率平台，Nx monorepo 覆盖 Vue / Electron 客户端、Express + PostgreSQL 服务与 PowerSync 本地优先同步，AI 写入经持久化工作流审核后提交。',
  agent: 'AI 原生个人效率平台，Agent 通过类型化业务工具把对话意图转为可审核、可恢复的目标 / 任务 / 知识写入，并经 MCP 向外部 Agent 开放只读能力。',
};
const BS = {
  fe: '以 Agent 持续理解个人身体状况的应用，用户在 3D 人体上点选 / 框选部位并用自然语言描述，流式对话实时呈现追问、工具调用与引用，断线后自动恢复。',
  fs: '以 Agent 持续理解个人身体状况的应用，React 前端、Go 业务 API 与 Python Agent 服务按 OpenAPI / Protobuf 契约分层，长期身体状态以时态模型记录、可追溯。',
  aifs: '以 Agent 持续理解个人身体状况的应用，React + 3D 人体前端、Go 业务 API 与 Python LangGraph Agent 服务按契约分层，Agent 配置经离线评测与灰度晋级。',
  agent: '以 Agent 持续理解个人身体状况的应用，LangGraph 编排可中断的多轮对话，pgvector 证据检索与安全护栏约束输出，Agent 配置经离线评测与灰度晋级。',
};
const specs: Spec[] = [
  {
    id: 'ai-frontend-v5', from: 'ai-frontend-v4-1', fromVersion: 3, role: '前端开发工程师', presentationId: 'one-page-v5-fe',
    tech: 'Vue 3 / React / TypeScript，具备 AI 人机协同界面、列表性能优化、Three.js GPU 拾取与可恢复 SSE 交互项目经验。',
    skills: ['v5-fe-base', 'v5-fe-framework', 'v5-fe-perf', 'v5-fe-eng'], order: ['dailyuse', 'body-sense'],
    projects: {
      dailyuse: { description: MF.fe, stack: 'Vue 3、TypeScript、Electron、Pinia、TanStack Query、shadcn-vue、Vitest、Playwright', highlights: ['v5-mf-hitl-form', 'v5-mf-list-perf'] },
      'body-sense': { description: BS.fe, stack: 'React 19、TypeScript、React Three Fiber、Three.js、Zustand、TanStack Query、SSE、Vitest', highlights: ['v5-bs-gpu-picking', 'v5-bs-resumable-stream'] },
    },
  },
  {
    id: 'ai-fullstack-v5', from: 'ai-fullstack-v4-1', fromVersion: 1, role: '全栈开发工程师', presentationId: 'one-page-v5-fs',
    tech: 'Vue 3 / React、Node.js / Go / Python、PostgreSQL，具备幂等写入、MCP 网关、可恢复运行时与契约优先实践。',
    skills: ['v5-fs-frontend', 'v5-fs-backend', 'v5-fs-data', 'v5-fs-eng-ai'], order: ['dailyuse', 'body-sense'],
    projects: {
      dailyuse: { description: MF.fs, stack: 'TypeScript、Vue 3、Electron、Express 5、Prisma、PostgreSQL、PowerSync、Mastra、Nx', highlights: ['v5-mf-durable-write', 'v5-mf-mcp-gateway'] },
      'body-sense': { description: BS.fs, stack: 'React 19、Go（Gin / GORM）、Python（FastAPI）、PostgreSQL、pgvector、Redis、OpenAPI、Protobuf', highlights: ['v5-bs-durable-runtime', 'v5-bs-contract-first'] },
    },
  },
  {
    id: 'ai-fullstack-agent-v5', from: 'ai-fullstack-agent-v4-1', fromVersion: 1, role: 'AI 全栈开发工程师', presentationId: 'one-page-v5-ai-fs',
    tech: 'Vue 3 / React、Node.js / Go / Python、PostgreSQL 与 Mastra / LangGraph，覆盖 AI 交互、业务数据与 Agent 工程。',
    skills: ['v5-fs-frontend', 'v5-fs-backend-data', 'v5-fs-ai', 'v5-fs-eng-ai'], order: ['dailyuse', 'body-sense'],
    projects: {
      dailyuse: { description: MF.fs, stack: 'TypeScript、Vue 3、Electron、Express 5、PostgreSQL、PowerSync、Mastra、MCP', highlights: ['v5-mf-durable-write', 'v5-mf-agent-stream'] },
      'body-sense': { description: BS.aifs, stack: 'React 19、Three.js、Go、Python、LangGraph、PostgreSQL + pgvector、OpenAPI、Docker', highlights: ['v5-bs-gpu-picking', 'v5-bs-config-release'] },
    },
  },
  {
    id: 'ai-agent-app-v5', from: 'ai-agent-app-v4-1', fromVersion: 1, role: 'AI Agent 应用开发工程师', presentationId: 'one-page-v5-agent',
    tech: 'Python / LangGraph / Mastra、Function Calling / MCP、pgvector RAG、Pydantic Evals，实践人工确认、评测门禁与工具治理。',
    skills: ['v5-ag-orch', 'v5-ag-tools', 'v5-ag-rag', 'v5-ag-eval'], order: ['body-sense', 'dailyuse'],
    projects: {
      'body-sense': { description: BS.agent, stack: 'Python、LangGraph、PydanticAI、Pydantic Evals、LiteLLM、pgvector、FastAPI、Go', highlights: ['v5-bs-config-release', 'v5-bs-rag'] },
      dailyuse: { description: MF.agent, stack: 'TypeScript、Mastra（Workflow / Agent / Memory）、MCP、OAuth 2.0、Zod、PostgreSQL、Vue 3、Electron', highlights: ['v5-mf-hitl-workflow', 'v5-mf-tool-policy'] },
    },
  },
];
const PROFILE_IDS = specs.map(s => s.id);
const PRESENTATION_IDS = [...new Set(specs.map(s => s.presentationId))];
const HIGHLIGHT_IDS = [...HL.dailyuse, ...HL['body-sense']].map(h => h[0]);

function assembleLibrary(original: any) {
  const library = structuredClone(original);
  for (const id of Object.keys(SKILLS)) if (library.skills.some((s: any) => s.id === id)) throw new Error('Skill exists: ' + id);
  for (const [id, text] of Object.entries(SKILLS)) library.skills.push({ id, label: null, content: zh(text), keywords: [] });
  for (const projectId of ['dailyuse', 'body-sense'] as ProjectId[]) {
    const project = library.projects.find((p: any) => p.id === projectId);
    if (!project) throw new Error('Project missing ' + projectId);
    for (const [id] of HL[projectId]) if (project.highlights.some((h: any) => h.id === id)) throw new Error('Highlight exists: ' + id);
    for (const [id, label, detail] of HL[projectId]) project.highlights.push({ id, label: zh(label), detail: zh(detail) });
    for (const spec of specs) {
      if (project.presentations.some((p: any) => p.id === spec.presentationId)) throw new Error('Presentation exists: ' + spec.presentationId);
      const pres = spec.projects[projectId];
      project.presentations.push({
        id: spec.presentationId, name: zh(NAMES[projectId]), description: zh(pres.description), stack: zh(pres.stack), role: zh(ROLE_LINE),
      });
    }
  }
  library.version = original.version + 1;
  library.updatedAt = now;
  return ResumeLibrarySchema.parse(library);
}

function assembleProfile(base: any, spec: Spec) {
  const p = structuredClone(base);
  const name = spec.role + ' v5';
  p.id = spec.id;
  p.version = 1;
  p.name = zh(name);
  p.targetRole = zh(spec.role);
  p.positioning = zh(spec.role + '｜2026届本科毕业生');
  p.output = {
    documentTitle: zh('卢楼豪 - ' + name),
    description: zh('2026届本科毕业生，' + spec.role + '方向。' + spec.tech),
    onlineUrl: null,
    pdfName: zh('卢楼豪-' + spec.role.replaceAll(' ', '') + '-v5'),
  };
  p.skillIds = [...spec.skills];
  p.projectSelections = spec.order.map(projectId => ({
    projectId, presentationId: spec.presentationId, highlightIds: [...spec.projects[projectId].highlights],
  }));
  // Keep internship selections and their confirmed v4.1 wording; skills and
  // highlights now come from new Library entities, so their overrides go.
  p.overrides = p.overrides.filter((o: any) => o.kind === 'work-bullet');
  p.createdAt = now;
  p.updatedAt = now;
  p.archivedAt = null;
  return ResumeProfileSchema.parse(p);
}

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: { authorization: 'Bearer ' + process.env.JOB_HARNESS_AUTH_TOKEN, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${(await response.text()).slice(0, 500)}`);
  return response;
}
// Preview payload stays under Express' 100kb limit: keep only what this Profile
// references and assert the resolved document is identical to the full Library.
function previewLibraryFor(library: any, profile: any) {
  const pruned = structuredClone(library);
  pruned.skills = pruned.skills.filter((s: any) => profile.skillIds.includes(s.id));
  for (const project of pruned.projects) {
    const sel = profile.projectSelections.find((s: any) => s.projectId === project.id);
    project.presentations = sel ? project.presentations.filter((x: any) => x.id === sel.presentationId) : project.presentations.slice(0, 1);
    project.highlights = sel ? project.highlights.filter((h: any) => sel.highlightIds.includes(h.id)) : [];
  }
  if (JSON.stringify(resolveResume(pruned, profile)) !== JSON.stringify(resolveResume(library, profile))) {
    throw new Error(profile.id + ': pruned preview Library resolves differently');
  }
  return pruned;
}
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  if (MODE === 'publish') {
    const library = await store.getLibrary('primary');
    if (!library || library.version !== BASE_LIBRARY_VERSION + 1) throw new Error('publish expects Library v' + (BASE_LIBRARY_VERSION + 1));
    mkdirSync(EXPORT_DIR, { recursive: true });
    const results: any[] = [];
    for (const spec of specs) {
      const profile = await store.getProfile(spec.id);
      if (!profile) throw new Error('Profile not committed: ' + spec.id);
      const rev = await (await api(`/resume/profiles/${encodeURIComponent(spec.id)}/revisions`, {
        method: 'POST',
        body: JSON.stringify({ expectedProfileVersion: profile.version, expectedLibraryVersion: library.version, note: 'Resume v5 JD-driven role edition (2026-10-14)' }),
      })).json();
      const revisionId = rev.revision.id;
      const art = await (await api(`/resume/revisions/${encodeURIComponent(revisionId)}/artifacts`, { method: 'POST', body: JSON.stringify({ kind: 'pdf' }) })).json();
      const artifactId = art.artifact.id;
      const bytes = new Uint8Array(await (await api(`/resume/artifacts/${encodeURIComponent(artifactId)}/content`)).arrayBuffer());
      const target = join(EXPORT_DIR, profile.output.pdfName['zh-CN'] + '.pdf');
      if (existsSync(target) && sha256(readFileSync(target)) !== sha256(bytes)) throw new Error('Refusing to overwrite different export ' + target);
      writeFileSync(target, bytes);
      if (sha256(readFileSync(target)) !== sha256(bytes)) throw new Error('Export mismatch ' + target);
      results.push({ profileId: spec.id, revisionId, revisionReused: rev.reused, artifactId, artifactReused: art.reused, sha256: sha256(bytes), bytes: bytes.length, export: target });
    }
    writeFileSync(join(ROOT, 'publish.json'), JSON.stringify(results, null, 2));
    console.log('PUBLISHED', JSON.stringify(results, null, 2));
  } else {
    const original = await store.getLibrary('primary');
    if (!original || original.version !== BASE_LIBRARY_VERSION) throw new Error(`Baseline changed: expected Library v${BASE_LIBRARY_VERSION}, found v${original?.version}`);
    for (const id of PROFILE_IDS) if (await store.getProfile(id)) throw new Error('Target exists: ' + id);
    const bases = await Promise.all(specs.map(s => store.getProfile(s.from)));
    bases.forEach((b, i) => {
      if (!b || b.archivedAt || b.version !== specs[i]!.fromVersion) throw new Error('Source moved: ' + specs[i]!.from);
    });
    const allBefore = await store.listProfiles({ includeArchived: true });
    const library = assembleLibrary(original);
    const profiles = specs.map((s, i) => assembleProfile(bases[i], s));

    // Every previously resolvable Profile must resolve identically.
    let preserved = 0;
    for (const old of allBefore) {
      let before: any;
      try { before = resolveResume(original, old); } catch { continue; }
      assert.deepStrictEqual(resolveResume(library, old), { ...before, libraryVersion: library.version }, 'changed: ' + old.id);
      preserved++;
    }
    for (const [i, profile] of profiles.entries()) {
      const spec = specs[i]!;
      const errs = validateResumeProfileReferences(library, profile);
      if (errs.length) throw new Error(profile.id + ' refs ' + JSON.stringify(errs));
      const resolved = resolveResume(library, profile);
      const report = auditV2xFoundation(profile, resolved);
      assert.deepStrictEqual(report.errors, [], profile.id + ' ' + JSON.stringify(report.errors));
      assert.deepStrictEqual(report.warnings, [], profile.id + ' ' + JSON.stringify(report.warnings));
      assert.deepStrictEqual(resolved.projects.map((p: any) => p.name), spec.order.map(id => NAMES[id]));
      const before = resolveResume(original, bases[i]!);
      assert.deepStrictEqual(resolved.workExperiences, before.workExperiences);
      assert.deepStrictEqual(resolved.education, before.education);
      assert.deepStrictEqual(resolved.certificates, before.certificates);
      const html = renderResumeHtml(resolved);
      assert.ok(!/精通|已上线|准确率|向量 ?RAG|混合检索|Langfuse|OpenTelemetry|沙箱/u.test(html), profile.id + ': forbidden wording');
      writeFileSync(join(ROOT, profile.id + '.resolved.json'), JSON.stringify(resolved, null, 2));
    }
    if (MODE === 'check') {
      console.log('CHECK_OK', JSON.stringify({ library: `${original.version}->${library.version}`, profiles: PROFILE_IDS, preserved,
        newSkills: Object.keys(SKILLS).length, newHighlights: HIGHLIGHT_IDS.length, newPresentations: PRESENTATION_IDS.length * 2 }));
    } else if (MODE === 'preview') {
      for (const profile of profiles) {
        const r = await api('/resume/preview/pdf', { method: 'POST', body: JSON.stringify({ library: previewLibraryFor(library, profile), profile }) });
        const bytes = Buffer.from(await r.arrayBuffer());
        writeFileSync(join(ROOT, profile.id + '.pdf'), bytes);
        console.log('PREVIEW_OK', profile.id, bytes.length);
      }
    } else {
      await store.transaction(async (tx: any) => {
        const live = await tx.getLibrary('primary');
        if (!live || JSON.stringify(live) !== JSON.stringify(original)) throw new Error('Library changed; aborting');
        for (const base of bases) {
          const cur = await tx.getProfile(base!.id);
          if (!cur || JSON.stringify(cur) !== JSON.stringify(base)) throw new Error('Source changed: ' + base!.id);
        }
        for (const profile of profiles) if (await tx.getProfile(profile.id)) throw new Error('Duplicate ' + profile.id);
        await tx.upsertLibrary(library);
        for (const profile of profiles) await tx.upsertProfile(profile);
      });
      console.log('COMMITTED', JSON.stringify({ library: library.version, profiles: PROFILE_IDS }));
    }
  }
} finally {
  store.close();
}
