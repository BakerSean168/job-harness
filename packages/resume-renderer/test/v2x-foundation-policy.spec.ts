import { describe, expect, it } from 'vitest';
import type { ResolvedResume, ResumeProfile } from '@job-harness/resume-contracts';
import { auditV2xFoundation } from '../../../scripts/resume-v2x-foundation-policy';

function fixture() {
  const profile = {
    id:'ai-frontend-v2-3',locale:'zh-CN',templateId:'compact-project-links-v2',
    targetRole:{'zh-CN':'前端开发工程师'},
    positioning:{'zh-CN':'前端开发工程师｜2026届本科毕业生'},
    layout:{pageSize:'A4',header:'without-photo'},
    sectionOrder:['education','skills','work','projects','certificates'],
    output:{description:{'zh-CN':'正式前端工程师简历'}},
  } as unknown as ResumeProfile;
  const links = (name: string) => [
    {label:'GitHub',url:'https://github.com/example/'+name},
    {label:'项目展示',url:'https://example.com/'+name},
  ];
  const project = (id:string) => ({
    id, name:id,role:'独立开发（个人项目）',
    description:'用于实际业务的 AI 产品，将对话意图连接到结构化状态和确认操作，解决重复记录问题。',
    stack:'Vue 3、TypeScript、React、Node.js、PostgreSQL',
    links:links(id),
    highlights:[
      {id:'h1',label:'交互：',detail:'通过可复现的状态机将业务操作映射到原生视图。'},
      {id:'h2',label:'服务：',detail:'通过真实测试约束失败恢复与幂等操作。'},
    ],
  });
  const resume = {
    education:[{id:'school'}],
    skills:[
      {id:'basic',content:'JavaScript TypeScript HTML5/CSS3'},
      {id:'framework',content:'Vue 3 React'},
      {id:'async',content:'SSE and state'},
      {id:'quality',content:'Vitest Playwright'},
    ],
    workExperiences:[{id:'work',bullets:[{id:'a'},{id:'b'}]}],
    projects:[project('memoflow'),project('bodysense')],
    certificates:[{id:'cet6',label:'CET-6'}],
  } as unknown as ResolvedResume;
  return {profile,resume};
}

describe('v2.x Resume foundation',()=>{
  it('accepts a small, typed two-project one-page resume',()=>{
    const {profile,resume}=fixture();
    const result=auditV2xFoundation(profile,resume);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.projectNames).toEqual(['memoflow','bodysense']);
  });
  it('rejects old templates, vague skills, missing proof links and excessive highlights',()=>{
    const {profile,resume}=fixture();
    profile.templateId='classic-v1';
    resume.skills[0]!.content='ES6';
    resume.projects[0]!.links=[{label:'GitHub',url:'javascript:alert(1)'}];
    resume.projects[1]!.highlights=[];
    const result=auditV2xFoundation(profile,resume);
    expect(result.errors.map(e=>e.code)).toEqual(expect.arrayContaining(['TEMPLATE','FRONTEND_KEYWORD','PROJECT_LINKS','PROJECT_LINK_SCHEME','HIGHLIGHT_COUNT']));
  });
  it('requires explicit role and keeps duplicate job-intention prefix out',()=>{
    const {profile,resume}=fixture();
    profile.positioning={'zh-CN':'求职意向：前端开发工程师｜2026届本科毕业生'};
    resume.projects[1]!.role='企业技术负责人';
    const result=auditV2xFoundation(profile,resume);
    expect(result.errors.map(e=>e.code)).toEqual(expect.arrayContaining(['POSITIONING','PROJECT_ROLE']));
  });
});
