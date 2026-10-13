/**
 * Frontend v2.2 Header Simplification — immutable Revision #6.
 *
 * Intent: remove the redundant 求职意向： prefix while retaining the
 * targeted role, 2026 graduation cohort, and the original privacy choices.
 *
 * One-time execution INSIDE the Job Harness server container:
 *   tsx scripts/resume-frontend-v22-header-r6.mts preview
 *   tsx scripts/resume-frontend-v22-header-r6.mts commit
 *
 * Only the existing frontend Profile's "positioning" changes.
 * Shared Library, existing Profiles, revisions/artifacts, campaigns, and
 * applications are not changed. An immutable Revision #6 is then published
 * through the native Job Harness resume revision API.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import {
  ResumeProfileSchema,
  validateResumeProfileReferences,
} from '../packages/resume-contracts/src/index.ts';

const MODE = process.argv[2] ?? 'preview';
if (MODE !== 'preview' && MODE !== 'commit') throw new Error('Expected preview or commit');

const PROFILE_ID = 'ai-frontend-v2-2';
const BEFORE_POSITIONING = '求职意向：前端开发工程师｜2026届本科毕业生';
const TARGET_ROLE = '前端开发工程师';
const AFTER_POSITIONING = '前端开发工程师｜2026届本科毕业生';
const ROOT = '/data/resume-frontend-v22-header-r6-staging';
const now = new Date().toISOString();
const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');

try {
  const library = await store.getLibrary('primary');
  const previous = await store.getProfile(PROFILE_ID);
  if (!library || !previous || previous.archivedAt) {
    throw new Error('Active frontend Profile or primary Library unavailable');
  }
  if (library.version !== 8 || previous.version !== 5) {
    throw new Error('Frontend baseline is no longer Library v8 / Profile v5; manual inspection required');
  }
  if (previous.positioning?.['zh-CN'] !== BEFORE_POSITIONING ||
      previous.targetRole?.['zh-CN'] !== TARGET_ROLE) {
    throw new Error('Unexpected existing positioning or target role');
  }

  const candidate = structuredClone(previous);
  candidate.version += 1;
  candidate.updatedAt = now;
  candidate.positioning = { 'zh-CN': AFTER_POSITIONING };
  const profile = ResumeProfileSchema.parse(candidate);
  const issues = validateResumeProfileReferences(library, profile);
  if (issues.length) throw new Error('Invalid resume references: ' + JSON.stringify(issues));

  const before = resolveResume(library, previous);
  const after = resolveResume(library, profile);
  const expected = structuredClone(before);
  expected.profileVersion = profile.version;
  expected.positioning = AFTER_POSITIONING;
  assert.deepStrictEqual(after, expected, 'Unexpected non-header resume change');

  mkdirSync(ROOT, { recursive:true });
  writeFileSync(join(ROOT, 'candidate.json'), JSON.stringify({library,profile},null,2));
  writeFileSync(join(ROOT, 'audit.json'),JSON.stringify({
    profileId:PROFILE_ID,
    changedField:'positioning',
    previousText:BEFORE_POSITIONING,
    newText:AFTER_POSITIONING,
    sourceProfileVersion:previous.version,
    nextProfileVersion:profile.version,
    sourceLibraryVersion:library.version,
    libraryWillChange:false,
    genderOrAgeAdded:false,
  },null,2));

  if (MODE === 'preview') {
    const response = await fetch('http://127.0.0.1:3000/api/v1/resume/preview/pdf', {
      method:'POST',
      headers:{
        authorization:'Bearer '+process.env.JOB_HARNESS_AUTH_TOKEN,
        'content-type':'application/json',
      },
      body:JSON.stringify({library,profile}),
    });
    if (!response.ok) {
      throw new Error('Official PDF preview failed '+response.status+' '+(await response.text()).slice(0,400));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(join(ROOT,'ai-frontend-v2-2-header-r6.pdf'),bytes);
    console.log('PREVIEW_OK',JSON.stringify({
      profileId:PROFILE_ID,
      profileVersion:profile.version,
      libraryVersion:library.version,
      positioning:AFTER_POSITIONING,
      pdfBytes:bytes.length,
    }));
  } else {
    await store.transaction(async tx=>{
      const liveProfile=await tx.getProfile(PROFILE_ID);
      const liveLibrary=await tx.getLibrary('primary');
      if (!liveProfile || !liveLibrary ||
          liveProfile.version !== previous.version ||
          liveLibrary.version !== library.version ||
          JSON.stringify(liveProfile) !== JSON.stringify(previous) ||
          JSON.stringify(liveLibrary) !== JSON.stringify(library)) {
        throw new Error('Concurrent change: refusing stale header update');
      }
      if (validateResumeProfileReferences(liveLibrary,profile).length) {
        throw new Error('Invalid live profile references');
      }
      await tx.upsertProfile(profile);
    });
    console.log('COMMITTED',JSON.stringify({
      profileId:PROFILE_ID,
      profileVersion:profile.version,
      libraryVersion:library.version,
      positioning:AFTER_POSITIONING,
    }));
  }
} finally {
  store.close();
}
