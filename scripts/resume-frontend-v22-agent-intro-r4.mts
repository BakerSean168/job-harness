/**
 * Frontend v2.2: owner-selected technical product introductions — immutable Revision #4.
 *
 * One-time manual tool invoked inside the Job Harness server container:
 *   tsx scripts/resume-frontend-v22-agent-intro-r4.mts preview
 *   tsx scripts/resume-frontend-v22-agent-intro-r4.mts commit
 *
 * Creates NEW versioned presentations, modifies only this Resume Profile's
 * selections, then lets Job Harness publish a new revision/artifact. Does
 * not modify historical presentations, shared project facts or recruiting.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import {
  ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences,
} from '../packages/resume-contracts/src/index.ts';

const MODE = process.argv[2] ?? 'preview';
if (!['preview','commit'].includes(MODE)) throw new Error('Expected preview or commit');
const ROOT = '/data/resume-frontend-v22-agent-intro-r4-staging';
const PROFILE_ID = 'ai-frontend-v2-2';
const PREVIOUS_PRESENTATION = 'one-page-v2-2-product-intro-r3';
const NEXT_PRESENTATION = 'one-page-v2-2-agent-intro-r4';
const DESCRIPTIONS = {
  dailyuse: 'AI 原生个人效率平台，打通 AI 对话与目标、任务、日程、提醒、知识库，让意图从对话进入结构化工作区并执行、回流为可追踪结果。',
  'body-sense': '以 Agent 持续理解个人身体状况的应用。用户自然语言描述身体变化，系统结构化记录在 3D 人体上，经用户确认形成综合评估，并管理、执行多份训练计划。',
} as const;
const PROJECT_IDS = ['dailyuse','body-sense'] as const;
const now = new Date().toISOString();

const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  const originalLibrary = await store.getLibrary('primary');
  const originalProfile = await store.getProfile(PROFILE_ID);
  if (!originalLibrary || !originalProfile || originalProfile.archivedAt) {
    throw new Error('Active frontend v2.2 Profile or primary Library missing');
  }
  if (originalLibrary.version !== 7 || originalProfile.version !== 3) {
    throw new Error('Resume baseline changed since Revision #3; manual re-review is required');
  }

  if (originalProfile.projectSelections.length !== 2) throw new Error('Unexpected project selection count');
  for (const [index, projectId] of PROJECT_IDS.entries()) {
    const selected = originalProfile.projectSelections[index];
    if (selected.projectId !== projectId || selected.presentationId !== PREVIOUS_PRESENTATION) {
      throw new Error('Changed source presentation; manual re-review required: ' + projectId);
    }
  }

  const nextLibrary = structuredClone(originalLibrary);
  for (const projectId of PROJECT_IDS) {
    const project = nextLibrary.projects.find(p => p.id === projectId);
    if (!project) throw new Error('Project not found: ' + projectId);
    const original = project.presentations.find(p => p.id === PREVIOUS_PRESENTATION);
    if (!original) throw new Error('Source presentation not found: ' + projectId);
    if (project.presentations.some(p => p.id === NEXT_PRESENTATION)) {
      throw new Error('Refusing duplicate presentation: ' + projectId);
    }
    project.presentations.push({
      ...structuredClone(original),
      id: NEXT_PRESENTATION,
      description: { 'zh-CN': DESCRIPTIONS[projectId] },
    });
  }
  nextLibrary.version = originalLibrary.version + 1;
  nextLibrary.updatedAt = now;
  const library = ResumeLibrarySchema.parse(nextLibrary);

  const nextProfile = structuredClone(originalProfile);
  nextProfile.version = originalProfile.version + 1;
  nextProfile.updatedAt = now;
  nextProfile.projectSelections = nextProfile.projectSelections.map(s => ({
    ...s, presentationId: NEXT_PRESENTATION,
  }));
  const profile = ResumeProfileSchema.parse(nextProfile);
  const refIssues = validateResumeProfileReferences(library, profile);
  if (refIssues.length) throw new Error('Invalid references: ' + JSON.stringify(refIssues));

  const before = resolveResume(originalLibrary, originalProfile);
  const after = resolveResume(library, profile);

  const expected = structuredClone(before);
  expected.libraryVersion = library.version;
  expected.profileVersion = profile.version;
  expected.projects = expected.projects.map(p => ({
    ...p,
    description: DESCRIPTIONS[p.id as keyof typeof DESCRIPTIONS],
  }));

  // Enforce only two product-description text changes. All other project facts,
  // role labels, technical highlights, experience, skills and links must match.
  assert.deepStrictEqual(after, expected, 'Unexpected non-description Resume differences');
  assert.deepStrictEqual(after.projects.map(p => p.description), PROJECT_IDS.map(id => DESCRIPTIONS[id]));

  mkdirSync(ROOT, { recursive:true });
  writeFileSync(join(ROOT,'candidate.json'),JSON.stringify({library,profile},null,2));
  writeFileSync(join(ROOT,'resolved.json'),JSON.stringify(after,null,2));
  writeFileSync(join(ROOT,'audit.json'),JSON.stringify({
    mode:MODE, profileId:PROFILE_ID, changedField:'projects[].description',
    previousProfileVersion:originalProfile.version, nextProfileVersion:profile.version,
    previousLibraryVersion:originalLibrary.version, nextLibraryVersion:library.version,
    previousPresentation:PREVIOUS_PRESENTATION, nextPresentation:NEXT_PRESENTATION,
    oldDescriptions:before.projects.map(p=>p.description),
    newDescriptions:after.projects.map(p=>p.description),
    otherFieldsUnchanged:true,
  },null,2));

  if (MODE === 'preview') {
    const response = await fetch('http://127.0.0.1:3000/api/v1/resume/preview/pdf', {
      method:'POST',
      headers:{
        authorization:'Bearer '+process.env.JOB_HARNESS_AUTH_TOKEN,
        'content-type':'application/json',
      },
      body: JSON.stringify({ library, profile }),
    });
    if (!response.ok) throw new Error('Official PDF render failed: '+response.status+' '+(await response.text()).slice(0,300));
    const pdf = Buffer.from(await response.arrayBuffer());
    writeFileSync(join(ROOT,'ai-frontend-v2-2-agent-intro-r4.pdf'),pdf);
    console.log('PREVIEW_OK',JSON.stringify({
      profileId:PROFILE_ID, profileVersion:profile.version, libraryVersion:library.version,
      bytes:pdf.length, projectDescriptions:after.projects.map(p=>p.description),
    }));
  } else {
    await store.transaction(async tx => {
      const latestLibrary = await tx.getLibrary('primary');
      const latestProfile = await tx.getProfile(PROFILE_ID);
      if (!latestLibrary || !latestProfile ||
          latestLibrary.version !== originalLibrary.version ||
          latestProfile.version !== originalProfile.version ||
          JSON.stringify(latestLibrary) !== JSON.stringify(originalLibrary) ||
          JSON.stringify(latestProfile) !== JSON.stringify(originalProfile)) {
        throw new Error('Concurrent authoring change detected; transaction aborted');
      }
      if (validateResumeProfileReferences(library,profile).length) {
        throw new Error('Invalid live references');
      }
      await tx.upsertLibrary(library);
      await tx.upsertProfile(profile);
    });
    console.log('COMMITTED',JSON.stringify({
      profileId:PROFILE_ID,profileVersion:profile.version,libraryVersion:library.version,
      descriptions:after.projects.map(p=>p.description),
    }));
  }
} finally {
  store.close();
}
