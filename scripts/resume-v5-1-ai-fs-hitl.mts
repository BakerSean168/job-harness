/**
 * Resume V5.1 rev4 (2026-10-14): AI 全栈 MemoFlow 2nd highlight back to 人机协同编辑
 * (v5-mf-agent-stream -> v5-mf-hitl-form), Arlon's choice after comparison with v4.1.
 * Profile-only change: ai-fullstack-agent-v5-1 v3 -> v4; Library unchanged (v17).
 *
 *   node_modules/.bin/tsx scripts/resume-v5-1-ai-fs-hitl.mts check|preview|commit|publish
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/index.ts';
import { ResumeProfileSchema, validateResumeProfileReferences } from '../packages/resume-contracts/src/index.ts';

const MODE = process.argv[2] ?? 'check';
const LIB = 17, ID = 'ai-fullstack-agent-v5-1', FROM = 3, TO = 4;
const ROOT = '/data/resume-v5-1-staging', EXPORT_DIR = '/data/resumes-v5-1';
const API = process.env.JOB_HARNESS_API || 'http://127.0.0.1:3000/api/v1';
async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { ...init, headers: { authorization: 'Bearer ' + process.env.JOB_HARNESS_AUTH_TOKEN, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${r.status} ${(await r.text()).slice(0, 500)}`);
  return r;
}
const store = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');
try {
  const library = await store.getLibrary('primary');
  if (!library || library.version !== LIB) throw new Error('Library moved: ' + library?.version);
  const base = await store.getProfile(ID);
  if (MODE === 'publish') {
    if (!base || base.version !== TO) throw new Error('Profile not at v' + TO);
    const old = join(EXPORT_DIR, 'rev3-ai-fs'); if (!existsSync(old)) mkdirSync(old);
    const name = base.output.pdfName['zh-CN'] + '.pdf';
    if (existsSync(join(EXPORT_DIR, name)) && !existsSync(join(old, name))) renameSync(join(EXPORT_DIR, name), join(old, name));
    const rev = await (await api(`/resume/profiles/${ID}/revisions`, { method: 'POST', body: JSON.stringify({ expectedProfileVersion: TO, expectedLibraryVersion: LIB, note: 'Resume v5.1 rev4: MemoFlow 人机协同编辑 highlight (2026-10-14)' }) })).json();
    const art = await (await api(`/resume/revisions/${encodeURIComponent(rev.revision.id)}/artifacts`, { method: 'POST', body: JSON.stringify({ kind: 'pdf' }) })).json();
    const bytes = new Uint8Array(await (await api(`/resume/artifacts/${encodeURIComponent(art.artifact.id)}/content`)).arrayBuffer());
    writeFileSync(join(EXPORT_DIR, name), bytes);
    console.log('PUBLISHED', rev.revision.id, art.artifact.id, createHash('sha256').update(bytes).digest('hex'));
  } else {
    if (!base || base.version !== FROM) throw new Error('Source moved');
    const p = structuredClone(base);
    p.version = TO; p.updatedAt = new Date().toISOString();
    const sel = p.projectSelections.find((s: any) => s.projectId === 'dailyuse');
    assert.deepStrictEqual(sel.highlightIds, ['v5-mf-durable-write', 'v5-mf-agent-stream']);
    sel.highlightIds = ['v5-mf-durable-write', 'v5-mf-hitl-form'];
    const profile = ResumeProfileSchema.parse(p);
    const errs = validateResumeProfileReferences(library, profile); if (errs.length) throw new Error(JSON.stringify(errs));
    const r = resolveResume(library, profile), b = resolveResume(library, base);
    for (const k of ['skills', 'workExperiences', 'education', 'certificates'] as const) assert.deepStrictEqual(r[k], b[k]);
    if (MODE === 'check') console.log('CHECK_OK', ID, `${FROM}->${TO}`);
    else if (MODE === 'preview') {
      const bytes = Buffer.from(await (await api('/resume/preview/pdf', { method: 'POST', body: JSON.stringify({ library, profile }) })).arrayBuffer());
      writeFileSync(join(ROOT, ID + '-rev4.pdf'), bytes); console.log('PREVIEW_OK', bytes.length);
    } else if (MODE === 'commit') {
      await store.transaction(async (tx: any) => {
        const cur = await tx.getProfile(ID);
        if (JSON.stringify(cur) !== JSON.stringify(base)) throw new Error('Profile changed');
        await tx.upsertProfile(profile);
      });
      console.log('COMMITTED', ID, TO);
    }
  }
} finally { store.close(); }
