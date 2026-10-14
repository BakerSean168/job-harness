/**
 * Additive job-harness authoring: 2026 graduate fullstack, Agent application,
 * and AI-fullstack V4.1. Canonical single-page presentation from frontend V4.1.
 *
 * Execute in running Server container:
 *   tsx scripts/resume-other-v4-1.mts check|preview|commit
 *
 * commit is a guarded atomic transaction, refused if already published.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SqliteResumeStore} from '../packages/persistence-sqlite/src/resume-store.ts';
import {resolveResume} from '../packages/resume-application/src/index.ts';
import {renderResumeHtml} from '../packages/resume-renderer/src/index.ts';
import {
 ResumeLibrarySchema,ResumeProfileSchema,validateResumeProfileReferences,
} from '../packages/resume-contracts/src/index.ts';
import {auditV2xFoundation} from './resume-v2x-foundation-policy.ts';

const mode=process.argv[2]??'check';
if(!['check','preview','commit'].includes(mode)) throw Error('Usage: check | preview | commit');
const BASE_LIBRARY_VERSION=11;
const NEXT_LIBRARY_VERSION=12;
const STAGING='/data/resume-other-v4-1-staging';
const PREVIEW_API='http://127.0.0.1:3000/api/v1/resume/preview/pdf';
const zh=(text:string)=>({'zh-CN':text});
const now=new Date().toISOString();
type ProjectId='dailyuse'|'body-sense';
type RoleKey='fullstack'|'agent'|'ai-fullstack';
interface Spec {
 key:RoleKey;
 oldId:string;
 newId:string;
 role:string;
 techSummary:string;
 short:string;
 presentation:string;
 skills:Readonly<Record<string,string>>;
 workIds:readonly string[];
 work:Readonly<Record<string,string>>;
 projects:readonly {id:ProjectId;highlights:readonly string[]}[];
 highlights:Readonly<Record<string,string>>;
}
const facts={
 bizFS:'<strong>业务交付：</strong>使用 Vue 3 + TypeScript 开发 OLP AI Knowledge 前端，连通内容生成、保存、发布及预览下载，参与 API 联调。',
 crossFS:'<strong>跨栈排障：</strong>参与 BigBlueButton React 客户端定制，调整会议字幕与侧栏交互，排查 Docker 多阶段构建缓存问题。',
 print:'<strong>打印重构：</strong>将 html2canvas 位图打印改为 vue-print-next + Paged.js DOM 分页，解决长表跨页与续页列宽错位，改善表头及签批排版。',
 knowledge:'<strong>AI 产品交付：</strong>在企业 OLP 项目开发 AI Knowledge 前端，支持生成、知识发布、预览下载等业务步骤，参与接口联调。',
 match:'<strong>人工确认：</strong>实现 AI Match / Re-match → 用户确认 → 业务更新，将 AI 建议与最终业务写入分离。',
};
const specs:readonly Spec[]=[
 {
  key:'fullstack',oldId:'ai-fullstack-v4',newId:'ai-fullstack-v4-1',
  role:'全栈开发工程师',short:'全栈',presentation:'one-page-v4-1-fs',
  techSummary:'Vue 3 / React、TypeScript、Go / Python、PostgreSQL、Mastra，具备 API 契约、MCP 网关与可恢复业务工作流经验。',
  skills:{
   'fullstack-frontend-v2':'<strong>前端与语言：</strong>熟悉 JavaScript（ES6+）、TypeScript、HTML5/CSS3，使用 Vue 3 / Pinia、React Hooks 开发组件。',
   'fullstack-backend-v2':'<strong>后端与数据：</strong>使用 Node.js / Express、Go / Gin、Python / FastAPI，实践 PostgreSQL、Prisma 与 REST API 设计。',
   'fullstack-foundations-v2':'<strong>AI 与服务：</strong>基于 Mastra 实现可恢复工作流与幂等写入，实践 MCP 权限网关、OpenAPI 契约及事务边界。',
   'fullstack-engineering-v2':'<strong>工程交付：</strong>使用 Nx / pnpm、Docker、Vitest、Playwright、GitHub Actions，实践多端构建与自动化回归。',
  },
  workIds:['biz-dev-fs','collab-fs','tech-debt'],
  work:{'biz-dev-fs':facts.bizFS,'collab-fs':facts.crossFS,'tech-debt':facts.print},
  projects:[
   {id:'dailyuse',highlights:['v4-memoflow-durable-write','v4-memoflow-mcp-gateway']},
   {id:'body-sense',highlights:['v4-bodysense-durable-runtime','v4-bodysense-contract-first']},
  ],
  highlights:{
   'dailyuse/v4-memoflow-durable-write':'Mastra 持久化工作流串联目标审核与业务写入，通过确定性实体 ID 保证重试幂等，部分失败后只补做缺失操作。',
   'dailyuse/v4-memoflow-mcp-gateway':'基于 MCP 向外部 Agent 开放 6 个只读业务工具，以 PAT / OAuth scope 控制访问，包含调用审计与请求预算限制。',
   'body-sense/v4-bodysense-durable-runtime':'Agent 运行事件按序号事务落库并支持断点重放；采用租约心跳与 CAS 回收失联任务，避免重复执行。',
   'body-sense/v4-bodysense-contract-first':'以 OpenAPI / Protobuf 维护 Go、Python、Web 多端契约，通过兼容性与变异检查减少跨服务接口漂移。',
  },
 },
 {
  key:'agent',oldId:'ai-agent-app-v4',newId:'ai-agent-app-v4-1',
  role:'AI Agent 应用开发工程师',short:'Agent',presentation:'one-page-v4-1-agent',
  techSummary:'LangGraph / Mastra、Python / FastAPI、TypeScript、PostgreSQL，实践人工确认、Agent 配置评测门禁、工具治理与失败恢复。',
  skills:{
   'agent-runtime-v2':'<strong>Agent 编排：</strong>使用 LangGraph、Mastra 实现工具调用、Postgres 检查点、interrupt / resume 与人工确认。',
   'agent-rag-eval-v2':'<strong>检索评测：</strong>使用 Embedding / pgvector、Pydantic Evals 与离线回放，实践 Prompt / 工具 / Schema 版本化。',
   'agent-fullstack-v2':'<strong>应用工程：</strong>使用 Python / FastAPI、TypeScript / React、Go / Gin、PostgreSQL，实践结构化输出与前后端联调。',
   'agent-foundations-v2':'<strong>工具治理：</strong>熟悉 MCP、LiteLLM、权限分级与默认拒绝，使用 Docker、自动化测试验证工具边界。',
  },
  workIds:['ai-knowledge-agent','ai-hitl-agent'],
  work:{'ai-knowledge-agent':facts.knowledge,'ai-hitl-agent':facts.match},
  projects:[
   {id:'body-sense',highlights:['v4-bodysense-agent-config-release','v4-bodysense-hitl-graph']},
   {id:'dailyuse',highlights:['v4-memoflow-durable-workflow','v4-memoflow-tool-governance']},
  ],
  highlights:{
   'body-sense/v4-bodysense-agent-config-release':'将 Prompt、工具与 Schema 绑定不可变 Agent 配置，以离线评测门禁、影子/金丝雀灰度及回滚演练降低变更风险。',
   'body-sense/v4-bodysense-hitl-graph':'以 LangGraph + Postgres 检查点组织澄清、风险检查和工具执行，借助 interrupt / resume 保留人工确认与续跑能力。',
   'dailyuse/v4-memoflow-durable-workflow':'基于 Mastra suspend / resume 串联澄清、人工审核与业务写入，利用确定性 ID 保障重试幂等、部分失败按需补做。',
   'dailyuse/v4-memoflow-tool-governance':'工具按只读/修改/执行分级审批，未知工具默认拒绝，并接入原生 ask_user 人工确认与 MCP 限权网关。',
  },
 },
 {
  key:'ai-fullstack',oldId:'ai-fullstack-agent-v4',newId:'ai-fullstack-agent-v4-1',
  role:'AI 全栈开发工程师',short:'AI全栈',presentation:'one-page-v4-1-ai-fs',
  techSummary:'Vue 3 / React、TypeScript、Express / Go / Python、PostgreSQL 与 Mastra / LangGraph，覆盖 AI UI、业务数据和 Agent 工程。',
  skills:{
   'fullstack-frontend-v2':'<strong>前端交互：</strong>熟悉 JavaScript（ES6+）、TypeScript，使用 Vue 3、React、Electron、Three.js 实现复杂工作台与 SSE 流式 UI。',
   'fullstack-backend-v2':'<strong>后端与数据：</strong>使用 Node.js / Express、Go / Gin、Python / FastAPI、PostgreSQL、Prisma，实践 REST API 与领域模型设计。',
   'fullstack-foundations-v2':'<strong>Agent 应用：</strong>基于 Mastra / LangGraph 构建可恢复工作流、工具调用和人工确认，实践 MCP 接入与配置评测门禁。',
   'fullstack-engineering-v2':'<strong>工程交付：</strong>使用 Nx、Docker、OpenAPI、Vitest、Playwright、GitHub Actions，实践多端契约、跨服务联调与质量门禁。',
  },
  workIds:['biz-dev-fs','ai-hitl-agent'],
  work:{'biz-dev-fs':facts.bizFS,'ai-hitl-agent':facts.match},
  projects:[
   {id:'dailyuse',highlights:['v4-memoflow-durable-write','v4-memoflow-hitl-form']},
   {id:'body-sense',highlights:['v4-bodysense-gpu-picking','v4-bodysense-agent-config-release']},
  ],
  highlights:{
   'dailyuse/v4-memoflow-durable-write':'以 Mastra 可恢复工作流衔接目标审核和数据提交，使用确定性实体 ID 避免失败重试造成重复写入。',
   'dailyuse/v4-memoflow-hitl-form':'AI 通过类型化语义动作增量填写 Vue 原生目标表单，配合用户接管与 fencing 租约避免覆盖人工编辑。',
   'body-sense/v4-bodysense-gpu-picking':'基于 React Three Fiber 与 GPU 颜色 ID 拾取人体可见区域，联动 3D 点选、框选、身体记录及 Agent 会话上下文。',
   'body-sense/v4-bodysense-agent-config-release':'将 Prompt / 工具 / Schema 版本化为不可变配置，结合离线评测与影子/金丝雀灰度、回滚演练管理 Agent 变更。',
  },
 },
];

const db = new SqliteResumeStore(process.env.JOB_HARNESS_DB||'/data/job-harness.db');
try {
 const canonical=await db.getLibrary('primary');
 const front=await db.getProfile('ai-frontend-v4-1');
 if(!canonical||canonical.version!==BASE_LIBRARY_VERSION||!front||front.version!==3)
   throw Error('Baseline moved: expected primary v11 / frontend v4.1 v3');
 if(front.templateId!=='compact-project-links-v2')
   throw Error('Canonical frontend template mismatch');
 const sources=new Map<string,Awaited<ReturnType<typeof db.getProfile>>>();
 for(const spec of specs) {
   const old=await db.getProfile(spec.oldId);
   if(!old||old.version!==1||old.archivedAt) throw Error('Missing/changed V4 source: '+spec.oldId);
   if(await db.getProfile(spec.newId)) throw Error('Target already exists: '+spec.newId);
   sources.set(spec.oldId,old);
 }
 const allBefore=await db.listProfiles({includeArchived:true});
 const names:Record<ProjectId,string>={'dailyuse':'知行 MemoFlow','body-sense':'体悟 BodySense'};
 const libraryDraft=structuredClone(canonical);
 for(const spec of specs) {
  for(const proj of spec.projects) {
   const item=libraryDraft.projects.find(p=>p.id===proj.id);
   const legacy=(item?.presentations||[]).find(p=>p.id==='one-page-v4-'+(spec.key==='fullstack'?'fs':spec.key==='agent'?'agent':'fsa'));
   const stable=(item?.presentations||[]).find(p=>p.id==='one-page-v2-3');
   if(!item||!legacy||!stable||item.presentations.some(p=>p.id===spec.presentation))
    throw Error('Project presentation conflict '+spec.newId+'/'+proj.id);
   // Keep V4-specific actual tech stacks but the owner-approved product intro
   // from frontend v4.1. The role and brand adhere to V2.x conventions.
   item.presentations.push({
     ...structuredClone(legacy),
     id:spec.presentation,
     name:zh(names[proj.id]),
     description:structuredClone(stable.description),
     role:zh('独立开发（个人项目）'),
   });
  }
 }
 libraryDraft.version=NEXT_LIBRARY_VERSION;
 libraryDraft.updatedAt=now;
 const library=ResumeLibrarySchema.parse(libraryDraft);
 const profiles=[] as ReturnType<typeof ResumeProfileSchema.parse>[];
 for(const spec of specs) {
  const source=sources.get(spec.oldId)!;
  if(!source) throw Error('Missing source: '+spec.oldId);
  const p=structuredClone(source);
  p.id=spec.newId;
  p.version=1;
  p.name=zh(spec.role+' v4.1');
  p.templateId='compact-project-links-v2';
  p.positioning=zh(spec.role+'｜2026届本科毕业生');
  p.output={
   documentTitle:zh('卢楼豪 - '+spec.role+' v4.1'),
   description:zh('2026届本科毕业生，'+spec.role+'方向。'+spec.techSummary),
   onlineUrl:null,
   pdfName:zh('卢楼豪-'+spec.role.replace(/\s/g,'')+'-v4.1'),
  };
  p.layout=structuredClone(front.layout);
  p.sectionOrder=structuredClone(front.sectionOrder);
  p.workSelections=[{experienceId:'krjx',bulletIds:[...spec.workIds]}];
  p.projectSelections=spec.projects.map(pr=>({
    projectId:pr.id,presentationId:spec.presentation,highlightIds:[...pr.highlights],
  }));
  const skills=Object.entries(spec.skills).map(([skillId,text])=>({
    kind:'skill' as const,skillId,value:zh(text),
  }));
  assert.deepStrictEqual(p.skillIds,[...Object.keys(spec.skills)]);
  const work=Object.entries(spec.work).map(([bulletId,text])=>({
    kind:'work-bullet' as const,experienceId:'krjx',bulletId,value:zh(text),
  }));
  assert.deepStrictEqual(spec.workIds,[...Object.keys(spec.work)]);
  const highlights=Object.entries(spec.highlights).map(([key,text])=>{
    const [projectId,highlightId]=key.split('/');
    assert.ok(projectId&&highlightId);
    return {kind:'project-highlight' as const,projectId,highlightId,value:zh(text)};
  });
  p.overrides=[...skills,...work,...highlights];
  p.createdAt=now;
  p.updatedAt=now;
  p.archivedAt=null;
  const profile=ResumeProfileSchema.parse(p);
  const errors=validateResumeProfileReferences(library,profile);
  if(errors.length) throw Error('Bad profile refs for '+profile.id+': '+JSON.stringify(errors));
  profiles.push(profile);
 }

 // Independently audit current shared facts and all prior published profiles
 // for unchanged user-facing content after only six new presentation records.
 const priorFront=resolveResume(canonical,front);
 const newFront=resolveResume(library,front);
 const oldFrontMetadata={...priorFront,libraryVersion:library.version};
 assert.deepStrictEqual(newFront,oldFrontMetadata);
 let checkedPrior=0;
 for(const oldProfile of allBefore) {
   try{
     const before=resolveResume(canonical,oldProfile);
     const after=resolveResume(library,oldProfile);
     assert.deepStrictEqual(after,{...before,libraryVersion:library.version});
     checkedPrior++;
   }catch(e) {
     // Historical archived invalid profiles can exist independently of this
     // change, but a previously resolvable profile must NOT change.
     let valid=false;
     try{resolveResume(canonical,oldProfile);valid=true;}catch{}
     if(valid) throw e;
   }
 }

 for(let index=0;index<profiles.length;index++) {
  const profile=profiles[index]!;
  const spec=specs[index]!;
  const resolved=resolveResume(library,profile);
  const report=auditV2xFoundation(profile,resolved);
  assert.deepStrictEqual(report.errors,[],spec.newId+': '+JSON.stringify(report.errors));
  assert.deepStrictEqual(report.warnings,[],spec.newId+': '+JSON.stringify(report.warnings));
  assert.deepStrictEqual(resolved.projects.map(p=>p.name),spec.projects.map(p=>names[p.id]));
  assert.equal(resolved.workExperiences.length,1);
  assert.equal(resolved.workExperiences[0]!.bullets.length,spec.workIds.length);
  assert.equal(resolved.skills.length,4);
  const html=renderResumeHtml(resolved);
  assert.ok(!html.includes('求职意向：')&&!html.includes('项目亮点：'));
  for(const project of resolved.projects) for(const link of project.links)
    assert.ok(html.includes('href="'+link.url+'"'),'Invalid project HTML link '+link.url);
  assert.deepStrictEqual(resolved.education,priorFront.education);
  assert.deepStrictEqual(resolved.certificates,priorFront.certificates);
  // All three versions reuse the personally confirmed project introductions.
  const frontIntros=new Map(priorFront.projects.map(p=>[p.id,p.description]));
  for(const project of resolved.projects)
    assert.equal(project.description,frontIntros.get(project.id));
 }

 if(mode==='preview') {
  mkdirSync(STAGING,{recursive:true});
  for(const profile of profiles){
   const r=await fetch(PREVIEW_API,{
    method:'POST',
    headers:{
     authorization:'Bearer '+process.env.JOB_HARNESS_AUTH_TOKEN,
     'content-type':'application/json',
    },
    body:JSON.stringify({library,profile}),
   });
   if(!r.ok) throw Error('Failed official PDF preview '+profile.id+' HTTP '+r.status+' '+(await r.text()).slice(0,350));
   const pdf=Buffer.from(await r.arrayBuffer());
   writeFileSync(join(STAGING,profile.id+'.pdf'),pdf);
   console.log('PREVIEW_OK',JSON.stringify({
     profileId:profile.id,pdfBytes:pdf.length,projects:resolveResume(library,profile).projects.map(z=>z.name),
     skills:profile.skillIds.length,workBullets:profile.workSelections[0]!.bulletIds.length,
   }));
  }
 } else if(mode==='commit') {
  await db.transaction(async tx=>{
   const lib=await tx.getLibrary('primary');
   if(!lib||JSON.stringify(lib)!==JSON.stringify(canonical))
     throw Error('Concurrent Library modification: no writes');
   const latestFront=await tx.getProfile('ai-frontend-v4-1');
   if(!latestFront||JSON.stringify(latestFront)!==JSON.stringify(front))
     throw Error('Concurrent frontend baseline modification: no writes');
   for(const spec of specs) {
     const current=await tx.getProfile(spec.oldId);
     if(!current||JSON.stringify(current)!==JSON.stringify(sources.get(spec.oldId)))
      throw Error('Concurrent source V4 modification: '+spec.oldId);
     if(await tx.getProfile(spec.newId)) throw Error('Target already exists: '+spec.newId);
   }
   await tx.upsertLibrary(library);
   for(const profile of profiles) await tx.upsertProfile(profile);
  });
  console.log('COMMITTED',JSON.stringify({
   libraryVersion:library.version,createdProfiles:profiles.map(p=>p.id),
   preservedOldProfiles:allBefore.length,
  }));
 } else {
  console.log('CHECK_OK',JSON.stringify({
    libraryVersion:[canonical.version,library.version],
    sources:specs.map(s=>s.oldId),newProfiles:profiles.map(p=>p.id),
    preservedProfiles:checkedPrior,
    workCounts:profiles.map(p=>p.workSelections[0]!.bulletIds.length),
    roleSkills:profiles.map(p=>p.skillIds.length),
    candidateNames:profiles.map(p=>resolveResume(library,p).projects.map(pr=>pr.name)),
  }));
 }
}finally{db.close();}
