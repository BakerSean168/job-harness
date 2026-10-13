/**
 * Frontend v2.3: one additive Resume Profile with short project titles,
 * skills matched to frontend JDs, fixed canonical GitHub links and
 * independent showcase links, a concise template, and formal metadata.
 *
 * Commands (inside Job Harness server container, AFTER the compact renderer
 * template has been deployed):
 *   tsx scripts/resume-frontend-v2-3.mts check    # read-only, no PDF
 *   tsx scripts/resume-frontend-v2-3.mts preview  # read-only, official PDF
 *   tsx scripts/resume-frontend-v2-3.mts commit   # atomic DB insert
 *
 * Do not repeat commit; duplicate target Profile fails closed.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences } from '../packages/resume-contracts/src/index.ts';

const mode = process.argv[2] ?? 'check';
if (!['check', 'preview', 'commit'].includes(mode)) throw new Error('Expected check | preview | commit');
const SOURCE = 'ai-frontend-v2-2';
const TARGET = 'ai-frontend-v2-3';
const PRESENTATION = 'one-page-v2-3';
const TEMPLATE = 'compact-project-links-v2';
const STAGING = '/data/resume-frontend-v2-3-staging';
const now = new Date().toISOString();
const zh = (value: string) => ({ 'zh-CN': value });

const projectUpdates = {
  dailyuse: {
    name: '知行 MemoFlow',
    github: 'https://github.com/BakerSean168/memoflow',
    showcase: 'https://bakersean168.github.io/memoflow/',
  },
  'body-sense': {
    name: 'BodySense',
    github: 'https://github.com/BakerSean168/BodySense',
    showcase: 'https://bakersean168.github.io/BodySense/',
  },
} as const;
const skills = {
  'frontend-foundations-v2': '<strong>前端基础：</strong>熟悉 JavaScript（ES6+）、TypeScript、HTML5/CSS3、HTTP，理解异步编程、事件循环及响应式布局。',
  'frontend-frameworks-v2': '<strong>框架与组件：</strong>熟练使用 Vue 3、Composition API、Pinia，具备 React Hooks、TanStack Query、Zustand 和业务组件开发实践。',
  'frontend-state-v2': '<strong>状态与交互：</strong>熟悉组件通信、异步状态管理与 SSE 流式渲染，具备接口联调、浏览器调试和错误处理经验。',
  'frontend-engineering-v2': '<strong>工程与设计：</strong>使用 Vite、Vitest、Playwright、GitHub Actions；熟悉 Figma / Penpot 原型与组件规范。',
} as const;

const db = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  const originalLibrary = await db.getLibrary('primary');
  const previous = await db.getProfile(SOURCE);
  if (!originalLibrary || !previous || previous.archivedAt) throw new Error('Missing active source Profile / Library');
  if (originalLibrary.version !== 8 || previous.version !== 6) {
    throw new Error('Baseline changed. Expected primary v8 + frontend v2.2 v6; manual re-review required.');
  }
  if (await db.getProfile(TARGET)) throw new Error('Target Profile already exists; refusing overwrite.');
  if (previous.projectSelections.length !== 2 || previous.skillIds.length !== 4) {
    throw new Error('Unexpected source Resume selection dimensions');
  }

  const libraryDraft = structuredClone(originalLibrary);
  for (const [projectId, data] of Object.entries(projectUpdates)) {
    const project = libraryDraft.projects.find(item => item.id === projectId);
    if (!project) throw new Error('Project absent: ' + projectId);
    const oldGitHub = project.links[0]?.url;
    if (oldGitHub !== 'GitHub: ' + data.github || project.links.length !== 1) {
      throw new Error('Unexpected canonical project links for ' + projectId + ': ' + oldGitHub);
    }

    // Fix incorrect URL semantics (legacy "GitHub:" lived inside the URL).
    // This is a factual correction to the shared Library, not a new achievement.
    project.links = [
      { label: zh('GitHub'), url: data.github },
      { label: zh('项目展示'), url: data.showcase },
    ];
    const sourcePresentation = project.presentations.find(item => item.id === 'one-page-v2-2-agent-intro-r4');
    if (!sourcePresentation || project.presentations.some(p => p.id === PRESENTATION)) {
      throw new Error('Missing source presentation or duplicate v2.3 for ' + projectId);
    }
    project.presentations.push({
      ...structuredClone(sourcePresentation),
      id: PRESENTATION,
      name: zh(data.name),
    });
  }
  libraryDraft.version += 1;
  libraryDraft.updatedAt = now;
  const library = ResumeLibrarySchema.parse(libraryDraft);

  const profileDraft = structuredClone(previous);
  profileDraft.id = TARGET;
  profileDraft.version = 1;
  profileDraft.name = zh('前端开发工程师 v2.3');
  profileDraft.templateId = TEMPLATE;
  profileDraft.output = {
    documentTitle: zh('卢楼豪 - 前端开发工程师 v2.3'),
    description: zh('卢楼豪，2026届本科毕业生。前端开发工程师简历，涵盖 Vue 3、React、TypeScript、Electron 与 Three.js 项目经验。'),
    onlineUrl: null,
    pdfName: zh('卢楼豪-前端开发工程师-v2.3'),
  };
  profileDraft.projectSelections = profileDraft.projectSelections.map(selection => ({
    ...selection, presentationId: PRESENTATION,
  }));
  let updatedSkillCount = 0;
  profileDraft.overrides = profileDraft.overrides.map(override => {
    if (override.kind !== 'skill') return override;
    const skill = skills[override.skillId as keyof typeof skills];
    if (!skill) throw new Error('Unexpected skill override id '+ override.skillId);
    updatedSkillCount++;
    return { ...override, value: zh(skill) };
  });
  if (updatedSkillCount !== 4) throw new Error('Expected exactly 4 skill overrides, found ' + updatedSkillCount);
  profileDraft.createdAt = now;
  profileDraft.updatedAt = now;
  profileDraft.archivedAt = null;
  const profile = ResumeProfileSchema.parse(profileDraft);

  const issues = validateResumeProfileReferences(library, profile);
  if (issues.length) throw new Error('Invalid Resume references: ' + JSON.stringify(issues));

  const before = resolveResume(originalLibrary, previous);
  const after = resolveResume(library, profile);
  assert.equal(after.projects.length, 2);
  assert.equal(after.skills.length, 4);
  assert.deepStrictEqual(after.workExperiences, before.workExperiences);
  assert.deepStrictEqual(after.education, before.education);
  assert.deepStrictEqual(after.certificates, before.certificates);
  assert.deepStrictEqual(after.projects.map(p => p.highlights), before.projects.map(p => p.highlights));
  assert.deepStrictEqual(after.projects.map(p => p.description), before.projects.map(p => p.description));
  assert.deepStrictEqual(after.projects.map(p => p.period), before.projects.map(p => p.period));
  assert.deepStrictEqual(after.projects.map(p => p.role), before.projects.map(p => p.role));
  assert.deepStrictEqual(after.projects.map(p => p.stack), before.projects.map(p => p.stack));
  assert.deepStrictEqual(after.projects.map(p => p.name), Object.values(projectUpdates).map(v => v.name));
  assert.deepStrictEqual(after.projects.map(p => p.links.length), [2, 2]);
  assert.equal(after.templateId, TEMPLATE);

  mkdirSync(STAGING, { recursive: true });
  writeFileSync(join(STAGING, 'candidate.json'), JSON.stringify({ library, profile }, null, 2));
  writeFileSync(join(STAGING, 'resolved.json'), JSON.stringify(after, null, 2));
  writeFileSync(join(STAGING, 'manifest.json'), JSON.stringify({
    mode, generatedAt: now, sourceProfileId: SOURCE, sourceVersion: previous.version,
    targetProfileId: TARGET, libraryFrom: originalLibrary.version, libraryTo: library.version,
    snapshotRole: after.positioning, beforeLinks: before.projects.map(p=>p.links),
    afterLinks: after.projects.map(p=>p.links),
    changedOnly: [
      'new frontend Profile and its local skill overrides',
      'new project presentation names without changing older presentations',
      'fix two malformed legacy GitHub URL fields',
      'add two project showcase URLs',
      'new opt-in compact resume template',
      'formal PDF metadata and filename',
    ],
    noChanges: ['internship', 'education', 'dates', 'project descriptions', 'four project highlights',
      'other Profiles', 'historic Revisions', 'Artifacts', 'Applications', 'Campaigns'],
  }, null, 2));

  if (mode === 'preview') {
    const response = await fetch('http://127.0.0.1:3000/api/v1/resume/preview/pdf', {
      method: 'POST',
      headers: {
        authorization: 'Bearer '+process.env.JOB_HARNESS_AUTH_TOKEN,
        'content-type':'application/json',
      },
      body: JSON.stringify({library,profile}),
    });
    if (!response.ok) throw new Error('Official renderer error '+response.status+' '+(await response.text()).slice(0,450));
    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(join(STAGING,'ai-frontend-v2-3.pdf'),bytes);
    console.log('PREVIEW_OK',JSON.stringify({pdfBytes:bytes.length,profileId:TARGET,libraryVersion:library.version}));
  } else if (mode === 'commit') {
    await db.transaction(async tx => {
      const activeLibrary = await tx.getLibrary('primary');
      const activePrevious = await tx.getProfile(SOURCE);
      if (!activeLibrary || !activePrevious ||
          activeLibrary.version !== originalLibrary.version ||
          activePrevious.version !== previous.version ||
          JSON.stringify(activeLibrary) !== JSON.stringify(originalLibrary) ||
          JSON.stringify(activePrevious) !== JSON.stringify(previous)) {
        throw new Error('Concurrent change; transaction aborted without writing');
      }
      if (await tx.getProfile(TARGET)) throw new Error('Duplicate target Profile; refusing overwrite');
      if (validateResumeProfileReferences(library,profile).length) throw new Error('Invalid references at write');
      await tx.upsertLibrary(library);
      await tx.upsertProfile(profile);
    });
    console.log('CREATED',JSON.stringify({profileId:TARGET,profileVersion:profile.version,libraryVersion:library.version}));
  } else {
    console.log('CHECK_OK', JSON.stringify({profileId:TARGET,libraryVersion:library.version,projectNames:after.projects.map(p=>p.name)}));
  }
} finally {
  db.close();
}
