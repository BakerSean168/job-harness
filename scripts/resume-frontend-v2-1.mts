/**
 * Frontend v2.1: additive, role-specific Resume Profile based on v2.
 * This is a manually invoked one-off authoring script, not a scheduled publisher.
 * Run inside the Job Harness server container from /app:
 *   tsx scripts/resume-frontend-v2-1.mts preview
 *   tsx scripts/resume-frontend-v2-1.mts commit
 *
 * Preview writes ONLY staging files and requests a PDF from the existing renderer.
 * Commit atomically inserts two versioned project presentations and one new profile.
 * Neither mode alters v1/v2/v3 profiles, applications, campaigns or attachments.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences } from '../packages/resume-contracts/src/index.ts';

const mode = process.argv[2] ?? 'preview';
if (!['preview','commit'].includes(mode)) throw new Error('Use preview or commit');
const ROOT = '/data/resume-frontend-v2-1-staging';
const PROFILE = 'ai-frontend-v2-1';
const SOURCE = 'ai-frontend-v2';
const PRESENTATION = 'one-page-v2-1';
const zh = (s) => ({ 'zh-CN': s });
const now = new Date().toISOString();
mkdirSync(ROOT, {recursive: true});

const specs = {
  skills: [
    ['frontend-foundations-v2', '<strong>JS / TS 基础：</strong>掌握异步编程、事件循环、TypeScript、HTML/CSS 响应式布局及 HTTP、浏览器调试。'],
    ['frontend-frameworks-v2', '<strong>Vue / React：</strong>使用 Vue 3 + TS、React Hooks、TanStack Query、Pinia / Zustand，处理缓存失效和复杂组件状态。'],
    ['frontend-state-v2', '<strong>流式交互：</strong>使用 SSE / reducer 展示文本、工具调用、引用和中断状态，保持生成期间工作台可操作。'],
    ['frontend-engineering-v2', '<strong>原型与工程：</strong>Figma / Penpot 交互原型、组件规范与响应式适配；使用 Vite、Vitest、Playwright、GitHub Actions。'],
  ],
  work: [
    ['biz-dev', '<strong>业务交付：</strong>使用 Vue 3 + TypeScript 开发 AI Knowledge 前端，串联生成、知识发布、预览与批量管理，并参与接口联调。'],
    ['tech-debt', '<strong>打印分页：</strong>针对 html2canvas 长表模糊、签批跨页，改用原生 DOM + CSS Paged Media，通过 break-inside 控制分页。'],
    ['engineering', '<strong>跨页选择：</strong>使用全局选中池和同步标记，解决接口分页后勾选丢失及程序回写误触发 selection-change 的问题。'],
  ],
  presentations: {
    dailyuse: {
      description: 'Vue 3 + Electron 多端工作台，包含目标、任务与 AI 会话，支持业务面板协作。',
      stack: 'Vue 3、TypeScript、Electron、TanStack Query、PowerSync、Nx / pnpm',
    },
    'body-sense': {
      description: 'React 体态健康 AI 工作台，展示流式会话、引用和长期身体状态。',
      stack: 'React 19、TypeScript、TanStack Query、Zustand、SSE、Vitest',
    },
  },
  projectHighlights: [
    ['dailyuse', 'v2-cross-host', 'Web HTTP / Electron IPC 共享前端业务接口，统一查询缓存、错误反馈与状态更新，减少重复实现。'],
    ['dailyuse', 'v2-agent-ui', '基于 Figma 多宽度原型设计 Tab、Agent / 模型选择与空状态，迭代 Vue 组件的草稿保留及面板切换。'],
    ['body-sense', 'v2-react-stream', '以 POST SSE + reducer 增量渲染文本、工具与引用，处理生成中断，保持工作台可操作。'],
    ['body-sense', 'v2-react-state', 'TanStack Query 管理会话 / BodyState 投影，reducer 消费流式 Run，Zustand 管理布局，避免重复状态。'],
  ],
};

const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  const currentLibrary = await store.getLibrary('primary');
  const base = await store.getProfile(SOURCE);
  if (!currentLibrary || !base) throw new Error('Missing ResumeLibrary or source v2 profile');
  if (base.archivedAt !== null) throw new Error('Source v2 profile unexpectedly archived');
  const existing = await store.getProfile(PROFILE);
  if (existing) throw new Error('Refusing to overwrite existing frontend v2.1 profile');

  const library = structuredClone(currentLibrary);
  for (const [projectId, presentation] of Object.entries(specs.presentations)) {
    const project = library.projects.find(p => p.id === projectId);
    if (!project) throw new Error('Missing canonical project ' + projectId);
    if (project.presentations.some(p => p.id === PRESENTATION)) {
      throw new Error('Refusing to overwrite existing presentation: ' + projectId + '/' + PRESENTATION);
    }
    project.presentations.push({
      id: PRESENTATION,
      name: null,
      description: zh(presentation.description),
      stack: zh(presentation.stack),
      role: null,
    });
  }
  library.version = currentLibrary.version + 1;
  library.updatedAt = now;
  const validLibrary = ResumeLibrarySchema.parse(library);

  const draft = structuredClone(base);
  draft.id = PROFILE;
  draft.version = 1;
  draft.name = zh('前端开发工程师 v2.1');
  draft.targetRole = zh('前端开发工程师');
  draft.positioning = zh('前端开发工程师');
  draft.output = {
    documentTitle: zh('卢楼豪 - 前端开发工程师 v2.1'),
    description: zh('前端 v2.1 供校对的 A4 单页草稿；沿用已登记实习信息，实际任职需核对。'),
    onlineUrl: null,
    pdfName: zh('卢楼豪-前端开发工程师-v2.1'),
  };
  draft.layout = { header: 'without-photo', pageSize: 'A4' };
  draft.sectionOrder = ['education', 'skills', 'work', 'projects', 'certificates'];
  draft.educationIds = ['sicau'];
  draft.skillIds = specs.skills.map(([id]) => id);
  draft.workSelections = [{ experienceId: 'krjx', bulletIds: specs.work.map(([id]) => id) }];
  draft.projectSelections = [
    { projectId:'dailyuse', presentationId:PRESENTATION, highlightIds:['v2-cross-host','v2-agent-ui'] },
    { projectId:'body-sense', presentationId:PRESENTATION, highlightIds:['v2-react-stream','v2-react-state'] },
  ];
  draft.certificateIds = ['cet6'];
  draft.summaryIds = [];
  draft.overrides = [
    ...specs.skills.map(([skillId,value])=>({kind:'skill',skillId,value:zh(value)})),
    ...specs.work.map(([bulletId,value])=>({kind:'work-bullet',experienceId:'krjx',bulletId,value:zh(value)})),
    ...specs.projectHighlights.map(([projectId,highlightId,value])=>({kind:'project-highlight',projectId,highlightId,value:zh(value)})),
  ];
  draft.createdAt = now;
  draft.updatedAt = now;
  draft.archivedAt = null;
  const profile = ResumeProfileSchema.parse(draft);
  const issues = validateResumeProfileReferences(validLibrary, profile);
  if (issues.length) throw new Error('Invalid references: ' + JSON.stringify(issues));
  const resolved = resolveResume(validLibrary, profile);
  writeFileSync(join(ROOT,'candidate.json'), JSON.stringify({ library:validLibrary, profile },null,2));
  writeFileSync(join(ROOT,'resolved.json'), JSON.stringify(resolved,null,2));
  writeFileSync(join(ROOT,'manifest.json'),JSON.stringify({
    mode, generatedAt:now, sourceProfileId:SOURCE, targetProfileId:PROFILE,
    originalLibraryVersion:currentLibrary.version, candidateLibraryVersion:validLibrary.version,
    expectedPageCount:1, safeForExternalSubmission:false,
  },null,2));

  if (mode==='preview') {
    const response = await fetch('http://127.0.0.1:3000/api/v1/resume/preview/pdf',{
      method:'POST',
      headers:{ 'authorization':'Bearer ' + process.env.JOB_HARNESS_AUTH_TOKEN, 'content-type':'application/json' },
      body:JSON.stringify({ library:validLibrary, profile }),
    });
    if (!response.ok) throw new Error('PDF preview failed '+response.status+' '+(await response.text()).slice(0,350));
    const bytes=Buffer.from(await response.arrayBuffer());
    writeFileSync(join(ROOT,PROFILE+'.pdf'),bytes);
    console.log('PREVIEW_OK',PROFILE,'PDF_BYTES',bytes.length,'LIBRARY',validLibrary.version);
  } else {
    // Single SQLite transaction: either Library + profile exist together or neither does.
    await store.transaction(async tx=>{
      const liveLibrary=await tx.getLibrary('primary');
      const liveBase=await tx.getProfile(SOURCE);
      if (!liveLibrary || liveLibrary.version!==currentLibrary.version
          || !liveBase || liveBase.version!==base.version) {
        throw new Error('Source version changed; re-run preview and revalidate');
      }
      if (await tx.getProfile(PROFILE)) throw new Error('Profile already exists: '+PROFILE);
      if (validateResumeProfileReferences(validLibrary,profile).length) throw new Error('Invalid live references');
      resolveResume(validLibrary,profile);
      await tx.upsertLibrary(validLibrary);
      await tx.upsertProfile(profile);
    });
    console.log('CREATED',PROFILE,'LIBRARY_VERSION',validLibrary.version);
  }
} finally { store.close(); }
