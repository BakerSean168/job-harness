/**
 * Minimal final copyedit for the four V5.1 profiles. No new Resume Profile.
 * Maintains the invariant of four grouped skills, two source-backed highlights
 * per project, 2026 education header, and 1-page clickable official PDF.
 *
 * Run: tsx scripts/resume-v51-final-polish.mts check|preview|commit
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SqliteResumeStore} from '../packages/persistence-sqlite/src/resume-store.ts';
import {resolveResume} from '../packages/resume-application/src/index.ts';
import {ResumeLibrarySchema,ResumeProfileSchema,validateResumeProfileReferences} from '../packages/resume-contracts/src/index.ts';
import {auditV2xFoundation} from './resume-v2x-foundation-policy.ts';

const mode=process.argv[2]??'check';
if(!['check','preview','commit'].includes(mode))throw Error('Usage: check | preview | commit');
const PROFILE_IDS=[
 'ai-frontend-v5-1','ai-fullstack-v5-1',
 'ai-agent-app-v5-1','ai-fullstack-agent-v5-1',
] as const;
const EXPECTED_PROFILE_VERSIONS:Record<string,number>={
 'ai-frontend-v5-1':3,'ai-fullstack-v5-1':3,
 'ai-agent-app-v5-1':3,'ai-fullstack-agent-v5-1':4,
};
const BASE_LIBRARY_VERSION=18;
const skillEdits=[
 {
  id:'v51-fe-base',
  from:'<strong>前端基础：</strong>熟悉 JavaScript（ES6+、事件循环、Promise）、TypeScript 与 HTML5/CSS3，了解浏览器渲染原理。',
  to:'<strong>前端基础：</strong>熟悉 JavaScript（ES6+）、TypeScript、HTML5/CSS3，理解闭包、原型链与事件循环。',
 },
 {
  id:'v51-fe-framework',
  from:'<strong>框架与组件：</strong>熟悉 Vue 3 / Pinia、React Hooks，能基于组件库快速开发页面，并将可复用 UI 封装为业务组件。',
  to:'<strong>框架与组件：</strong>熟悉 Vue 3 / Pinia、React Hooks，能结合 Figma / Penpot 原型设计并封装可复用业务组件。',
 },
] as const;
const highlightEdits=[
 {
  project:'dailyuse',
  id:'v5-mf-list-perf',
  from:'为 Electron 本地知识库引入虚拟列表与按文件身份失效的内容缓存，万篇文档重复搜索不再重复读取正文。',
  to:'为 Electron 本地知识库引入虚拟列表减少渲染节点，按文件身份缓存正文并随内容变更失效，降低重复搜索的读取开销。',
 },
 {
  project:'dailyuse',
  id:'v5-mf-hitl-form',
  from:'AI 以类型化语义动作逐步填写原生目标表单，结合 fencing 租约与用户接管，阻止过期的 AI 写入覆盖人工编辑。',
  to:'AI 通过类型化语义动作逐步填写原生目标表单，结合 fencing 租约和用户接管，避免过期 AI 操作覆盖人工编辑。',
 },
 {
  project:'body-sense',
  id:'v5-bs-contract-first',
  from:'以 OpenAPI / Protobuf 维护契约并生成代码，CI 做破坏性变更与变异检查，Go / Python / Web 共 1500+ 测试。',
  to:'以 OpenAPI / Protobuf 维护 Go / Python / Web 接口契约与代码生成，在 CI 中执行破坏性变更及契约变异检查。',
 },
] as const;
const UNUSED_FE_PROTO='v51b-fe-proto';
const STAGING=process.env.RESUME_POLISH_STAGING_DIR ?? '/data/resume-v51-final-polish-preview-20261014';
const PREVIEW_API=process.env.RESUME_PREVIEW_API ?? 'http://127.0.0.1:3000/api/v1/resume/preview/pdf';

const store=new SqliteResumeStore(process.env.JOB_HARNESS_DB||'/data/job-harness.db');
try{
 const librarySource=await store.getLibrary('primary');
 if(!librarySource||librarySource.version!==BASE_LIBRARY_VERSION)
   throw Error('Canonical library baseline changed');
 const allProfiles=await store.listProfiles({includeArchived:true});
 const active=allProfiles.filter(p=>!p.archivedAt);
 assert.deepStrictEqual(active.map(p=>p.id).sort(),PROFILE_IDS.slice().sort());
 if(allProfiles.length!==9)throw Error('Unexpected Profile catalog count');
 for(const id of PROFILE_IDS){
   const p=active.find(p=>p.id===id);
   if(!p||p.version!==EXPECTED_PROFILE_VERSIONS[id])throw Error('Profile version changed '+id);
 }
 const nextLib=structuredClone(librarySource);
 for(const edit of skillEdits){
  const item=nextLib.skills.find(s=>s.id===edit.id);
  if(!item||item.content['zh-CN']!==edit.from)
   throw Error('Unexpected canonical skill text '+edit.id);
  item.content={'zh-CN':edit.to};
 }
 const proto=nextLib.skills.find(s=>s.id===UNUSED_FE_PROTO);
 if(!proto||!proto.content['zh-CN'].includes('Figma'))throw Error('Missing expected prototype skill');
 const protoIndex=nextLib.skills.findIndex(s=>s.id===UNUSED_FE_PROTO);
 nextLib.skills.splice(protoIndex,1);
 for(const edit of highlightEdits){
  const project=nextLib.projects.find(p=>p.id===edit.project);
  const item=project?.highlights.find(h=>h.id===edit.id);
  if(!item||item.detail['zh-CN']!==edit.from)throw Error('Unexpected technical highlight '+edit.id);
  item.detail={'zh-CN':edit.to};
 }
 const time=new Date().toISOString();
 nextLib.version++;
 nextLib.updatedAt=time;
 const library=ResumeLibrarySchema.parse(nextLib);

 const frontendBase=active.find(p=>p.id==='ai-frontend-v5-1');
 assert.ok(frontendBase);
 assert.deepStrictEqual(frontendBase.skillIds,[
  'v51-fe-base','v51-fe-framework','v51-fe-perf','v51b-fe-eng-ai','v51b-fe-proto',
 ]);
 const feInput=structuredClone(frontendBase);
 feInput.skillIds=feInput.skillIds.filter(x=>x!==UNUSED_FE_PROTO);
 feInput.version++;
 feInput.updatedAt=time;
 const polishedFrontend=ResumeProfileSchema.parse(feInput);
 const profiles=active.map(p=>p.id===polishedFrontend.id?polishedFrontend:p);
 for(const p of [...profiles,...allProfiles.filter(p=>p.archivedAt)]){
   const issues=validateResumeProfileReferences(library,p);
   if(issues.length)throw Error('Broken references: '+p.id+' '+JSON.stringify(issues));
 }
 const differences=[] as unknown[];
 for(const next of profiles){
  const old=active.find(p=>p.id===next.id)!;
  const before=resolveResume(librarySource,old);
  const after=resolveResume(library,next);
  const expected=structuredClone(before);
  expected.libraryVersion=after.libraryVersion;
  expected.profileVersion=after.profileVersion;
  const indexedSkillEdits=new Map(skillEdits.map(e=>[e.id,e.to]));
  for(const skill of expected.skills){
    if(indexedSkillEdits.has(skill.id))skill.content=indexedSkillEdits.get(skill.id)!;
  }
  if(next.id===polishedFrontend.id){
    expected.skills=expected.skills.filter(s=>s.id!==UNUSED_FE_PROTO);
  }
  const hlMap=new Map(highlightEdits.map(e=>[e.project+'/'+e.id,e.to]));
  for(const project of expected.projects){
   for(const highlight of project.highlights){
     const text=hlMap.get(project.id+'/'+highlight.id);
     if(text!==undefined)highlight.detail=text;
   }
  }
  assert.deepStrictEqual(after,expected,'Unintended user-visible diff in '+next.id);
  const result=auditV2xFoundation(next,after);
  assert.deepStrictEqual(result.errors,[],next.id+' '+JSON.stringify(result.errors));
  assert.deepStrictEqual(result.warnings,[],next.id+' '+JSON.stringify(result.warnings));
  if(after.skills.length!==4)throw Error('Exactly 4 skill groups required: '+next.id);
  assert.deepStrictEqual(new Set(after.projects.map(p=>p.name)),new Set(['知行 MemoFlow','体悟 BodySense']));
  assert.equal(after.projects.flatMap(p=>p.links).length,4);
  assert.deepStrictEqual(after.projects.map(p=>p.highlights.length),[2,2]);
  differences.push({id:next.id,skills:after.skills.length,projects:after.projects.map(p=>p.name)});
 }
 // Archived profiles must continue to resolve to identical content.
 for(const historical of allProfiles.filter(p=>p.archivedAt)){
  const a=resolveResume(librarySource,historical);
  const b=resolveResume(library,historical);
  a.libraryVersion=b.libraryVersion;
  assert.deepStrictEqual(b,a,'Archive output changed');
 }
 if(mode==='preview'){
  mkdirSync(STAGING,{recursive:true});
  for(const p of profiles){
   const result=await fetch(PREVIEW_API,{
    method:'POST',headers:{
     authorization:'Bearer '+process.env.JOB_HARNESS_AUTH_TOKEN,
     'content-type':'application/json',
    },body:JSON.stringify({library,profile:p}),
   });
   if(!result.ok)throw Error('Official renderer '+p.id+': HTTP '+result.status+' '+(await result.text()).slice(0,150));
   const bytes=Buffer.from(await result.arrayBuffer());
   writeFileSync(join(STAGING,p.id+'.pdf'),bytes);
   console.log('PREVIEW_OK',JSON.stringify({profile:p.id,bytes:bytes.length}));
  }
 }else if(mode==='commit'){
  await store.transaction(async tx=>{
    const current=await tx.getLibrary('primary');
    if(!current||JSON.stringify(current)!==JSON.stringify(librarySource))
      throw Error('Concurrent Library update: no changes');
    const latest=await tx.listProfiles({includeArchived:true});
    if(JSON.stringify(latest)!==JSON.stringify(allProfiles))
      throw Error('Concurrent Profile modification: no changes');
    await tx.upsertLibrary(library);
    await tx.upsertProfile(polishedFrontend);
  });
  console.log('COMMITTED',JSON.stringify({
    libraryVersion:library.version,frontendVersion:polishedFrontend.version,
    otherProfilesUnchanged:3,deletedUnusedSkills:[UNUSED_FE_PROTO],
  }));
 }else console.log('CHECK_OK',JSON.stringify({
   libraryVersion:[librarySource.version,library.version],
   frontendVersion:[frontendBase.version,polishedFrontend.version],
   modifications:skillEdits.length+highlightEdits.length,
   deletedUnusedSkill:UNUSED_FE_PROTO,profiles:differences,
 }));
}finally{store.close()}
