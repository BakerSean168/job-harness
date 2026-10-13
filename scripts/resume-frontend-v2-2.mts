/**
 * Frontend Resume V2.2 — additive one-page edition.
 *
 * Run INSIDE the Job Harness server container:
 *   tsx scripts/resume-frontend-v2-2.mts preview  # read-only database
 *   tsx scripts/resume-frontend-v2-2.mts commit   # explicit transaction, once
 *
 * Profile source: ai-frontend-v2-1 (most recent version, with graded skills).
 * No change to older Profile/Revisions/Artifacts/campaigns/applications.
 * Live demonstrations & individual attribution require human approval prior to applying.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import {
  ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences,
} from '../packages/resume-contracts/src/index.ts';

const mode = process.argv[2] ?? 'preview';
if (mode !== 'preview' && mode !== 'commit') throw new Error('Expected preview or commit');
const ROOT = '/data/resume-frontend-v2-2-staging';
const SOURCE = 'ai-frontend-v2-1';
const TARGET = 'ai-frontend-v2-2';
const PRESENTATION = 'one-page-v2-2';
const zh = (s: string) => ({ 'zh-CN': s });
const now = new Date().toISOString();
mkdirSync(ROOT, { recursive: true });

const changes = {
  dailyuse: {
    description: '基于 Figma 原型迭代 Vue 3 / Electron AI 工作台，涵盖会话、目标、任务与多面板交互。',
    stack: 'Vue 3、TypeScript、Electron、TanStack Query、PowerSync、Figma',
    role: '个人项目 · 前端开发',
  },
  'body-sense': {
    description: 'React 体态健康 AI 工作台，以交互式 3D 人体联动身体记录与流式会话。',
    stack: 'React 19、TypeScript、React Three Fiber、Three.js、TanStack Query、SSE',
    role: '个人项目 · React / 3D 前端',
  },
} as const;

const highlights = {
  dailyuse: [
    { id:'v2-2-web-desktop-client', label:'多端前端架构：',
      detail:'统一 Web HTTP / Electron IPC 前端接口，复用查询缓存与变更语义，减少双端业务组件重复实现。' },
    { id:'v2-2-workspace-interaction', label:'复杂工作台交互：',
      detail:'实现会话 / AI / 业务面板三栏协作，支持窄屏聚焦、多 Tab 保活和拖拽调宽，并以组件测试验证交互。' },
  ],
  'body-sense': [
    { id:'v2-2-threejs-body', label:'三维人体交互：',
      detail:'基于 React Three Fiber / Three.js 实现人体点选、框选与画笔标注，联动身体记录及 AI 提问上下文。' },
    { id:'v2-2-sse-agent-ui', label:'流式 AI 交互：',
      detail:'校验 POST SSE 结构化事件，通过 reducer 增量展示文本、工具和引用，并用 Vitest 覆盖异常与序列处理。' },
  ],
} as const;

const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  const originalLibrary = await store.getLibrary('primary');
  const sourceProfile = await store.getProfile(SOURCE);
  if (!originalLibrary || !sourceProfile) throw new Error('Missing primary Library or latest frontend v2.1 Profile');
  if (sourceProfile.archivedAt) throw new Error('Source Profile is archived');
  if (await store.getProfile(TARGET)) throw new Error('Refusing to overwrite existing frontend v2.2 Profile');

  const library = structuredClone(originalLibrary);
  for (const [projectId, copy] of Object.entries(changes)) {
    const project = library.projects.find(item => item.id === projectId);
    if (!project) throw new Error('Missing canonical project: ' + projectId);
    const previous = project.presentations.find(item => item.id === 'one-page-v2-1');
    if (!previous) throw new Error('Missing source presentation: ' + projectId);
    if (project.presentations.some(item => item.id === PRESENTATION)) {
      throw new Error('Refusing to overwrite existing v2.2 presentation: ' + projectId);
    }
    project.presentations.push({
      ...structuredClone(previous),
      id: PRESENTATION,
      description: zh(copy.description),
      stack: zh(copy.stack),
      role: zh(copy.role),
    });
    for (const h of highlights[projectId as keyof typeof highlights]) {
      if (project.highlights.some(existing => existing.id === h.id)) {
        throw new Error('Refusing to overwrite existing v2.2 highlight: ' + h.id);
      }
      project.highlights.push({ id:h.id, label:zh(h.label), detail:zh(h.detail) });
    }
  }
  library.version = originalLibrary.version + 1;
  library.updatedAt = now;
  const validLibrary = ResumeLibrarySchema.parse(library);

  const draft = structuredClone(sourceProfile);
  draft.id = TARGET;
  draft.version = 1;
  draft.name = zh('前端开发工程师 v2.2');
  draft.targetRole = zh('前端开发工程师');
  draft.positioning = zh('前端开发工程师');
  draft.output = {
    documentTitle: zh('卢楼豪 - 前端开发工程师 v2.2'),
    description: zh('前端 v2.2 项目技术亮点验证草稿。实习、个人贡献、项目时间需本人核验后方可正式投递。'),
    onlineUrl: null,
    pdfName: zh('卢楼豪-前端开发工程师-v2.2'),
  };
  draft.projectSelections = draft.projectSelections.map(selection => {
    if (selection.projectId !== 'dailyuse' && selection.projectId !== 'body-sense') {
      throw new Error('Unexpected source project: ' + selection.projectId);
    }
    return {
      ...selection,
      presentationId: PRESENTATION,
      highlightIds: highlights[selection.projectId as keyof typeof highlights].map(h => h.id),
    };
  });
  // Preserve the current v2.1 graded skills and internship wording without changes.
  // New highlights live as distinct versioned Library entities, so no old highlights
  // or old project-highlight overrides are edited or reused.
  draft.overrides = draft.overrides.filter(override => override.kind !== 'project-highlight');
  draft.createdAt = now;
  draft.updatedAt = now;
  draft.archivedAt = null;

  const profile = ResumeProfileSchema.parse(draft);
  const issues = validateResumeProfileReferences(validLibrary, profile);
  if (issues.length) throw new Error('Reference failures: ' + JSON.stringify(issues));
  const resolved = resolveResume(validLibrary, profile);
  if (resolved.projects.length !== 2 || resolved.projects.some(p => p.highlights.length !== 2)) {
    throw new Error('Expected exactly 2 projects x 2 highlights');
  }
  writeFileSync(join(ROOT, 'candidate.json'), JSON.stringify({ library:validLibrary, profile }, null, 2));
  writeFileSync(join(ROOT, 'resolved.json'), JSON.stringify(resolved, null, 2));
  writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify({
    mode, generatedAt:now, sourceProfileId:SOURCE, sourceProfileVersion:sourceProfile.version,
    targetProfileId:TARGET, originalLibraryVersion:originalLibrary.version,
    candidateLibraryVersion:validLibrary.version, expectedPageCount:1,
    safeForExternalSubmission:false,
    reviewGates:['verify actual internship and individual contributions',
      'confirm MemoFlow 2024-01 start date',
      'interactive live demo for BodySense 3D',
      'check old GitHub project link formatting'],
  },null,2));

  if (mode === 'preview') {
    const response = await fetch('http://127.0.0.1:3000/api/v1/resume/preview/pdf', {
      method:'POST',
      headers: {
        authorization:'Bearer ' + process.env.JOB_HARNESS_AUTH_TOKEN,
        'content-type':'application/json',
      },
      body:JSON.stringify({ library:validLibrary, profile }),
    });
    if (!response.ok) throw new Error('PDF preview failed: ' + response.status + ' ' + (await response.text()).slice(0,300));
    const pdf = Buffer.from(await response.arrayBuffer());
    writeFileSync(join(ROOT, TARGET + '.pdf'), pdf);
    console.log('PREVIEW_OK', TARGET, 'PDF_BYTES', pdf.length, 'LIBRARY', validLibrary.version);
  } else {
    await store.transaction(async tx => {
      const liveLibrary = await tx.getLibrary('primary');
      const liveSource = await tx.getProfile(SOURCE);
      if (!liveLibrary || liveLibrary.version !== originalLibrary.version
          || !liveSource || liveSource.version !== sourceProfile.version) {
        throw new Error('Source Library/Profile changed; aborting transaction');
      }
      if (await tx.getProfile(TARGET)) throw new Error('Duplicate target Profile');
      if (validateResumeProfileReferences(validLibrary, profile).length) throw new Error('Invalid references at commit');
      resolveResume(validLibrary, profile);
      await tx.upsertLibrary(validLibrary);
      await tx.upsertProfile(profile);
    });
    console.log('CREATED', TARGET, 'LIBRARY', validLibrary.version);
  }
} finally {
  store.close();
}
