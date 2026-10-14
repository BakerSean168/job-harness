/**
 * Resume V5.1 rev3-fe (2026-10-14): frontend gets Arlon's AI-coding line + 原型设计 (Figma / Penpot):
 * 「熟练使用 Codex 等编码 Agent，能结合 MCP 工具与 Skills 沉淀，配合 TDD 等规范搭建项目级开发 Harness。」
 * Additive: 2 new SkillBlocks (v51b-fe-*), ai-frontend-v5-1 v2 -> v3, 5 skill lines (Arlon asked to add both).
 *
 *   node_modules/.bin/tsx scripts/resume-v5-1-fe-ai-proto.mts check|preview|commit|publish
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { ResumeLibrarySchema, ResumeProfileSchema, validateResumeProfileReferences } from '../packages/resume-contracts/src/index.ts';

const MODE = process.argv[2] ?? 'check';
const BASE_LIBRARY_VERSION = 16;
const ROOT = process.env.RESUME_V51_STAGING || '/data/resume-v5-1-staging';
const EXPORT_DIR = process.env.RESUME_V51_EXPORT || '/data/resumes-v5-1';
const API = process.env.JOB_HARNESS_API || 'http://127.0.0.1:3000/api/v1';
const zh = (s: string) => ({ 'zh-CN': s });
const now = new Date().toISOString();
mkdirSync(ROOT, { recursive: true });

const AIC = '熟练使用 Codex 等编码 Agent，能结合 MCP 工具与 Skills 沉淀，配合 TDD 等规范搭建项目级开发 Harness。';
const NEW_SKILLS: Record<string, { replaces: string | null; text: string }> = {
  'v51b-fe-eng-ai': { replaces: 'v51-fe-eng', text: '<strong>工程化与 AI 编程：</strong>熟悉 Vite、pnpm / Nx、Vitest、Playwright 与 GitHub Actions；' + AIC },
  'v51b-fe-proto': { replaces: null, text: '<strong>原型设计：</strong>能使用 Figma、Penpot 完成页面原型与交互设计，并据此拆分前端组件。' },
};
const PROFILE_IDS = ['ai-frontend-v5-1'];
const FROM = 2, TO = 3;
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
    const old = join(EXPORT_DIR, 'rev2-fe');
    if (!existsSync(old)) { mkdirSync(old); for (const f of (await import('node:fs')).readdirSync(EXPORT_DIR)) if (f.endsWith('.pdf') && f.includes('前端')) renameSync(join(EXPORT_DIR, f), join(old, f)); }
    const results: any[] = [];
    for (const id of PROFILE_IDS) {
      const profile = await store.getProfile(id);
      if (!profile || profile.version !== TO) throw new Error('Profile not at v' + TO + ': ' + id);
      const rev = await (await api(`/resume/profiles/${encodeURIComponent(id)}/revisions`, { method: 'POST', body: JSON.stringify({ expectedProfileVersion: TO, expectedLibraryVersion: library.version, note: 'Resume v5.1 rev3: frontend AI-coding + prototype skills (2026-10-14)' }) })).json();
      const art = await (await api(`/resume/revisions/${encodeURIComponent(rev.revision.id)}/artifacts`, { method: 'POST', body: JSON.stringify({ kind: 'pdf' }) })).json();
      const bytes = new Uint8Array(await (await api(`/resume/artifacts/${encodeURIComponent(art.artifact.id)}/content`)).arrayBuffer());
      const target = join(EXPORT_DIR, profile.output.pdfName['zh-CN'] + '.pdf');
      writeFileSync(target, bytes);
      results.push({ profileId: id, revisionId: rev.revision.id, artifactId: art.artifact.id, sha256: sha256(bytes), export: target });
    }
    writeFileSync(join(ROOT, 'publish-rev3-fe.json'), JSON.stringify(results, null, 2));
    console.log('PUBLISHED', JSON.stringify(results, null, 2));
  } else {
    const original = await store.getLibrary('primary');
    if (!original || original.version !== BASE_LIBRARY_VERSION) throw new Error(`Baseline changed: expected v${BASE_LIBRARY_VERSION}, found v${original?.version}`);
    const bases = await Promise.all(PROFILE_IDS.map(id => store.getProfile(id)));
    bases.forEach((b, i) => { if (!b || b.version !== FROM) throw new Error('Source moved: ' + PROFILE_IDS[i]); });
    const library = structuredClone(original);
    for (const [id, v] of Object.entries(NEW_SKILLS)) {
      if (library.skills.some((x: any) => x.id === id)) throw new Error('Skill exists: ' + id);
      library.skills.push({ id, label: null, content: zh(v.text), keywords: [] });
    }
    library.version = original.version + 1; library.updatedAt = now;
    const parsed = ResumeLibrarySchema.parse(library);
    const profiles = bases.map(b => {
      const p = structuredClone(b);
      p.version = TO; p.updatedAt = now;
      p.skillIds = p.skillIds.map((id: string) => Object.entries(NEW_SKILLS).find(([, v]) => v.replaces === id)?.[0] ?? id);
      p.skillIds.push('v51b-fe-proto');
      assert.deepStrictEqual(p.skillIds, ['v51-fe-base', 'v51-fe-framework', 'v51-fe-perf', 'v51b-fe-eng-ai', 'v51b-fe-proto']);
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
      for (const k of ['projects', 'workExperiences', 'education', 'certificates'] as const) assert.deepStrictEqual(r[k], b[k], profile.id + ' ' + k);
    }
    if (MODE === 'check') console.log('CHECK_OK', JSON.stringify({ library: `${original.version}->${parsed.version}`, preserved }));
    else if (MODE === 'preview') {
      for (const profile of profiles) {
        const r = await api('/resume/preview/pdf', { method: 'POST', body: JSON.stringify({ library: previewLibraryFor(parsed, profile), profile }) });
        const bytes = Buffer.from(await r.arrayBuffer());
        writeFileSync(join(ROOT, profile.id + '-rev3-fe.pdf'), bytes);
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
