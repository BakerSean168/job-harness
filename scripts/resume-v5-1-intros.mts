/**
 * Resume V5.1 rev2 (2026-10-14): Arlon asked to edit v5.1 directly, replacing the
 * tech-stack-style project intros with product-style intros (是什么 / 解决什么).
 * Additive at Library level: 8 new presentations (one-page-v51-*), 4 v5.1 Profiles
 * bumped v1 -> v2 to select them. Earlier Revisions/Artifacts stay immutable.
 *
 *   node_modules/.bin/tsx scripts/resume-v5-1-intros.mts check|preview|commit|publish
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences } from '../packages/resume-contracts/src/index.ts';

const MODE = process.argv[2] ?? 'check';
const BASE_LIBRARY_VERSION = 14;
const ROOT = process.env.RESUME_V51_STAGING || '/data/resume-v5-1-staging';
const EXPORT_DIR = process.env.RESUME_V51_EXPORT || '/data/resumes-v5-1';
const API = process.env.JOB_HARNESS_API || 'http://127.0.0.1:3000/api/v1';
const zh = (s: string) => ({ 'zh-CN': s });
const now = new Date().toISOString();
mkdirSync(ROOT, { recursive: true });

const INTRO: Record<string, string> = {
  dailyuse: 'AI 原生个人效率平台，打通 AI 对话与目标、任务、日程、提醒、知识库，让对话里的意图落成可执行、可追踪的事项。',
  'body-sense': '用 Agent 持续理解个人身体状况的应用。用户自然语言描述身体变化，系统结构化记录在 3D 人体上，经用户确认形成综合评估，并管理、执行多份训练计划。',
};
const PROFILE_IDS = ['ai-frontend-v5-1', 'ai-fullstack-v5-1', 'ai-fullstack-agent-v5-1', 'ai-agent-app-v5-1'];
const newId = (old: string) => old.replace('one-page-v5-', 'one-page-v51-');
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
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
  return pruned;
}

const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  if (MODE === 'publish') {
    const library = await store.getLibrary('primary');
    if (!library || library.version !== BASE_LIBRARY_VERSION + 1) throw new Error('publish expects Library v' + (BASE_LIBRARY_VERSION + 1));
    const old = join(EXPORT_DIR, 'rev1');
    if (!existsSync(old)) { mkdirSync(old); for (const f of (await import('node:fs')).readdirSync(EXPORT_DIR)) if (f.endsWith('.pdf')) renameSync(join(EXPORT_DIR, f), join(old, f)); }
    const results: any[] = [];
    for (const id of PROFILE_IDS) {
      const profile = await store.getProfile(id);
      if (!profile || profile.version !== 2) throw new Error('Profile not at v2: ' + id);
      const rev = await (await api(`/resume/profiles/${encodeURIComponent(id)}/revisions`, { method: 'POST', body: JSON.stringify({ expectedProfileVersion: 2, expectedLibraryVersion: library.version, note: 'Resume v5.1 rev2: product-style project intros (2026-10-14)' }) })).json();
      const art = await (await api(`/resume/revisions/${encodeURIComponent(rev.revision.id)}/artifacts`, { method: 'POST', body: JSON.stringify({ kind: 'pdf' }) })).json();
      const bytes = new Uint8Array(await (await api(`/resume/artifacts/${encodeURIComponent(art.artifact.id)}/content`)).arrayBuffer());
      const target = join(EXPORT_DIR, profile.output.pdfName['zh-CN'] + '.pdf');
      writeFileSync(target, bytes);
      results.push({ profileId: id, revisionId: rev.revision.id, artifactId: art.artifact.id, sha256: sha256(bytes), export: target });
    }
    writeFileSync(join(ROOT, 'publish-rev2.json'), JSON.stringify(results, null, 2));
    console.log('PUBLISHED', JSON.stringify(results, null, 2));
  } else {
    const original = await store.getLibrary('primary');
    if (!original || original.version !== BASE_LIBRARY_VERSION) throw new Error(`Baseline changed: expected v${BASE_LIBRARY_VERSION}, found v${original?.version}`);
    const bases = await Promise.all(PROFILE_IDS.map(id => store.getProfile(id)));
    bases.forEach((b, i) => { if (!b || b.version !== 1) throw new Error('Source moved: ' + PROFILE_IDS[i]); });
    const library = structuredClone(original);
    const needed = new Set<string>();
    for (const b of bases) for (const s of b!.projectSelections) needed.add(s.projectId + '|' + s.presentationId);
    for (const key of needed) {
      const [projectId, presId] = key.split('|');
      const project = library.projects.find((p: any) => p.id === projectId);
      const src = project.presentations.find((p: any) => p.id === presId);
      if (project.presentations.some((p: any) => p.id === newId(presId!))) throw new Error('Presentation exists: ' + newId(presId!));
      project.presentations.push({ ...structuredClone(src), id: newId(presId!), description: zh(INTRO[projectId!]!) });
    }
    library.version = original.version + 1; library.updatedAt = now;
    const parsed = ResumeLibrarySchema.parse(library);
    const profiles = bases.map(b => {
      const p = structuredClone(b);
      p.version = 2; p.updatedAt = now;
      p.projectSelections = p.projectSelections.map((s: any) => ({ ...s, presentationId: newId(s.presentationId) }));
      return ResumeProfileSchema.parse(p);
    });
    const allBefore = await store.listProfiles({ includeArchived: true });
    let preserved = 0;
    for (const old of allBefore) {
      let before: any; try { before = resolveResume(original, old); } catch { continue; }
      assert.deepStrictEqual(resolveResume(parsed, old), { ...before, libraryVersion: parsed.version }, 'changed: ' + old.id); preserved++;
    }
    for (const [i, profile] of profiles.entries()) {
      const errs = validateResumeProfileReferences(parsed, profile);
      if (errs.length) throw new Error(profile.id + ' refs ' + JSON.stringify(errs));
      const r = resolveResume(parsed, profile), b = resolveResume(original, bases[i]!);
      for (const k of ['skills', 'workExperiences', 'education', 'certificates'] as const) assert.deepStrictEqual(r[k], b[k], profile.id + ' ' + k);
      assert.deepStrictEqual(r.projects.map((p: any) => p.highlights), b.projects.map((p: any) => p.highlights), profile.id + ' highlights');
    }
    if (MODE === 'check') console.log('CHECK_OK', JSON.stringify({ library: `${original.version}->${parsed.version}`, presentations: [...needed].map(k => newId(k.split('|')[1]!)), preserved }));
    else if (MODE === 'preview') {
      for (const profile of profiles) {
        const r = await api('/resume/preview/pdf', { method: 'POST', body: JSON.stringify({ library: previewLibraryFor(parsed, profile), profile }) });
        const bytes = Buffer.from(await r.arrayBuffer());
        writeFileSync(join(ROOT, profile.id + '-rev2.pdf'), bytes);
        console.log('PREVIEW_OK', profile.id, bytes.length);
      }
    } else if (MODE === 'commit') {
      await store.transaction(async (tx: any) => {
        const live = await tx.getLibrary('primary');
        if (!live || JSON.stringify(live) !== JSON.stringify(original)) throw new Error('Library changed; aborting');
        for (const b of bases) { const cur = await tx.getProfile(b!.id); if (!cur || JSON.stringify(cur) !== JSON.stringify(b)) throw new Error('Profile changed: ' + b!.id); }
        await tx.upsertLibrary(parsed);
        for (const p of profiles) await tx.upsertProfile(p);
      });
      console.log('COMMITTED', JSON.stringify({ library: parsed.version, profiles: PROFILE_IDS }));
    }
  }
} finally { store.close(); }
