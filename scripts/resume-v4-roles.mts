/**
 * Resume V4 · four role-targeted one-page Profiles (additive, 2026-10-14).
 *
 * New Profiles (never overwrite anything):
 *   ai-frontend-v4          前端开发工程师          (base: ai-frontend-v2-2, latest version)
 *   ai-fullstack-v4         全栈开发工程师          (base: ai-fullstack-v3)
 *   ai-agent-app-v4         AI Agent 应用开发工程师 (base: ai-agent-app-v3, projects BodySense + MemoFlow)
 *   ai-fullstack-agent-v4   AI 全栈开发工程师       (base: ai-fullstack-v3)
 *
 * Library additions: per-Profile presentation IDs `one-page-v4-*` on the two
 * existing projects (dailyuse = MemoFlow, body-sense = BodySense) plus new,
 * uniquely identified `v4-*` highlights. No existing presentation, highlight,
 * Profile, Revision, Artifact, Application or Campaign is modified.
 *
 * Facts come from MemoFlow origin/main 49970ca36aa and BodySense origin/main
 * 80fdfcd27 (see docs/resume/2026-10-14-v4-roles.md). Internship, education,
 * certificate, skills and header contact data are reused unchanged.
 *
 * Run INSIDE the Job Harness server container from /app:
 *   node_modules/.bin/tsx scripts/resume-v4-roles.mts check    # read-only, no render
 *   node_modules/.bin/tsx scripts/resume-v4-roles.mts preview  # read-only, official preview PDFs
 *   node_modules/.bin/tsx scripts/resume-v4-roles.mts commit   # one SQLite transaction, once
 *   node_modules/.bin/tsx scripts/resume-v4-roles.mts publish  # first-party Revision + PDF Artifact + export
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import {
  ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences,
} from '../packages/resume-contracts/src/index.ts';

const MODE = process.argv[2] ?? 'preview';
if (!['check', 'preview', 'commit', 'publish'].includes(MODE)) {
  throw new Error('Expected check | preview | commit | publish');
}
const ROOT = process.env.RESUME_V4_STAGING || '/data/resume-v4-roles-staging';
const EXPORT_DIR = process.env.RESUME_V4_EXPORT || '/data/resumes-v4';
const API = process.env.JOB_HARNESS_API || 'http://127.0.0.1:3000/api/v1';
const COHORT = '｜2026届本科毕业生';
const zh = (s: string) => ({ 'zh-CN': s });
const now = new Date().toISOString();
mkdirSync(ROOT, { recursive: true });

type H = readonly [id: string, label: string, detail: string];

// ---- Shared v4 highlight entities (unique, new IDs) -------------------------
const HL: Record<'dailyuse' | 'body-sense', H[]> = {
  dailyuse: [
    ['v4-memoflow-agent-stream', '流式 Agent 交互：', '设计类型化 Agent 事件流与增量渲染，支持工具审批、追问、中止及刷新后恢复待审批状态。'],
    ['v4-memoflow-hitl-form', '人机协同编辑：', 'AI 以语义动作逐步填写原生目标表单，配合 fencing 租约防止人与 AI 并发写入冲突。'],
    ['v4-memoflow-durable-write', '可恢复写入链路：', 'Mastra 持久化工作流串联审核与提交，确定性 ID 使重试幂等，部分失败只补做缺失操作。'],
    ['v4-memoflow-mcp-gateway', 'MCP 开放接口：', '基于 MCP + OAuth scope 向外部 Agent 开放 6 个只读业务工具，含权限校验、审计与限流。'],
    ['v4-memoflow-durable-workflow', '持久化工作流：', 'Mastra suspend/resume 支撑澄清、审核与续跑，确定性 ID 保证重试幂等、部分失败只补缺。'],
    ['v4-memoflow-tool-governance', '工具治理：', '工具白名单与读/改/执行分级审批，未分类工具默认拒绝；接入原生 ask_user 与 MCP 外部网关。'],
  ],
  'body-sense': [
    ['v4-bodysense-gpu-picking', '三维人体拾取：', '基于 GPU 颜色 ID 离屏渲染实现可见面点选/框选/画笔，按需渲染与实例化绘制控制开销。'],
    ['v4-bodysense-resumable-stream', '可恢复流式对话：', 'SSE 事件经 JSON Schema 契约校验，按序号断线补拉，reducer 增量渲染追问与工具卡片。'],
    ['v4-bodysense-durable-runtime', '可恢复运行时：', 'Agent 运行事件按序号事务落库、可断点重放，租约心跳 + CAS 回收崩溃任务。'],
    ['v4-bodysense-contract-first', '契约优先：', 'OpenAPI / Protobuf 生成多端代码，CI 执行破坏性变更与变异检查，Go/Python/Web 1500+ 自动化测试。'],
    ['v4-bodysense-agent-config-release', 'Agent 工程化：', '将 Prompt/工具/Schema 版本化为不可变配置，评测非劣后经影子/金丝雀灰度晋级，可回滚。'],
    ['v4-bodysense-hitl-graph', '人在回路编排：', 'LangGraph 8 节点对话图，interrupt + Postgres 检查点实现追问后续跑，前置红旗检测护栏。'],
  ],
};

// ---- Per-Profile presentations ---------------------------------------------
type Pres = { description: string; stack: string; role: string; highlights: [string, string] };
type Spec = {
  id: string; from: string; fromVersion: number; role: string; presentationId: string;
  order: Array<'dailyuse' | 'body-sense'>;
  projects: Record<'dailyuse' | 'body-sense', Pres>;
};
const MEMO_NAME = 'MemoFlow';
const BODY_NAME = 'BodySense';
const MEMO_FS_DESC = 'AI 原生个人效率平台，Nx monorepo 覆盖 Vue/Electron 客户端、Express + PostgreSQL 服务与 PowerSync 本地优先同步。';

const specs: Spec[] = [
  {
    id: 'ai-frontend-v4', from: 'ai-frontend-v2-2', fromVersion: 6, role: '前端开发工程师',
    presentationId: 'one-page-v4-fe', order: ['body-sense', 'dailyuse'],
    projects: {
      'body-sense': {
        description: '以 Agent 持续理解个人身体状况的应用：在 3D 人体上框选/画笔标注部位并用自然语言描述，流式对话呈现追问、工具调用与引用。',
        stack: 'React 19、TypeScript、React Three Fiber、Three.js、TanStack Query、SSE、Vitest、Playwright',
        role: '个人项目 · React / 3D 前端',
        highlights: ['v4-bodysense-gpu-picking', 'v4-bodysense-resumable-stream'],
      },
      dailyuse: {
        description: 'AI 原生个人效率平台（Vue 3 Web + Electron），AI 对话实时驱动目标、任务、知识等原生业务界面，经用户审核后提交。',
        stack: 'Vue 3、TypeScript、Electron、Pinia、TanStack Query、Zod、Vitest、Playwright',
        role: '个人项目 · 前端开发',
        highlights: ['v4-memoflow-agent-stream', 'v4-memoflow-hitl-form'],
      },
    },
  },
  {
    id: 'ai-fullstack-v4', from: 'ai-fullstack-v3', fromVersion: 1, role: '全栈开发工程师',
    presentationId: 'one-page-v4-fs', order: ['dailyuse', 'body-sense'],
    projects: {
      dailyuse: {
        description: MEMO_FS_DESC,
        stack: 'TypeScript、Vue 3、Electron、Express 5、Prisma、PostgreSQL、PowerSync、Mastra、Nx',
        role: '个人项目 · 全栈开发',
        highlights: ['v4-memoflow-durable-write', 'v4-memoflow-mcp-gateway'],
      },
      'body-sense': {
        description: '以 Agent 持续理解个人身体状况的应用；React 前端、Go 业务 API 与 Python Agent 服务按契约分层，长期身体状态时态建模、可追溯。',
        stack: 'React 19、Go（Gin/GORM）、Python、PostgreSQL + pgvector、OpenAPI 3.1、Protobuf、Docker Compose、GitHub Actions',
        role: '个人项目 · 全栈开发',
        highlights: ['v4-bodysense-durable-runtime', 'v4-bodysense-contract-first'],
      },
    },
  },
  {
    id: 'ai-agent-app-v4', from: 'ai-agent-app-v3', fromVersion: 1, role: 'AI Agent 应用开发工程师',
    presentationId: 'one-page-v4-agent', order: ['body-sense', 'dailyuse'],
    projects: {
      'body-sense': {
        description: '以 Agent 持续理解个人身体状况的应用：LangGraph 编排可中断对话，证据检索与安全护栏约束输出，Agent 配置经评测门禁灰度晋级。',
        stack: 'Python、LangGraph、PydanticAI、Pydantic Evals、LiteLLM、pgvector、FastAPI、Go',
        role: '个人项目 · Agent 应用开发',
        highlights: ['v4-bodysense-agent-config-release', 'v4-bodysense-hitl-graph'],
      },
      dailyuse: {
        description: 'AI 原生个人效率平台：Agent 以类型化业务工具把对话意图变成可审核、可恢复的目标/任务/知识写入，并通过 MCP 开放能力。',
        stack: 'TypeScript、Mastra（Workflow/Agent/Memory）、MCP、OAuth 2.0、Zod、PostgreSQL、Vue 3、Electron',
        role: '个人项目 · Agent 应用开发',
        highlights: ['v4-memoflow-durable-workflow', 'v4-memoflow-tool-governance'],
      },
    },
  },
  {
    id: 'ai-fullstack-agent-v4', from: 'ai-fullstack-v3', fromVersion: 1, role: 'AI 全栈开发工程师',
    presentationId: 'one-page-v4-fsa', order: ['dailyuse', 'body-sense'],
    projects: {
      dailyuse: {
        description: MEMO_FS_DESC,
        stack: 'TypeScript、Vue 3、Electron、Express 5、PostgreSQL、PowerSync、Mastra、MCP',
        role: '个人项目 · 全栈开发',
        highlights: ['v4-memoflow-durable-write', 'v4-memoflow-agent-stream'],
      },
      'body-sense': {
        description: '以 Agent 持续理解个人身体状况的应用：React + 3D 人体前端、Go 业务 API、Python LangGraph Agent 按契约分层。',
        stack: 'React 19、Three.js、Go、Python、LangGraph、PostgreSQL + pgvector、OpenAPI、Docker',
        role: '个人项目 · 全栈开发',
        highlights: ['v4-bodysense-durable-runtime', 'v4-bodysense-agent-config-release'],
      },
    },
  },
];

const PRESENTATION_IDS = specs.map(s => s.presentationId);
const HIGHLIGHT_IDS = Object.values(HL).flat().map(([id]) => id);
const PROFILE_IDS = specs.map(s => s.id);

function assertNoCollisions(library: any, profilesExist: (id: string) => boolean) {
  const problems: string[] = [];
  for (const project of library.projects) {
    for (const p of project.presentations) if (PRESENTATION_IDS.includes(p.id)) problems.push(`presentation ${project.id}/${p.id}`);
    for (const h of project.highlights) if (HIGHLIGHT_IDS.includes(h.id)) problems.push(`highlight ${project.id}/${h.id}`);
  }
  for (const id of PROFILE_IDS) if (profilesExist(id)) problems.push(`profile ${id}`);
  if (problems.length) throw new Error('Refusing to overwrite existing v4 entities: ' + problems.join(', '));
}

function assembleLibrary(original: any) {
  const library = structuredClone(original);
  for (const projectId of ['dailyuse', 'body-sense'] as const) {
    const project = library.projects.find((p: any) => p.id === projectId);
    if (!project) throw new Error('Missing canonical project ' + projectId);
    for (const spec of specs) {
      const pres = spec.projects[projectId];
      project.presentations.push({
        id: spec.presentationId,
        name: zh(projectId === 'dailyuse' ? MEMO_NAME : BODY_NAME),
        description: zh(pres.description),
        stack: zh(pres.stack),
        role: zh(pres.role),
      });
    }
    for (const [id, label, detail] of HL[projectId]) project.highlights.push({ id, label: zh(label), detail: zh(detail) });
  }
  library.version = original.version + 1;
  library.updatedAt = now;
  return ResumeLibrarySchema.parse(library);
}

function assembleProfile(base: any, spec: Spec) {
  const p = structuredClone(base);
  const name = spec.role + ' v4';
  const fileRole = spec.role.replaceAll(' ', '');
  p.id = spec.id;
  p.version = 1;
  p.name = zh(name);
  p.targetRole = zh(spec.role);
  p.positioning = zh(spec.role + COHORT);
  p.output = {
    documentTitle: zh('卢楼豪 - ' + name),
    description: zh('2026 届本科毕业生 · ' + spec.role + '，A4 单页版本（v4）。'),
    onlineUrl: null,
    pdfName: zh('卢楼豪-' + fileRole + '-v4'),
  };
  p.projectSelections = spec.order.map(projectId => ({
    projectId, presentationId: spec.presentationId, highlightIds: [...spec.projects[projectId].highlights],
  }));
  // Skills, internship bullets, education, certificate and their Profile-local
  // overrides are copied from the source unchanged; only project-highlight
  // overrides (none expected) are dropped because v4 highlights are new entities.
  p.overrides = p.overrides.filter((o: any) => o.kind !== 'project-highlight');
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
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  if (MODE === 'publish') {
    const library = await store.getLibrary('primary');
    if (!library) throw new Error('primary Library missing');
    mkdirSync(EXPORT_DIR, { recursive: true });
    const results: any[] = [];
    for (const spec of specs) {
      const profile = await store.getProfile(spec.id);
      if (!profile) throw new Error('Profile not committed: ' + spec.id);
      const rev = await (await api(`/resume/profiles/${encodeURIComponent(spec.id)}/revisions`, {
        method: 'POST',
        body: JSON.stringify({ expectedProfileVersion: profile.version, expectedLibraryVersion: library.version, note: 'Resume v4 role edition (2026-10-14)' }),
      })).json();
      const revisionId = rev.revision.id;
      const art = await (await api(`/resume/revisions/${encodeURIComponent(revisionId)}/artifacts`, {
        method: 'POST', body: JSON.stringify({ kind: 'pdf' }),
      })).json();
      const artifactId = art.artifact.id;
      const bytes = new Uint8Array(await (await api(`/resume/artifacts/${encodeURIComponent(artifactId)}/content`)).arrayBuffer());
      const fileName = profile.output.pdfName['zh-CN'] + '.pdf';
      const target = join(EXPORT_DIR, fileName);
      if (existsSync(target) && sha256(readFileSync(target)) !== sha256(bytes)) throw new Error('Refusing to overwrite different export ' + target);
      writeFileSync(target, bytes);
      const exported = readFileSync(target);
      if (sha256(exported) !== sha256(bytes)) throw new Error('Export mismatch ' + target);
      results.push({ profileId: spec.id, profileVersion: profile.version, libraryVersion: library.version,
        revisionId, revisionReused: rev.reused, artifactId, artifactReused: art.reused,
        artifactSha256: art.artifact.sha256 ?? null, exportSha256: sha256(exported), bytes: bytes.length, export: target });
    }
    writeFileSync(join(ROOT, 'publish.json'), JSON.stringify(results, null, 2));
    console.log('PUBLISHED', JSON.stringify(results, null, 2));
  } else {
    const originalLibrary = await store.getLibrary('primary');
    if (!originalLibrary) throw new Error('primary ResumeLibrary not found');
    const existing = new Set<string>();
    for (const id of PROFILE_IDS) if (await store.getProfile(id)) existing.add(id);
    assertNoCollisions(originalLibrary, id => existing.has(id));
    const bases = await Promise.all(specs.map(s => store.getProfile(s.from)));
    bases.forEach((b, i) => {
      if (!b || b.archivedAt) throw new Error('Source Profile missing/archived: ' + specs[i].from);
      if (b.version !== specs[i].fromVersion) throw new Error(`Source ${specs[i].from} is v${b.version}, expected v${specs[i].fromVersion}; re-review required`);
    });
    const library = assembleLibrary(originalLibrary);
    const profiles = specs.map((s, i) => assembleProfile(bases[i], s));
    const resolved: Record<string, any> = {};
    for (const profile of profiles) {
      const issues = validateResumeProfileReferences(library, profile);
      if (issues.length) throw new Error(profile.id + ' invalid refs: ' + JSON.stringify(issues));
      const r = resolveResume(library, profile);
      if (r.projects.length !== 2 || r.projects.some((x: any) => x.highlights.length !== 2)) throw new Error(profile.id + ': expected 2 projects x 2 highlights');
      resolved[profile.id] = r;
      writeFileSync(join(ROOT, profile.id + '.resolved.json'), JSON.stringify(r, null, 2));
    }
    writeFileSync(join(ROOT, 'candidate.json'), JSON.stringify({ library, profiles }, null, 2));
    writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify({
      mode: MODE, generatedAt: now, originalLibraryVersion: originalLibrary.version, candidateLibraryVersion: library.version,
      sources: specs.map((s, i) => ({ target: s.id, source: s.from, sourceVersion: bases[i]!.version })),
      newPresentationIds: PRESENTATION_IDS, newHighlightIds: HIGHLIGHT_IDS, expectedPageCount: 1,
    }, null, 2));

    if (MODE === 'check') {
      console.log('CHECK_OK', JSON.stringify({ library: `${originalLibrary.version}->${library.version}`, profiles: PROFILE_IDS }));
    } else if (MODE === 'preview') {
      for (const profile of profiles) {
        const response = await api('/resume/preview/pdf', { method: 'POST', body: JSON.stringify({ library, profile }) });
        const bytes = Buffer.from(await response.arrayBuffer());
        writeFileSync(join(ROOT, profile.id + '.pdf'), bytes);
        console.log('PREVIEW_OK', profile.id, 'PDF_BYTES', bytes.length);
      }
    } else {
      await store.transaction(async (tx: any) => {
        const liveLibrary = await tx.getLibrary('primary');
        if (!liveLibrary || JSON.stringify(liveLibrary) !== JSON.stringify(originalLibrary)) {
          throw new Error('ResumeLibrary changed since candidate preparation; aborting');
        }
        for (const base of bases) {
          const live = await tx.getProfile(base!.id);
          if (!live || JSON.stringify(live) !== JSON.stringify(base)) throw new Error('Source Profile changed: ' + base!.id);
        }
        for (const profile of profiles) {
          if (await tx.getProfile(profile.id)) throw new Error('Duplicate target Profile ' + profile.id);
          if (validateResumeProfileReferences(library, profile).length) throw new Error('Invalid refs at commit ' + profile.id);
        }
        await tx.upsertLibrary(library);
        for (const profile of profiles) await tx.upsertProfile(profile);
      });
      console.log('COMMITTED', JSON.stringify({ library: library.version, profiles: PROFILE_IDS }));
    }
  }
} finally {
  store.close();
}
