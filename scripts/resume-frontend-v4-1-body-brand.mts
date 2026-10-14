/**
 * 2026-10-14: align both personal-project brands in frontend V4.1 only.
 * Existing immutable Revisions #1/#2 and older Profile presentations
 * remain unchanged. The only materialized text delta must be the name
 * "BodySense" -> "体悟 BodySense" in the current frontend V4.1.
 *
 * tsx scripts/resume-frontend-v4-1-body-brand.mts check|preview|commit
 * The commit runs only once, on top of primary Library v10 / Profile v2.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { renderResumeHtml } from '../packages/resume-renderer/src/index.ts';
import { ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences } from '../packages/resume-contracts/src/index.ts';

const mode = process.argv[2] ?? 'check';
if (!['check', 'preview', 'commit'].includes(mode)) throw new Error('Usage: check|preview|commit');

const LIBRARY = 'primary';
const PROFILE = 'ai-frontend-v4-1';
const EXPECTED_LIBRARY_VERSION = 10;
const EXPECTED_PROFILE_VERSION = 2;
const ORIGINAL_PRESENTATION = 'one-page-v2-3';
const NEW_PRESENTATION = 'one-page-v4-1-body-brand-r3';
const NEW_NAME = '体悟 BodySense';
const OFFICIAL_API = 'http://127.0.0.1:3000/api/v1/resume/preview/pdf';
const PREVIEW_PATH = '/data/resume-v41-body-brand-preview-20261014.pdf';
const db = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');

try {
  const librarySource = await db.getLibrary(LIBRARY);
  const profileSource = await db.getProfile(PROFILE);
  if (!librarySource || !profileSource || librarySource.version !== EXPECTED_LIBRARY_VERSION
       || profileSource.version !== EXPECTED_PROFILE_VERSION || profileSource.archivedAt) {
    throw new Error('Unexpected canonical Library/Profile version; refusing to proceed');
  }
  if (profileSource.templateId !== 'compact-project-links-v2') throw new Error('Unexpected template');

  const allProfiles = await db.listProfiles({ includeArchived:true });
  if (allProfiles.some(p => p.projectSelections.some(sel => sel.presentationId === NEW_PRESENTATION))) {
    throw new Error('New presentation id already selected by another Profile');
  }

  const before = resolveResume(librarySource, profileSource);
  assert.deepStrictEqual(before.projects.map(p => p.name), ['知行 MemoFlow', 'BodySense']);
  assert.deepStrictEqual(profileSource.projectSelections.map(p => [p.projectId,p.presentationId]),[
    ['dailyuse', ORIGINAL_PRESENTATION],['body-sense', ORIGINAL_PRESENTATION],
  ]);

  const libraryInput = structuredClone(librarySource);
  const project = libraryInput.projects.find(p => p.id === 'body-sense');
  if (!project) throw new Error('Missing BodySense project');
  const presentation = project.presentations.find(p => p.id === ORIGINAL_PRESENTATION);
  if (!presentation || presentation.name?.['zh-CN'] !== 'BodySense'
      || project.presentations.some(p => p.id === NEW_PRESENTATION)) {
    throw new Error('Unexpected project presentation state');
  }

  project.presentations.push({
    ...structuredClone(presentation), id: NEW_PRESENTATION, name: {'zh-CN': NEW_NAME},
  });
  const now = new Date().toISOString();
  libraryInput.version++;
  libraryInput.updatedAt = now;
  const library = ResumeLibrarySchema.parse(libraryInput);

  const profileInput = structuredClone(profileSource);
  profileInput.version++;
  profileInput.updatedAt = now;
  profileInput.projectSelections = profileInput.projectSelections.map(sel => sel.projectId === 'body-sense'
    ? {...sel,presentationId:NEW_PRESENTATION} : sel);
  const profile = ResumeProfileSchema.parse(profileInput);
  const errors = validateResumeProfileReferences(library,profile);
  if (errors.length) throw new Error('Broken Profile references: '+JSON.stringify(errors));

  // Stable side-by-side comparison: ONLY the BodySense project heading may
  // change. Description, dates, skills, internship, project bullets, and
  // hyperlinks must be identical.
  const after = resolveResume(library,profile);
  const expected = structuredClone(before);
  const expectedProject = expected.projects.find(p => p.id === 'body-sense');
  if (!expectedProject) throw new Error('Missing BodySense in ResolvedResume');
  expectedProject.name = NEW_NAME;
  // Incremental Library/Profile versions are expected metadata changes;
  // compare the entire user-facing ResolvedResume after accounting for them.
  expected.libraryVersion = library.version;
  expected.profileVersion = profile.version;
  assert.deepStrictEqual(after,expected);
  assert.deepStrictEqual(after.projects.map(p=>p.name),['知行 MemoFlow',NEW_NAME]);

  for (const oldProfile of allProfiles) {
    if (oldProfile.id === PROFILE) continue;
    // A new, unreferenced presentation must not change any other Profile's
    // resolved document; preserve even old archived profiles' semantics.
    let beforeOther;
    try { beforeOther = resolveResume(librarySource,oldProfile); }
    catch { continue; /* pre-existing unresolved historical profile */ }
    beforeOther.libraryVersion = library.version;
    assert.deepStrictEqual(resolveResume(library,oldProfile),beforeOther,
      'Existing Profile output changed: '+oldProfile.id);
  }
  const html = renderResumeHtml(after);
  assert.ok(html.includes(NEW_NAME) && html.includes('知行 MemoFlow'));
  assert.ok(!html.includes('项目亮点：'));
  for (const p of after.projects) for(const link of p.links) {
    assert.ok(html.includes('href="'+link.url+'"'), 'Missing project link: '+link.url);
  }

  if (mode === 'preview') {
    const res = await fetch(OFFICIAL_API,{
      method:'POST',
      headers:{
        authorization:'Bearer '+process.env.JOB_HARNESS_AUTH_TOKEN,
        'content-type':'application/json',
      },
      body:JSON.stringify({library,profile}),
    });
    if (!res.ok) throw new Error('Official PDF Preview rejected '+res.status+' '+(await res.text()).slice(0,250));
    const pdf = Buffer.from(await res.arrayBuffer());
    writeFileSync(PREVIEW_PATH,pdf);
    console.log('PREVIEW_OK',JSON.stringify({
      path:PREVIEW_PATH,bytes:pdf.length,names:after.projects.map(p=>p.name),
      current:PROFILE,profileVersion:profile.version,libraryVersion:library.version,
      onlyChange:'BodySense project heading',
    }));
  } else if (mode === 'commit') {
    await db.transaction(async tx => {
      const currentLibrary = await tx.getLibrary(LIBRARY);
      const currentProfile = await tx.getProfile(PROFILE);
      if (!currentLibrary || !currentProfile
          || JSON.stringify(currentLibrary)!==JSON.stringify(librarySource)
          || JSON.stringify(currentProfile)!==JSON.stringify(profileSource)) {
        throw new Error('Optimistic conflict: Profile or Library changed; refuse writes');
      }
      if ((await tx.listProfiles({includeArchived:true})).some(p => p.projectSelections.some(sel=>sel.presentationId===NEW_PRESENTATION))) {
        throw new Error('Presentation is already in use; refuse writes');
      }
      await tx.upsertLibrary(library);
      await tx.upsertProfile(profile);
    });
    console.log('COMMITTED',JSON.stringify({
      library:library.id,libraryVersion:library.version,
      profile:profile.id,profileVersion:profile.version,
      projects:after.projects.map(p=>p.name),
    }));
  } else {
    console.log('CHECK_OK',JSON.stringify({
      profile:PROFILE,
      oldVersions:[librarySource.version,profileSource.version],
      newVersions:[library.version,profile.version],
      newPresentation:NEW_PRESENTATION,
      oldNames:before.projects.map(p=>p.name),newNames:after.projects.map(p=>p.name),
      checkedExistingProfiles:allProfiles.length,onlyChange:'BodySense project heading',
    }));
  }
} finally {
  db.close();
}
