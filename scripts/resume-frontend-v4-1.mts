/**
 * Frontend v4.1 — additive, source-verified 2026 graduate resume.
 *
 * Preserves frontend v2.3 Revision #2 as the immutable presentation/skills
 * baseline. Selects existing verified v4 and v2.3 project highlights without
 * modifying shared ResumeLibrary, other Profiles, historic Revisions, or
 * recruitment records.
 *
 * Run in the Job Harness server container:
 *   tsx scripts/resume-frontend-v4-1.mts check
 *   tsx scripts/resume-frontend-v4-1.mts preview
 *   tsx scripts/resume-frontend-v4-1.mts commit  # exactly once, guarded
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { renderResumeHtml } from '../packages/resume-renderer/src/index.ts';
import { ResumeProfileSchema, validateResumeProfileReferences } from '../packages/resume-contracts/src/index.ts';

const MODE = process.argv[2] ?? 'check';
if (!['check', 'preview', 'commit'].includes(MODE)) throw new Error('Expected check, preview, or commit');
const BASE = 'ai-frontend-v2-3';
const PREVIOUS_V4 = 'ai-frontend-v4';
const TARGET = 'ai-frontend-v4-1';
const BASE_VERSION = 2;
const LIBRARY_VERSION = 10;
const STAGING = '/data/resume-frontend-v4-1-staging';
const API = 'http://127.0.0.1:3000/api/v1';
const zh = (v: string) => ({ 'zh-CN': v });
const now = new Date().toISOString();

// The new version has two distinct strengths per project:
// MemoFlow = product-grade workbench & AI/human concurrency.
// BodySense = nontrivial GPU interaction & recoverable typed agent UI.
const selected = [
  {
    projectId: 'dailyuse', presentationId: 'one-page-v2-3',
    highlightIds: ['v2-2-workspace-interaction', 'v4-memoflow-hitl-form'],
  },
  {
    projectId: 'body-sense', presentationId: 'one-page-v2-3',
    highlightIds: ['v4-bodysense-gpu-picking', 'v4-bodysense-resumable-stream'],
  },
] as const;

const highlightText = [
  {
    kind: 'project-highlight' as const,
    projectId: 'dailyuse',
    highlightId: 'v4-memoflow-hitl-form',
    value: zh('基于类型化语义动作将 AI 输出逐步投影到原生目标表单，结合 fencing 租约与人工接管，阻止过期 AI 覆盖用户编辑。'),
  },
  {
    kind: 'project-highlight' as const,
    projectId: 'body-sense',
    highlightId: 'v4-bodysense-gpu-picking',
    value: zh('通过 GPU 颜色 ID 离屏渲染及深度测试拾取可见人体区域，支持点选、框选、画笔标注，并联动身体记录与 AI 提问。'),
  },
  {
    kind: 'project-highlight' as const,
    projectId: 'body-sense',
    highlightId: 'v4-bodysense-resumable-stream',
    value: zh('对 POST SSE 事件进行 JSON Schema 校验，经 reducer 增量渲染文本、追问和工具卡片；网络中断后按事件序号补拉恢复。'),
  },
];

const db = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  const library = await db.getLibrary('primary');
  const source = await db.getProfile(BASE);
  const v4 = await db.getProfile(PREVIOUS_V4);
  if (!library || !source || !v4 || source.archivedAt || v4.archivedAt) {
    throw new Error('Missing active canonical source Profile or primary ResumeLibrary');
  }
  if (library.version !== LIBRARY_VERSION ||
      source.version !== BASE_VERSION ||
      v4.version !== 1) {
    throw new Error('Version mismatch. Expected primary v10 + frontend v2.3 v2 + frontend v4 v1');
  }
  if (await db.getProfile(TARGET)) throw new Error('Target already exists; refusing to overwrite');
  assert.equal(source.templateId, 'compact-project-links-v2');
  assert.deepStrictEqual(source.projectSelections.map(s => s.projectId), ['dailyuse', 'body-sense']);
  assert.deepStrictEqual(source.projectSelections.map(s => s.presentationId), ['one-page-v2-3', 'one-page-v2-3']);
  assert.equal(source.overrides.filter(x => x.kind === 'skill').length, 4);
  assert.equal(source.overrides.filter(x => x.kind === 'work-bullet').length, 3);
  assert.equal(source.overrides.filter(x => x.kind === 'project-highlight').length, 0);
  assert.ok(source.overrides.some(x => x.kind === 'skill' && x.skillId === 'frontend-foundations-v2' &&
    x.value['zh-CN']?.includes('闭包、原型链、Promise、async/await 及事件循环')),
    'Frontend v2.3 latest base knowledge is not the accepted revision');

  // Borrow V4's already persisted technical highlights as entities, but keep
  // the owner-approved product descriptions and brand names from v2.3.
  for (const selection of selected) {
    const project = library.projects.find(p => p.id === selection.projectId);
    if (!project) throw new Error('Missing project '+selection.projectId);
    if (!project.presentations.some(p => p.id === selection.presentationId)) {
      throw new Error('Missing source product presentation');
    }
    for (const id of selection.highlightIds) {
      if (!project.highlights.some(h => h.id === id)) throw new Error('Missing verified highlight '+id);
    }
  }
  const candidate = structuredClone(source);
  candidate.id = TARGET;
  candidate.version = 1;
  candidate.name = zh('前端开发工程师 v4.1');
  candidate.positioning = zh('前端开发工程师｜2026届本科毕业生');
  candidate.output = {
    documentTitle: zh('卢楼豪 - 前端开发工程师 v4.1'),
    description: zh('2026届本科前端开发工程师；Vue 3 / React / TypeScript，具备 AI 原生工作台、Three.js GPU 拾取与可恢复 SSE 交互项目经验。'),
    onlineUrl: null,
    pdfName: zh('卢楼豪-前端开发工程师-v4.1'),
  };
  candidate.projectSelections = selected.map(s => ({
    projectId:s.projectId, presentationId:s.presentationId, highlightIds:[...s.highlightIds],
  }));
  candidate.overrides.push(...highlightText);
  candidate.createdAt = now;
  candidate.updatedAt = now;
  candidate.archivedAt = null;
  const profile = ResumeProfileSchema.parse(candidate);
  const errors = validateResumeProfileReferences(library, profile);
  if (errors.length) throw new Error('Invalid reference(s): '+JSON.stringify(errors));

  const before = resolveResume(library,source);
  const after = resolveResume(library,profile);
  assert.equal(after.templateId,'compact-project-links-v2');
  assert.deepStrictEqual(after.basics,before.basics);
  assert.deepStrictEqual(after.education,before.education);
  assert.deepStrictEqual(after.skills,before.skills);
  assert.deepStrictEqual(after.workExperiences,before.workExperiences);
  assert.deepStrictEqual(after.certificates,before.certificates);
  assert.deepStrictEqual(after.sectionOrder,before.sectionOrder);
  assert.deepStrictEqual(after.projects.map(({highlights,...rest})=>rest),
    before.projects.map(({highlights,...rest})=>rest));
  assert.deepStrictEqual(after.projects.map(p=>p.highlights.map(h=>h.id)),
    selected.map(s=>s.highlightIds));
  assert.deepStrictEqual(after.projects.map(p=>p.highlights.length),[2,2]);
  assert.deepStrictEqual(after.projects.map(p=>p.name),['知行 MemoFlow','BodySense']);
  assert.ok(after.skills[0]?.content.includes('闭包、原型链'));

  const html = renderResumeHtml(after);
  for (const project of after.projects) {
    assert.equal(project.links.length,2);
    for (const link of project.links) {
      assert.ok(html.includes('href="'+link.url+'"'), 'Missing HTML project hyperlink '+link.url);
    }
    assert.ok(project.role.includes('个人项目'));
  }
  assert.ok(!html.includes('项目亮点：'));

  if (MODE === 'preview') {
    const res = await fetch(API+'/resume/preview/pdf',{
      method:'POST',
      headers:{authorization:'Bearer '+process.env.JOB_HARNESS_AUTH_TOKEN,'content-type':'application/json'},
      body:JSON.stringify({library,profile}),
    });
    if (!res.ok) throw new Error('Official PDF renderer returned '+res.status+' '+(await res.text()).slice(0,500));
    const output = Buffer.from(await res.arrayBuffer());
    mkdirSync(STAGING,{recursive:true});
    writeFileSync(join(STAGING,'candidate.json'),JSON.stringify({library,profile},null,2));
    writeFileSync(join(STAGING,'resolved.json'),JSON.stringify(after,null,2));
    writeFileSync(join(STAGING,'ai-frontend-v4-1-preview.pdf'),output);
    console.log('PREVIEW_OK',JSON.stringify({
      profileId:TARGET,libraryVersion:library.version,profileVersion:profile.version,
      pdfBytes:output.length,projects:after.projects.map(p=>p.name),
      highlights:after.projects.map(p=>p.highlights.map(h=>({label:h.label,detail:h.detail}))),
      sourceInternshipIntact:true,sourceSkillsIntact:true,sourceProductIntrosIntact:true,
    }));
  } else if (MODE === 'commit') {
    await db.transaction(async tx => {
      const libNow = await tx.getLibrary('primary');
      const sourceNow = await tx.getProfile(BASE);
      const v4Now = await tx.getProfile(PREVIOUS_V4);
      if (!libNow || !sourceNow || !v4Now ||
          JSON.stringify(libNow) !== JSON.stringify(library) ||
          JSON.stringify(sourceNow) !== JSON.stringify(source) ||
          JSON.stringify(v4Now) !== JSON.stringify(v4)) {
        throw new Error('Concurrent source change detected; refusing all writes');
      }
      if (await tx.getProfile(TARGET)) throw new Error('Target Profile exists; refusing all writes');
      await tx.upsertProfile(profile);
    });
    console.log('COMMITTED',JSON.stringify({id:TARGET,version:profile.version,libraryVersion:library.version}));
  } else {
    console.log('CHECK_OK',JSON.stringify({
      profileId:TARGET,
      sourceProfileVersion:source.version,
      sourceV4Version:v4.version,
      libraryVersion:library.version,
      templateId:after.templateId,
      projects:after.projects.map(p=>({id:p.id,name:p.name,highlights:p.highlights.map(h=>h.id)})),
      skills:after.skills.length,internships:after.workExperiences.length,
    }));
  }
} finally {
  db.close();
}
