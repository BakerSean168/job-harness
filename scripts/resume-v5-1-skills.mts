/**
 * Additive job-harness authoring: Resume V5.1 (2026-10-14).
 * Rewrites only the skill lines of the four V5 Profiles into capability style
 * ("熟悉 X（要点），能 / 有 Y 经验"), per Arlon's review; 「了解微信小程序」 removed.
 * Frontend source is ai-frontend-v5 v2 (Arlon's UI edit removing 小程序 via a skill override).
 * New: 14 SkillBlocks (v51-*), 4 Profiles (*-v5-1). Projects, highlights,
 * internship, education and certificates are identical to V5.
 *
 *   node_modules/.bin/tsx scripts/resume-v5-1-skills.mts check|preview|commit|publish
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { renderResumeHtml } from '../packages/resume-renderer/src/index.ts';
import { ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences } from '../packages/resume-contracts/src/index.ts';
import { auditV2xFoundation } from './resume-v2x-foundation-policy.ts';

const MODE = process.argv[2] ?? 'check';
if (!['check', 'preview', 'commit', 'publish'].includes(MODE)) throw new Error('Expected check | preview | commit | publish');
const BASE_LIBRARY_VERSION = 13;
const ROOT = process.env.RESUME_V51_STAGING || '/data/resume-v5-1-staging';
const EXPORT_DIR = process.env.RESUME_V51_EXPORT || '/data/resumes-v5-1';
const API = process.env.JOB_HARNESS_API || 'http://127.0.0.1:3000/api/v1';
const zh = (s: string) => ({ 'zh-CN': s });
const now = new Date().toISOString();
mkdirSync(ROOT, { recursive: true });

const ENG_AI = '<strong>工程与 AI 编程：</strong>熟悉 Docker、Nx、GitHub Actions，能搭建按改动范围执行的 CI；能用 Claude Code / Codex 辅助重构与测试，以 diff 评审和测试把关。';
const SKILLS: Record<string, string> = {
  'v51-fe-base': '<strong>前端基础：</strong>熟悉 JavaScript（ES6+、事件循环、Promise）、TypeScript 与 HTML5/CSS3，了解浏览器渲染原理。',
  'v51-fe-framework': '<strong>框架与组件：</strong>熟悉 Vue 3 / Pinia、React Hooks，能基于组件库快速开发页面，并将可复用 UI 封装为业务组件。',
  'v51-fe-perf': '<strong>状态与性能：</strong>熟悉 TanStack Query、Pinia / Zustand 状态管理，有虚拟列表、懒加载与 Three.js 渲染优化经验。',
  'v51-fe-eng': '<strong>工程化：</strong>熟悉 Vite、pnpm / Nx 与 ESLint，能用 Vitest、Playwright、GitHub Actions 搭建自动化测试与 CI。',
  'v51-fs-frontend': '<strong>前端：</strong>熟悉 JavaScript、TypeScript、Vue 3 / Pinia、React Hooks，有 Electron 与 SSE 流式交互开发经验。',
  'v51-fs-backend': '<strong>后端：</strong>熟悉 Node.js（Express）、Go（Gin / GORM）与 Python（FastAPI），能设计 RESTful / OpenAPI 接口。',
  'v51-fs-data': '<strong>数据：</strong>熟悉 PostgreSQL / Prisma（建模、事务、行锁），了解 Redis、pgvector，有幂等写入与时态建模经验。',
  'v51-fs-backend-data': '<strong>后端与数据：</strong>熟悉 Node.js（Express）、Go（Gin / GORM）、Python（FastAPI）与 PostgreSQL / Prisma，了解 Redis，能按 OpenAPI 契约设计接口。',
  'v51-fs-ai': '<strong>AI 应用：</strong>熟悉 Mastra、LangGraph 与 MCP，有工具调用、人工确认与可恢复工作流开发经验。',
  'v51-fs-eng-ai': ENG_AI,
  'v51-ag-orch': '<strong>Agent 编排：</strong>熟悉 Python、LangGraph（检查点、interrupt / resume）与 Mastra Workflow，有多轮追问与人工审核流程开发经验。',
  'v51-ag-tools': '<strong>工具调用：</strong>熟悉 Function Calling、MCP 与 PydanticAI 结构化输出，能用 Zod / Pydantic Schema 约束工具参数并做分级权限控制。',
  'v51-ag-rag': '<strong>RAG 与记忆：</strong>熟悉 Embedding 与 pgvector 检索，了解重排与引用归因，有长期记忆设计与按 token 预算组装上下文的经验。',
  'v51-ag-eval': '<strong>Prompt 与评测：</strong>熟悉 Prompt / Schema 版本管理与 Pydantic Evals 离线评测，了解影子 / 金丝雀灰度；能用 Claude Code / Codex 辅助开发，以 diff 评审和测试把关。',
};
const specs = [
  { id: 'ai-frontend-v5-1', from: 'ai-frontend-v5', skills: ['v51-fe-base', 'v51-fe-framework', 'v51-fe-perf', 'v51-fe-eng'] },
  { id: 'ai-fullstack-v5-1', from: 'ai-fullstack-v5', skills: ['v51-fs-frontend', 'v51-fs-backend', 'v51-fs-data', 'v51-fs-eng-ai'] },
  { id: 'ai-fullstack-agent-v5-1', from: 'ai-fullstack-agent-v5', skills: ['v51-fs-frontend', 'v51-fs-backend-data', 'v51-fs-ai', 'v51-fs-eng-ai'] },
  { id: 'ai-agent-app-v5-1', from: 'ai-agent-app-v5', skills: ['v51-ag-orch', 'v51-ag-tools', 'v51-ag-rag', 'v51-ag-eval'] },
] as const;
const PROFILE_IDS = specs.map(s => s.id);

function assembleLibrary(original: any) {
  const library = structuredClone(original);
  for (const [id, text] of Object.entries(SKILLS)) {
    if (library.skills.some((s: any) => s.id === id)) throw new Error('Skill exists: ' + id);
    library.skills.push({ id, label: null, content: zh(text), keywords: [] });
  }
  library.version = original.version + 1;
  library.updatedAt = now;
  return ResumeLibrarySchema.parse(library);
}
function assembleProfile(base: any, spec: typeof specs[number]) {
  const p = structuredClone(base);
  const role = p.targetRole['zh-CN'];
  p.id = spec.id;
  p.version = 1;
  p.name = zh(role + ' v5.1');
  p.output = { ...p.output, documentTitle: zh('卢楼豪 - ' + role + ' v5.1'), pdfName: zh('卢楼豪-' + role.replaceAll(' ', '') + '-v5.1') };
  p.skillIds = [...spec.skills];
  p.overrides = p.overrides.filter((o: any) => o.kind !== 'skill');
  p.createdAt = now; p.updatedAt = now; p.archivedAt = null;
  return ResumeProfileSchema.parse(p);
}
async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { ...init, headers: { authorization: 'Bearer ' + process.env.JOB_HARNESS_AUTH_TOKEN, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${r.status} ${(await r.text()).slice(0, 500)}`);
  return r;
}
function previewLibraryFor(library: any, profile: any) {
  const pruned = structuredClone(library);
  pruned.skills = pruned.skills.filter((s: any) => profile.skillIds.includes(s.id));
  for (const project of pruned.projects) {
    const sel = profile.projectSelections.find((s: any) => s.projectId === project.id);
    project.presentations = sel ? project.presentations.filter((x: any) => x.id === sel.presentationId) : project.presentations.slice(0, 1);
    project.highlights = sel ? project.highlights.filter((h: any) => sel.highlightIds.includes(h.id)) : [];
  }
  if (JSON.stringify(resolveResume(pruned, profile)) !== JSON.stringify(resolveResume(library, profile))) throw new Error(profile.id + ': pruned preview differs');
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
      const rev = await (await api(`/resume/profiles/${encodeURIComponent(spec.id)}/revisions`, { method: 'POST', body: JSON.stringify({ expectedProfileVersion: profile.version, expectedLibraryVersion: library.version, note: 'Resume v5.1 capability-style skills (2026-10-14)' }) })).json();
      const art = await (await api(`/resume/revisions/${encodeURIComponent(rev.revision.id)}/artifacts`, { method: 'POST', body: JSON.stringify({ kind: 'pdf' }) })).json();
      const bytes = new Uint8Array(await (await api(`/resume/artifacts/${encodeURIComponent(art.artifact.id)}/content`)).arrayBuffer());
      const target = join(EXPORT_DIR, profile.output.pdfName['zh-CN'] + '.pdf');
      if (existsSync(target) && sha256(readFileSync(target)) !== sha256(bytes)) throw new Error('Refusing to overwrite ' + target);
      writeFileSync(target, bytes);
      results.push({ profileId: spec.id, revisionId: rev.revision.id, artifactId: art.artifact.id, sha256: sha256(bytes), bytes: bytes.length, export: target });
    }
    writeFileSync(join(ROOT, 'publish.json'), JSON.stringify(results, null, 2));
    console.log('PUBLISHED', JSON.stringify(results, null, 2));
  } else {
    const original = await store.getLibrary('primary');
    if (!original || original.version !== BASE_LIBRARY_VERSION) throw new Error(`Baseline changed: expected v${BASE_LIBRARY_VERSION}, found v${original?.version}`);
    for (const id of PROFILE_IDS) if (await store.getProfile(id)) throw new Error('Target exists: ' + id);
    const bases = await Promise.all(specs.map(s => store.getProfile(s.from)));
    bases.forEach((b, i) => { if (!b || b.archivedAt || b.version !== (specs[i]!.from === 'ai-frontend-v5' ? 2 : 1)) throw new Error('Source moved: ' + specs[i]!.from); });
    const allBefore = await store.listProfiles({ includeArchived: true });
    const library = assembleLibrary(original);
    const profiles = specs.map((s, i) => assembleProfile(bases[i], s));
    let preserved = 0;
    for (const old of allBefore) {
      let before: any;
      try { before = resolveResume(original, old); } catch { continue; }
      assert.deepStrictEqual(resolveResume(library, old), { ...before, libraryVersion: library.version }, 'changed: ' + old.id);
      preserved++;
    }
    for (const [i, profile] of profiles.entries()) {
      const errs = validateResumeProfileReferences(library, profile);
      if (errs.length) throw new Error(profile.id + ' refs ' + JSON.stringify(errs));
      const resolved = resolveResume(library, profile);
      const report = auditV2xFoundation(profile, resolved);
      assert.deepStrictEqual(report.errors, [], profile.id + ' ' + JSON.stringify(report.errors));
      assert.deepStrictEqual(report.warnings, [], profile.id + ' ' + JSON.stringify(report.warnings));
      const before = resolveResume(original, bases[i]!);
      for (const k of ['projects', 'workExperiences', 'education', 'certificates'] as const) assert.deepStrictEqual(resolved[k], before[k], profile.id + ' ' + k);
      const html = renderResumeHtml(resolved);
      assert.ok(!/精通|已上线|准确率|小程序|基于 Mastra|实践/u.test(resolved.skills.map((s: any) => s.content).join(' ')), profile.id + ': skill wording');
      assert.ok(!/精通|已上线|准确率/u.test(html), profile.id + ': forbidden wording');
    }
    if (MODE === 'check') console.log('CHECK_OK', JSON.stringify({ library: `${original.version}->${library.version}`, profiles: PROFILE_IDS, preserved }));
    else if (MODE === 'preview') {
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
        for (const base of bases) { const cur = await tx.getProfile(base!.id); if (!cur || JSON.stringify(cur) !== JSON.stringify(base)) throw new Error('Source changed: ' + base!.id); }
        for (const profile of profiles) if (await tx.getProfile(profile.id)) throw new Error('Duplicate ' + profile.id);
        await tx.upsertLibrary(library);
        for (const profile of profiles) await tx.upsertProfile(profile);
      });
      console.log('COMMITTED', JSON.stringify({ library: library.version, profiles: PROFILE_IDS }));
    }
  }
} finally { store.close(); }
