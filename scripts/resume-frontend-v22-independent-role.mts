/**
 * Frontend Resume v2.2 — independent-project role correction, Revision #2.
 *
 * Invoke manually inside the Job Harness server container:
 *   tsx scripts/resume-frontend-v22-independent-role.mts preview
 *   tsx scripts/resume-frontend-v22-independent-role.mts commit
 *
 * Changes only two project presentation role labels for the existing
 * ai-frontend-v2-2 Profile. This is not a new Resume Profile; a new immutable
 * Revision and Artifact must be published using Job Harness after commit.
 *
 * Critical: create NEW versioned ProjectPresentation records rather than
 * changing the v2.2 records, so earlier Revisions and Profiles remain intact.
 * No job applications or campaigns are touched.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import {
  ResumeLibrarySchema,
  ResumeProfileSchema,
  validateResumeProfileReferences,
} from '../packages/resume-contracts/src/index.ts';

const MODE = process.argv[2] ?? 'preview';
if (MODE !== 'preview' && MODE !== 'commit') throw new Error('Use preview or commit');
const PROFILE_ID = 'ai-frontend-v2-2';
const SOURCE_PRESENTATION_ID = 'one-page-v2-2';
const NEXT_PRESENTATION_ID = 'one-page-v2-2-role-r2';
const PROJECT_IDS = ['dailyuse', 'body-sense'] as const;
const NEW_ROLE = '独立开发（个人项目）';
const ROOT = '/data/resume-frontend-v22-independent-role-staging';
const now = new Date().toISOString();

const db = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  const previousLibrary = await db.getLibrary('primary');
  const previousProfile = await db.getProfile(PROFILE_ID);
  if (!previousLibrary || !previousProfile) throw new Error('Profile or Library does not exist');
  if (previousProfile.archivedAt) throw new Error('Cannot update an archived Profile');
  if (previousProfile.projectSelections.length !== PROJECT_IDS.length) {
    throw new Error('Project selections changed; manual re-review is required');
  }

  // Guard baseline identities, role text and sources of truth before mutation.
  for (const [index, projectId] of PROJECT_IDS.entries()) {
    const selection = previousProfile.projectSelections[index];
    if (selection.projectId !== projectId || selection.presentationId !== SOURCE_PRESENTATION_ID) {
      throw new Error('Unexpected source presentation / ordering for ' + projectId);
    }
  }

  const nextLibrary = structuredClone(previousLibrary);
  for (const projectId of PROJECT_IDS) {
    const project = nextLibrary.projects.find(item => item.id === projectId);
    if (!project) throw new Error('No project ' + projectId);
    const originalPresentation = project.presentations.find(p => p.id === SOURCE_PRESENTATION_ID);
    if (!originalPresentation) throw new Error('Missing presentation ' + projectId + '/' + SOURCE_PRESENTATION_ID);
    if (project.presentations.some(p => p.id === NEXT_PRESENTATION_ID)) {
      throw new Error('Duplicate role presentation ' + projectId + '/' + NEXT_PRESENTATION_ID);
    }
    project.presentations.push({
      ...structuredClone(originalPresentation),
      id: NEXT_PRESENTATION_ID,
      role: { 'zh-CN': NEW_ROLE },
    });
  }
  nextLibrary.version = previousLibrary.version + 1;
  nextLibrary.updatedAt = now;
  const library = ResumeLibrarySchema.parse(nextLibrary);

  const nextProfile = structuredClone(previousProfile);
  nextProfile.version = previousProfile.version + 1;
  nextProfile.updatedAt = now;
  nextProfile.projectSelections = nextProfile.projectSelections.map(p => ({
    ...p,
    presentationId: NEXT_PRESENTATION_ID,
  }));
  const profile = ResumeProfileSchema.parse(nextProfile);
  const issues = validateResumeProfileReferences(library, profile);
  if (issues.length) throw new Error('Resume references invalid: ' + JSON.stringify(issues));

  const before = resolveResume(previousLibrary, previousProfile);
  const after = resolveResume(library, profile);
  const expected = structuredClone(before);
  expected.libraryVersion = library.version;
  expected.profileVersion = profile.version;
  expected.projects = expected.projects.map(project => ({
    ...project, role: NEW_ROLE,
  }));

  // Enforce semantic-only change: no different title, dates, internship, skills,
  // project intros/stacks/highlights, links, or certificates.
  assert.deepStrictEqual(after, expected, 'Unexpected non-role Resume change');
  if (after.projects.length !== 2 || after.projects.some(p => p.role !== NEW_ROLE)) {
    throw new Error('Role normalization incomplete');
  }
  const beforeRoles = before.projects.map(p => p.role);
  const afterRoles = after.projects.map(p => p.role);

  mkdirSync(ROOT, { recursive: true });
  writeFileSync(join(ROOT, 'candidate.json'), JSON.stringify({ library, profile }, null, 2));
  writeFileSync(join(ROOT, 'resolved.json'), JSON.stringify(after, null, 2));
  writeFileSync(join(ROOT, 'audit.json'), JSON.stringify({
    mode: MODE,
    profileId: PROFILE_ID,
    previousProfileVersion: previousProfile.version,
    nextProfileVersion: profile.version,
    previousLibraryVersion: previousLibrary.version,
    nextLibraryVersion: library.version,
    changedField: 'projects[].role',
    beforeRoles, afterRoles,
    oldPresentation:SOURCE_PRESENTATION_ID,
    newPresentation:NEXT_PRESENTATION_ID,
    unchangedTechnicalHighlights:true,
  }, null, 2));

  if (MODE === 'preview') {
    const result = await fetch('http://127.0.0.1:3000/api/v1/resume/preview/pdf', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + process.env.JOB_HARNESS_AUTH_TOKEN,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ library, profile }),
    });
    if (!result.ok) throw new Error('Official PDF preview failed: ' + result.status + ' ' + (await result.text()).slice(0,300));
    const pdf = Buffer.from(await result.arrayBuffer());
    writeFileSync(join(ROOT, 'ai-frontend-v2-2-role-r2.pdf'), pdf);
    console.log('PREVIEW_OK', JSON.stringify({
      profile: PROFILE_ID,
      role: NEW_ROLE,
      oldRoles: beforeRoles,
      pdfBytes: pdf.byteLength,
      profileVersion: profile.version,
      libraryVersion: library.version,
    }));
  } else {
    await db.transaction(async tx => {
      const liveLibrary = await tx.getLibrary('primary');
      const liveProfile = await tx.getProfile(PROFILE_ID);
      if (!liveLibrary || !liveProfile ||
          liveLibrary.version !== previousLibrary.version ||
          liveProfile.version !== previousProfile.version ||
          JSON.stringify(liveLibrary) !== JSON.stringify(previousLibrary) ||
          JSON.stringify(liveProfile) !== JSON.stringify(previousProfile)) {
        throw new Error('Concurrent Profile/Library change; abort safely');
      }
      if (validateResumeProfileReferences(library, profile).length) {
        throw new Error('Invalid references at commit');
      }
      await tx.upsertLibrary(library);
      await tx.upsertProfile(profile);
    });
    console.log('COMMITTED', JSON.stringify({
      profile: PROFILE_ID,
      profileVersion: profile.version,
      libraryVersion:library.version,
      roles: afterRoles,
    }));
  }
} finally {
  db.close();
}
