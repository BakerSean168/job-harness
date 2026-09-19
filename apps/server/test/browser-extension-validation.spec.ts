import { describe, expect, it } from 'vitest';
import { BrowserExtensionBridge } from '../src/browser-extension-bridge';
import { BrowserExtensionValidationRegistry } from '../src/browser-extension-validation';

function register(bridge: BrowserExtensionBridge, version = '0.2.0') {
  bridge.register({
    agentId: 'windows-chrome-primary',
    name: 'Windows Chrome',
    version,
    browserName: 'Chrome',
    platform: 'Win32',
    capabilities: {
      humanControl: true,
      persistentSession: true,
      resumeUpload: true,
      screenshots: true,
      driverCommands: ['session_acquire','current_url','title','body_text','wait','value_matches','fill','select','set_checked','click','upload','screenshot','scan_controls','scan_actions','form_state_hash'],
    },
  });
}

async function answerOne(bridge: BrowserExtensionBridge, result: unknown) {
  const command = await bridge.poll('windows-chrome-primary', 1_000);
  expect(command).not.toBeNull();
  bridge.complete('windows-chrome-primary', { commandId: command!.commandId, ok: true, result });
  return command!;
}

describe('browser-extension validation scope', () => {
  it('binds validation to the synthetic ATS origin, isolated tab and safe command allowlist', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, { allowedOrigin: 'https://job-harness.test:20900' });
    const run = registry.create({ agentId: 'windows-chrome-primary', targetUrl: 'https://job-harness.test:20900/labs/apply-canary?run=test-1' });

    expect(() => registry.create({ agentId: 'windows-chrome-primary', targetUrl: 'https://jobs.example.test/apply?run=test-1' })).toThrow(/synthetic target.*ATS canary/);

    const acquirePromise = registry.invoke(run.id, {
      sessionRef: null,
      command: { type: 'session_acquire', payload: { preferredUrl: run.targetUrl, reuseLiveSession: false } },
      timeoutMs: 5_000,
    });
    const acquire = await answerOne(bridge, { sessionRef: 'chrome-tab:17', currentUrl: run.targetUrl });
    expect(acquire.command).toMatchObject({ type: 'session_acquire', payload: { reuseLiveSession: false } });
    await expect(acquirePromise).resolves.toMatchObject({ run: { sessionRef: 'chrome-tab:17', commandCount: 1, writeCount: 0 } });

    await expect(registry.invoke(run.id, {
      sessionRef: 'chrome-tab:17', command: { type: 'click', payload: { selector: '#submit', expectedText: 'Submit' } }, timeoutMs: 5_000,
    })).rejects.toMatchObject({ code: 'VALIDATION_COMMAND_DENIED' });
    await expect(registry.invoke(run.id, {
      sessionRef: 'chrome-tab:17', command: { type: 'screenshot', payload: {} }, timeoutMs: 5_000,
    })).rejects.toMatchObject({ code: 'VALIDATION_COMMAND_DENIED' });
    await expect(registry.invoke(run.id, {
      sessionRef: 'chrome-tab:17', command: { type: 'upload', payload: { selector: '#other', file: { name: 'resume.pdf', mimeType: 'application/pdf', bytesBase64: 'AA==' } } }, timeoutMs: 5_000,
    })).rejects.toMatchObject({ code: 'VALIDATION_UPLOAD_DENIED' });
    bridge.close();
  });

  it('allows read-only characterization of configured Zhilian/Liepin job pages while denying every browser write', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900',
      readonlySiteFamilies: ['zhilian', 'liepin'],
    });
    const target = 'https://www.zhaopin.com/jobdetail/CC168270920J40838372514.htm';
    const run = registry.create({ agentId: 'windows-chrome-primary', targetUrl: target, mode: 'site-readonly' });
    expect(run).toMatchObject({ mode: 'site-readonly', targetUrl: target, writeCount: 0 });
    expect(() => registry.create({ agentId: 'windows-chrome-primary', targetUrl: 'https://evil.example/jobdetail/CC1.htm', mode: 'site-readonly' })).toThrow(/outside the configured/);

    const acquirePromise = registry.invoke(run.id, {
      sessionRef: null,
      command: { type: 'session_acquire', payload: { preferredUrl: target, reuseLiveSession: false } },
      timeoutMs: 5_000,
    });
    await answerOne(bridge, { sessionRef: 'chrome-tab:31', currentUrl: target });
    await expect(acquirePromise).resolves.toMatchObject({ run: { sessionRef: 'chrome-tab:31', mode: 'site-readonly', writeCount: 0 } });

    const actionsPromise = registry.invoke(run.id, {
      sessionRef: 'chrome-tab:31', command: { type: 'scan_actions', payload: {} }, timeoutMs: 5_000,
    });
    await answerOne(bridge, target);
    const actionCommand = await answerOne(bridge, [{ actionRef: 'action:1', text: '立即投递', disabled: false, ariaDisabled: false }]);
    expect(actionCommand.command.type).toBe('scan_actions');
    await expect(actionsPromise).resolves.toMatchObject({ run: { commandCount: 2, writeCount: 0 } });

    for (const command of [
      { type: 'fill', payload: { selector: '#name', value: 'x' } },
      { type: 'upload', payload: { selector: '#resume', file: { name: 'resume.pdf', mimeType: 'application/pdf', bytesBase64: 'AA==' } } },
      { type: 'click', payload: { selector: '#submit', expectedText: '立即投递' } },
      { type: 'screenshot', payload: {} },
    ] as const) {
      await expect(registry.invoke(run.id, { sessionRef: 'chrome-tab:31', command, timeoutMs: 5_000 })).rejects.toMatchObject({ code: 'VALIDATION_COMMAND_DENIED' });
    }
    bridge.close();
  });

  it('rejects staged characterization from a pre-0.1.6 Browser Bridge before any command is queued', () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge, '0.1.5');
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900', readonlySiteFamilies: ['zhilian', 'liepin'],
    });
    expect(() => registry.create({
      agentId: 'windows-chrome-primary', targetUrl: 'https://www.zhaopin.com/jobdetail/CC1.htm', mode: 'site-staged-readonly',
    })).toThrow(/Browser Bridge >= 0.1.6/);
    expect(bridge.status('windows-chrome-primary')?.queuedCommands).toBe(0);
    bridge.close();
  });

  it('rejects site-resume sync from a pre-0.2.0 Browser Bridge before any command is queued', () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge, '0.1.9');
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900', readonlySiteFamilies: ['zhilian', 'liepin'],
    });
    expect(() => registry.create({
      agentId: 'windows-chrome-primary', targetUrl: 'https://c.liepin.com/resume/create', mode: 'site-resume-sync',
    })).toThrow(/Browser Bridge >= 0.2.0/);
    expect(bridge.status('windows-chrome-primary')?.queuedCommands).toBe(0);
    bridge.close();
  });

  it('staged read-only characterization requires an existing live tab and still denies every browser write', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900', readonlySiteFamilies: ['zhilian', 'liepin'],
    });
    const target = 'https://www.zhaopin.com/jobdetail/CC168270920J40838372514.htm';
    const run = registry.create({ agentId: 'windows-chrome-primary', targetUrl: target, mode: 'site-staged-readonly' });

    await expect(registry.invoke(run.id, {
      sessionRef: null, command: { type: 'session_acquire', payload: { preferredUrl: target, reuseLiveSession: false, requireLiveSession: false } }, timeoutMs: 5_000,
    })).rejects.toMatchObject({ code: 'VALIDATION_LIVE_SESSION_REQUIRED' });

    const acquirePromise = registry.invoke(run.id, {
      sessionRef: null, command: { type: 'session_acquire', payload: { preferredUrl: target, reuseLiveSession: true, requireLiveSession: true } }, timeoutMs: 5_000,
    });
    const acquire = await answerOne(bridge, { sessionRef: 'chrome-tab:44', currentUrl: target });
    expect(acquire.command).toMatchObject({ type: 'session_acquire', payload: { reuseLiveSession: true, requireLiveSession: true } });
    await expect(acquirePromise).resolves.toMatchObject({ run: { sessionRef: 'chrome-tab:44', mode: 'site-staged-readonly', writeCount: 0 } });

    for (const command of [
      { type: 'fill', payload: { selector: '#name', value: 'x' } },
      { type: 'select', payload: { selector: '#resume', value: 'AI Agent简历' } },
      { type: 'upload', payload: { selector: '#resume-file', file: { name: 'resume.pdf', mimeType: 'application/pdf', bytesBase64: 'AA==' } } },
      { type: 'click', payload: { selector: '#submit', expectedText: '确认投递' } },
      { type: 'screenshot', payload: {} },
    ] as const) {
      await expect(registry.invoke(run.id, { sessionRef: 'chrome-tab:44', command, timeoutMs: 5_000 })).rejects.toMatchObject({ code: 'VALIDATION_COMMAND_DENIED' });
    }
    bridge.close();
  });

  it('allows opening only an allowlisted Liepin resume-management page when no reusable recruiting-site tab exists', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900', readonlySiteFamilies: ['liepin'],
    });

    const resumeRun = registry.create({
      agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create', mode:'site-resume-sync',
    });
    const openPromise = registry.invoke(resumeRun.id, {
      sessionRef:null,
      command:{ type:'session_acquire', payload:{ preferredUrl:resumeRun.targetUrl, reuseLiveSession:false, requireLiveSession:false } },
      timeoutMs:5_000,
    });
    const command = await answerOne(bridge, { sessionRef:'chrome-tab:new-resume', currentUrl:'https://c.liepin.com/resume/create' });
    expect(command.command).toMatchObject({
      type:'session_acquire', payload:{ preferredUrl:'https://c.liepin.com/resume/create', reuseLiveSession:false, requireLiveSession:false },
    });
    await expect(openPromise).resolves.toMatchObject({ run:{ sessionRef:'chrome-tab:new-resume' } });

    const jobRun = registry.create({
      agentId:'windows-chrome-primary', targetUrl:'https://www.liepin.com/job/1985379181.shtml', mode:'site-resume-sync',
    });
    await expect(registry.invoke(jobRun.id, {
      sessionRef:null,
      command:{ type:'session_acquire', payload:{ preferredUrl:jobRun.targetUrl, reuseLiveSession:false, requireLiveSession:false } },
      timeoutMs:5_000,
    })).rejects.toMatchObject({ code:'VALIDATION_LIVE_SESSION_REQUIRED' });
    bridge.close();
  });

  it('syncs an integrity-checked PDF into the active same-site resume input while denying application clicks', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const bytes = new TextEncoder().encode('%PDF-1.7\nsite-resume-sync');
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900',
      readonlySiteFamilies: ['liepin'],
      resumeArtifacts: {
        async getContent(id: string) {
          if (id !== 'artifact-sync') return null;
          return {
            artifact: { id, revisionId:'rev-sync', kind:'pdf', mimeType:'application/pdf', storageUri:'memory://sync.pdf', sha256:'a'.repeat(64), byteSize:bytes.byteLength, rendererId:'fixture', rendererVersion:'1', createdAt:'2026-09-18T00:00:00.000Z' },
            bytes,
          } as any;
        },
      },
    });
    const run = registry.create({ agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create?backUrl=https%3A%2F%2Fwww.liepin.com%2Fjob%2F1985379181.shtml', mode:'site-resume-sync' });
    const pending = registry.syncResume(run.id, { artifactId:'artifact-sync', fileName:'卢楼豪-AI-Agent应用开发工程师.pdf' });
    const pageUrl = 'https://c.liepin.com/resume/create?backUrl=https%3A%2F%2Fwww.liepin.com%2Fjob%2F1985379181.shtml';
    const controls = [{ controlRef:'[data-job-harness-field-id=\"jh-0\"]', kind:'file', label:'上传简历', name:'resumeFile', description:null, required:false, disabled:false, readOnly:false, options:[], semanticHints:['resume-upload'], accept:'.pdf,.doc,.docx', multiple:false, sectionLabel:'已有简历？一键智能导入' }];
    const actions = [{ actionRef:'[data-job-harness-action-id=\"jha-0\"]', tag:'button', text:'保存简历', href:null, type:'button', role:null, disabled:false, ariaDisabled:false }];
    let uploadCommand: any = null;
    let settled = false;
    void pending.finally(() => { settled = true; });
    for (let i=0;i<30 && !settled;i++) {
      const command = await bridge.poll('windows-chrome-primary', 1_000);
      if (!command) continue;
      let result: unknown = null;
      if (command.command.type === 'session_acquire') {
        expect(command.command.payload).toMatchObject({ preferredUrl:'https://c.liepin.com/resume/create', reuseLiveSession:true, requireLiveSession:false });
        result = { sessionRef:'chrome-tab:resume-sync', currentUrl:pageUrl };
      }
      else if (command.command.type === 'current_url') result = pageUrl;
      else if (command.command.type === 'scan_controls') result = controls;
      else if (command.command.type === 'upload') { uploadCommand = command.command; result = null; }
      else if (command.command.type === 'title') result = '欢迎来到猎聘';
      else if (command.command.type === 'body_text') result = '欢迎来到猎聘 已有简历？一键智能导入 选择文件';
      else if (command.command.type === 'scan_actions') result = actions;
      else if (command.command.type === 'form_state_hash') result = 'f'.repeat(64);
      bridge.complete('windows-chrome-primary', { commandId:command.commandId, ok:true, result });
    }
    const completed = await pending;
    expect(completed).toMatchObject({
      run:{ mode:'site-resume-sync', writeCount:1 }, artifactId:'artifact-sync', artifactSha256:'a'.repeat(64),
      uploadedControl:{ label:'上传简历', name:'resumeFile', accept:'.pdf,.doc,.docx' },
      evidence:{ currentUrl:pageUrl, title:'欢迎来到猎聘' },
    });
    expect(uploadCommand).toMatchObject({
      type:'upload', payload:{ selector:'[data-job-harness-field-id=\"jh-0\"]', file:{ name:'卢楼豪-AI-Agent应用开发工程师.pdf', mimeType:'application/pdf' } },
    });
    expect(uploadCommand.payload.file.bytesBase64).toBe(Buffer.from(bytes).toString('base64'));
    const fillPromise = registry.invoke(run.id, {
      sessionRef:'chrome-tab:resume-sync', command:{ type:'fill', payload:{ selector:'[data-job-harness-field-id=\"jh-name\"]', value:'Candidate Name' } }, timeoutMs:5_000,
    });
    await answerOne(bridge, pageUrl);
    const fillCommand = await answerOne(bridge, null);
    expect(fillCommand.command).toMatchObject({ type:'fill', payload:{ value:'Candidate Name' } });
    await expect(fillPromise).resolves.toMatchObject({ run:{ writeCount:2 } });
    const controlClick = registry.invoke(run.id, {
      sessionRef:'chrome-tab:resume-sync', command:{ type:'click', payload:{ selector:'[data-job-harness-field-id=\"jh-city\"]', expectedText:null } }, timeoutMs:5_000,
    });
    await answerOne(bridge, pageUrl);
    const controlClickCommand = await answerOne(bridge, null);
    expect(controlClickCommand.command).toMatchObject({ type:'click', payload:{ selector:'[data-job-harness-field-id=\"jh-city\"]', expectedText:null } });
    await expect(controlClick).resolves.toMatchObject({ run:{ writeCount:3 } });
    await expect(registry.invoke(run.id, {
      sessionRef:'chrome-tab:resume-sync', command:{ type:'click', payload:{ selector:'.arbitrary', expectedText:null } }, timeoutMs:5_000,
    })).rejects.toMatchObject({ code:'VALIDATION_CLICK_DENIED' });
    await expect(registry.invoke(run.id, {
      sessionRef:'chrome-tab:resume-sync', command:{ type:'click', payload:{ selector:'button.apply', expectedText:'投简历' } }, timeoutMs:5_000,
    })).rejects.toMatchObject({ code:'VALIDATION_CLICK_DENIED' });
    bridge.close();
  });

  it('recognizes Liepin online-resume onboarding and fills only deterministic ApplicantProfile facts', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900', readonlySiteFamilies: ['liepin'],
      applicant: {
        async getDefaultProfile() {
          return {
            profile: {
              id:'default-applicant', version:3, displayName:'Candidate Name', phone:null, email:'candidate@example.test', gender:null, birthDate:null,
              location:'浙江金华', jobSearchStatus:'actively_looking', careerIdentity:'new_graduate', website:null, github:null, education:[], targetRoles:[], targetCities:[], availableFrom:null, notes:null,
              createdAt:'2026-09-18T00:00:00.000Z', updatedAt:'2026-09-19T00:00:00.000Z',
            },
            latestRevision: { id:'profile-rev-3', profileId:'default-applicant', revisionNumber:3, profileVersion:3, snapshot:{} as any, contentHash:'a'.repeat(64), createdAt:'2026-09-19T00:00:00.000Z', createdBy:'user' as const },
          } as any;
        },
      },
    });
    const pageUrl = 'https://c.liepin.com/resume/create?backUrl=https%253A%252F%252Fc.liepin.com%252Fresume%252Fedit';
    const run = registry.create({ agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create', mode:'site-resume-sync' });
    const pending = registry.prepareResume(run.id);
    const controls = [
      { controlRef:'[data-job-harness-field-id="jh-0"]', kind:'text', label:'请填写', name:null, description:null, required:false, disabled:false, readOnly:false, options:[], semanticHints:['请填写'], accept:null, multiple:false, sectionLabel:'姓名' },
      { controlRef:'[data-job-harness-field-id="jh-1"]', kind:'text', label:'请选择', name:null, description:null, required:false, disabled:false, readOnly:false, options:[], semanticHints:['请选择'], accept:null, multiple:false, sectionLabel:'出生年月' },
      { controlRef:'[data-job-harness-field-id="jh-2"]', kind:'unknown', label:'rc_select_0', name:null, description:null, required:false, disabled:false, readOnly:true, options:[], semanticHints:['rc_select_0'], accept:null, multiple:false, sectionLabel:'当前城市' },
      { controlRef:'[data-job-harness-field-id="jh-3"]', kind:'unknown', label:'当前求职状态', name:null, description:null, required:false, disabled:false, readOnly:true, options:[], semanticHints:['basic_workStatusCode'], accept:null, multiple:false, sectionLabel:'当前求职状态' },
      { controlRef:'[data-job-harness-field-id="jh-5"]', kind:'text', label:'请填写（选填）', name:null, description:null, required:false, disabled:false, readOnly:false, options:[], semanticHints:['请填写（选填）'], accept:null, multiple:false, sectionLabel:'邮箱' },
    ];
    const actions = [
      { actionRef:'[data-job-harness-action-id="jha-3"]', tag:'button', text:'下一步', href:null, type:'button', role:null, disabled:false, ariaDisabled:false },
      { actionRef:'[data-job-harness-action-id="jha-4"]', tag:'other', text:'男', href:null, type:null, role:null, disabled:false, ariaDisabled:false },
      { actionRef:'[data-job-harness-action-id="jha-5"]', tag:'other', text:'女', href:null, type:null, role:null, disabled:false, ariaDisabled:false },
      { actionRef:'[data-job-harness-action-id="jha-6"]', tag:'other', text:'我是职场人', href:null, type:null, role:null, disabled:false, ariaDisabled:false },
      { actionRef:'[data-job-harness-action-id="jha-7"]', tag:'other', text:'我是学生', href:null, type:null, role:null, disabled:false, ariaDisabled:false },
    ];
    const writes: any[] = [];
    let identitySelected = false;
    let statusOpened = false;
    let settled = false;
    void pending.finally(() => { settled = true; });
    for (let i=0;i<60 && !settled;i++) {
      const command = await bridge.poll('windows-chrome-primary', 1_000);
      if (!command) continue;
      let result: unknown = null;
      if (command.command.type === 'session_acquire') result = { sessionRef:'chrome-tab:onboarding', currentUrl:pageUrl };
      else if (command.command.type === 'current_url') result = pageUrl;
      else if (command.command.type === 'title') result = '完善简历 - 猎聘';
      else if (command.command.type === 'body_text') result = identitySelected
        ? '邀请你完善求职名片 姓名 性别 出生年月 求职身份 当前城市 浙江·金华 当前求职状态 在校，看看机会 邮箱 下一步'
        : '邀请你完善求职名片 姓名 性别 出生年月 求职身份 当前城市 浙江·金华 当前求职状态 在职，看看新机会 邮箱 下一步';
      else if (command.command.type === 'scan_actions') result = statusOpened
        ? [...actions, { actionRef:'[data-job-harness-action-id="jha-8"]', tag:'other', text:'离校，在找工作', href:null, type:null, role:null, disabled:false, ariaDisabled:false }]
        : actions;
      else if (command.command.type === 'scan_controls') result = controls;
      else if (command.command.type === 'form_state_hash') result = 'b'.repeat(64);
      else if (command.command.type === 'fill' || command.command.type === 'click') {
        writes.push(command.command);
        if (command.command.type === 'click' && command.command.payload.expectedText === '我是学生') identitySelected = true;
        if (command.command.type === 'click' && command.command.payload.selector === '[data-job-harness-field-id="jh-3"]') statusOpened = true;
        if (command.command.type === 'click' && command.command.payload.expectedText === '离校，在找工作') statusOpened = false;
        result = null;
      }
      bridge.complete('windows-chrome-primary', { commandId:command.commandId, ok:true, result });
    }
    const completed = await pending;
    expect(completed).toMatchObject({
      state:'profile_onboarding_required',
      missingFacts:['gender','birthDate'],
      manualFacts:[],
      appliedFacts:['displayName','email','careerIdentity','jobSearchStatus'],
      run:{ writeCount:5 },
    });
    expect(writes).toEqual([
      expect.objectContaining({ type:'fill', payload:expect.objectContaining({ value:'Candidate Name' }) }),
      expect.objectContaining({ type:'fill', payload:expect.objectContaining({ value:'candidate@example.test' }) }),
      expect.objectContaining({ type:'click', payload:expect.objectContaining({ expectedText:'我是学生' }) }),
      expect.objectContaining({ type:'click', payload:expect.objectContaining({ selector:'[data-job-harness-field-id="jh-3"]' }) }),
      expect.objectContaining({ type:'click', payload:expect.objectContaining({ expectedText:'离校，在找工作' }) }),
    ]);
    expect(JSON.stringify(writes)).not.toContain('下一步');
    bridge.close();
  });

  it('recognizes Liepin education onboarding and maps deterministic ApplicantProfile education facts without clicking next', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900', readonlySiteFamilies: ['liepin'],
      applicant: {
        async getDefaultProfile() {
          return {
            profile: {
              id:'default-applicant', version:4, displayName:'Candidate Name', phone:null, email:'candidate@example.test', gender:'male', birthDate:'2004-08-17',
              location:'浙江金华', jobSearchStatus:'actively_looking', careerIdentity:'new_graduate', website:null, github:null,
              education:[{ id:'sicau', school:'四川农业大学', institutionTag:'（211）', major:'物联网工程', degree:'本科', admissionType:'unified', department:'信息工程学院', location:'雅安', startMonth:'2022-09', endMonth:'2026-06' }],
              targetRoles:[], targetCities:[], availableFrom:null, notes:null, createdAt:'2026-09-18T00:00:00.000Z', updatedAt:'2026-09-19T00:00:00.000Z',
            },
            latestRevision: { id:'profile-rev-4', profileId:'default-applicant', revisionNumber:4, profileVersion:4, snapshot:{} as any, contentHash:'a'.repeat(64), createdAt:'2026-09-19T00:00:00.000Z', createdBy:'user' as const },
          } as any;
        },
      },
    });
    const pageUrl = 'https://c.liepin.com/resume/create?backUrl=https%253A%252F%252Fc.liepin.com%252Fresume%252Fedit';
    const run = registry.create({ agentId:'windows-chrome-primary', targetUrl:'https://c.liepin.com/resume/create', mode:'site-resume-sync' });
    const pending = registry.prepareResume(run.id);
    const controls = [
      { controlRef:'[data-job-harness-field-id="jh-0"]', kind:'select', label:'学校名称', name:null, description:null, required:false, disabled:false, readOnly:false, options:[], semanticHints:['off','school','学校名称 | school','site-adapter:liepin'], accept:null, multiple:false, sectionLabel:null },
      { controlRef:'[data-job-harness-field-id="jh-2"]', kind:'select', label:'rc_select_2', name:null, description:null, required:false, disabled:false, readOnly:false, options:[], semanticHints:['off','rc_select_2','site-adapter:liepin'], accept:null, multiple:false, sectionLabel:null },
      { controlRef:'[data-job-harness-field-id="jh-3"]', kind:'text', label:'入学时间', name:null, description:null, required:false, disabled:false, readOnly:true, options:[], semanticHints:['入学时间'], accept:null, multiple:false, sectionLabel:null },
      { controlRef:'[data-job-harness-field-id="jh-4"]', kind:'text', label:'毕业时间', name:null, description:null, required:false, disabled:false, readOnly:true, options:[], semanticHints:['毕业时间'], accept:null, multiple:false, sectionLabel:null },
      { controlRef:'[data-job-harness-field-id="jh-5"]', kind:'textarea', label:'在校经历', name:null, description:null, required:false, disabled:false, readOnly:false, options:[], semanticHints:['experience'], accept:null, multiple:false, sectionLabel:'在校经历' },
    ];
    const baseActions = [
      { actionRef:'[data-job-harness-action-id="jha-next"]', tag:'button', text:'下一步', href:null, type:'button', role:null, disabled:false, ariaDisabled:false },
      { actionRef:'[data-job-harness-action-id="jha-unified"]', tag:'other', text:'统招', href:null, type:null, role:null, disabled:false, ariaDisabled:false },
      { actionRef:'[data-job-harness-action-id="jha-non-unified"]', tag:'other', text:'非统招', href:null, type:null, role:null, disabled:false, ariaDisabled:false },
    ];
    const writes: any[] = [];
    const acquisitions: any[] = [];
    let settled = false;
    void pending.finally(() => { settled = true; });
    for (let i=0;i<120 && !settled;i++) {
      const command = await bridge.poll('windows-chrome-primary', 1_000);
      if (!command) continue;
      let result: unknown = null;
      if (command.command.type === 'session_acquire') {
        acquisitions.push(command.command);
        result = acquisitions.length === 1
          ? { sessionRef:'chrome-tab:unrelated', currentUrl:'https://chatgpt.com/' }
          : { sessionRef:'chrome-tab:education', currentUrl:pageUrl };
      }
      else if (command.command.type === 'current_url') result = pageUrl;
      else if (command.command.type === 'title') result = '完善教育经历 - 猎聘';
      else if (command.command.type === 'body_text') result = '你就读的学校 填写教育经历，让简历更加完整 学校名称 统招 非统招 学历 本科 专业 就读时间 — 在校经历 下一步';
      else if (command.command.type === 'scan_controls') result = controls;
      else if (command.command.type === 'form_state_hash') result = 'c'.repeat(64);
      else if (command.command.type === 'scan_actions') result = baseActions;
      else if (command.command.type === 'wait') result = null;
      else if (command.command.type === 'value_matches') {
        const key = `${command.command.payload.selector}::${command.command.payload.expected}`;
        result = new Set([
          '[data-job-harness-field-id="jh-0"]::四川农业大学',
          '[data-job-harness-field-id="jh-2"]::物联网工程',
          '[data-job-harness-field-id="jh-3"]::2022-09',
          '[data-job-harness-field-id="jh-4"]::2026-06',
        ]).has(key);
      } else if (command.command.type === 'fill') {
        writes.push(command.command);
        result = null;
      } else if (command.command.type === 'click') {
        writes.push(command.command);
        result = null;
      }
      bridge.complete('windows-chrome-primary', { commandId:command.commandId, ok:true, result });
    }
    const completed = await pending;
    expect(completed).toMatchObject({
      state:'education_onboarding_required', missingFacts:[], manualFacts:[],
      appliedFacts:['education[0].admissionType','education[0].school','education[0].degree','education[0].major','education[0].startMonth','education[0].endMonth'],
      run:{ writeCount:5 },
    });
    expect(writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type:'fill', payload:expect.objectContaining({ value:'四川农业大学', blur:true }) }),
      expect.objectContaining({ type:'fill', payload:expect.objectContaining({ value:'物联网工程', blur:true }) }),
      expect.objectContaining({ type:'fill', payload:expect.objectContaining({ value:'2022-09', blur:true }) }),
      expect.objectContaining({ type:'fill', payload:expect.objectContaining({ value:'2026-06', blur:true }) }),
      expect.objectContaining({ type:'click', payload:expect.objectContaining({ expectedText:'统招' }) }),
    ]));
    expect(acquisitions).toEqual([
      expect.objectContaining({ type:'session_acquire', payload:expect.objectContaining({ reuseLiveSession:true, requireLiveSession:false }) }),
      expect.objectContaining({ type:'session_acquire', payload:expect.objectContaining({ reuseLiveSession:false, requireLiveSession:false }) }),
    ]);
    expect(JSON.stringify(writes)).not.toContain('下一步');
    bridge.close();
  });

  it('treats recruiting-site tracking query parameters as the same job during staged read-only reuse', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900', readonlySiteFamilies: ['liepin'],
    });
    const target = 'https://www.liepin.com/job/1985379181.shtml';
    const run = registry.create({ agentId: 'windows-chrome-primary', targetUrl: `${target}?source=canonical`, mode: 'site-staged-readonly' });
    expect(run.targetUrl).toBe(target);
    const acquirePromise = registry.invoke(run.id, {
      sessionRef: null, command: { type: 'session_acquire', payload: { preferredUrl: run.targetUrl, reuseLiveSession: true, requireLiveSession: true } }, timeoutMs: 5_000,
    });
    await answerOne(bridge, { sessionRef: 'chrome-tab:query', currentUrl: `${target}?from=search&track=abc` });
    await expect(acquirePromise).resolves.toMatchObject({ run: { sessionRef: 'chrome-tab:query', mode: 'site-staged-readonly', writeCount: 0 } });
    bridge.close();
  });

  it('surfaces login-required state from redacted page structure without persisting credentials', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, { allowedOrigin: 'https://job-harness.test:20900', readonlySiteFamilies: ['liepin'] });
    const target = 'https://www.liepin.com/job/1985379181.shtml';
    const run = registry.create({ agentId:'windows-chrome-primary', targetUrl:target, mode:'site-readonly' });
    const pending = registry.characterize(run.id);
    const results: Record<string, unknown> = {
      session_acquire:{sessionRef:'chrome-tab:login',currentUrl:target}, wait:null, current_url:target, title:'AI Agent - 猎聘',
      body_text:'投简历', scan_actions:[], scan_controls:[{ controlRef:'private-phone', kind:'text', label:'手机号', name:null, description:null, required:false, disabled:false, readOnly:false, options:[], semanticHints:[] , accept:null, multiple:false, sectionLabel:null },{ controlRef:'private-code', kind:'text', label:'短信验证码', name:null, description:null, required:true, disabled:false, readOnly:false, options:[], semanticHints:[] , accept:null, multiple:false, sectionLabel:null }], form_state_hash:'f'.repeat(64),
    };
    for (let i=0;i<15;i++) { const cmd=await bridge.poll('windows-chrome-primary',1_000); expect(cmd).not.toBeNull(); bridge.complete('windows-chrome-primary',{commandId:cmd!.commandId,ok:true,result:results[cmd!.command.type] ?? null}); }
    await expect(pending).resolves.toMatchObject({ evidence:{ stateSignals:['需要登录','投简历'] } });
    bridge.close();
  });

  it('orchestrates a complete read-only characterization and persists only redacted structure evidence', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, {
      allowedOrigin: 'https://job-harness.test:20900', readonlySiteFamilies: ['zhilian', 'liepin'],
    });
    const target = 'https://www.liepin.com/job/123456789.shtml';
    const run = registry.create({ agentId: 'windows-chrome-primary', targetUrl: target, mode: 'site-readonly' });
    const pending = registry.characterize(run.id);
    const results: Record<string, unknown> = {
      session_acquire: { sessionRef: 'chrome-tab:88', currentUrl: target },
      current_url: target, wait: null, title: 'AI Agent 工程师 - 猎聘',
      body_text: '职位详情 投简历 聊一聊 我的简历 默认简历 some-private-page-copy',
      scan_actions: [
        { actionRef: 'private-action-ref', tag: 'button', text: '投简历', href: 'https://www.liepin.com/job/123456789.shtml?tracking=secret#x', type: 'button', role: null, disabled: false, ariaDisabled: false },
      ],
      scan_controls: [
        { controlRef: 'private-control-ref', kind: 'select', label: '选择简历', name: 'resume', description: '选择一份简历', required: true, disabled: false, readOnly: false, options: [{ value: 'private-resume-id', label: 'AI Agent 简历', disabled: false }], semanticHints: ['resume-select'], accept: null, multiple: false, sectionLabel: '我的简历' },
      ],
      form_state_hash: 'f'.repeat(64),
    };
    for (let index = 0; index < 15; index += 1) {
      const command = await bridge.poll('windows-chrome-primary', 1_000);
      expect(command).not.toBeNull();
      bridge.complete('windows-chrome-primary', { commandId: command!.commandId, ok: true, result: results[command!.command.type] ?? null });
    }
    const completed = await pending;
    expect(completed.run.characterization).toEqual(completed.evidence);
    expect(completed.evidence).toMatchObject({
      currentUrl: target, title: 'AI Agent 工程师 - 猎聘', formStateHash: 'f'.repeat(64),
      stateSignals: ['投简历','我的简历','默认简历','聊一聊'],
      actions: [{ tag: 'button', text: '投简历', href: 'https://www.liepin.com/job/123456789.shtml', disabled: false }],
      controls: [{ kind: 'select', label: '选择简历', name: 'resume', optionLabels: ['AI Agent 简历'], semanticHints: ['resume-select'] }],
    });
    expect(JSON.stringify(completed.evidence)).not.toContain('private-action-ref');
    expect(JSON.stringify(completed.evidence)).not.toContain('private-control-ref');
    expect(JSON.stringify(completed.evidence)).not.toContain('private-resume-id');
    expect(JSON.stringify(completed.evidence)).not.toContain('some-private-page-copy');
    expect(JSON.stringify(completed.evidence)).not.toContain('tracking=secret');
    bridge.close();
  });

  it('re-checks the actual tab URL before every read/write and counts only explicit validation commands', async () => {
    const bridge = new BrowserExtensionBridge();
    register(bridge);
    const registry = new BrowserExtensionValidationRegistry(bridge, { allowedOrigin: 'https://job-harness.test:20900' });
    const run = registry.create({ agentId: 'windows-chrome-primary', targetUrl: 'https://job-harness.test:20900/labs/apply-canary?run=test-2' });

    const acquirePromise = registry.invoke(run.id, {
      sessionRef: null, command: { type: 'session_acquire', payload: { preferredUrl: run.targetUrl, reuseLiveSession: false } }, timeoutMs: 5_000,
    });
    await answerOne(bridge, { sessionRef: 'chrome-tab:22', currentUrl: run.targetUrl });
    await acquirePromise;

    const fillPromise = registry.invoke(run.id, {
      sessionRef: 'chrome-tab:22', command: { type: 'fill', payload: { selector: '#full-name', value: 'Synthetic Candidate' } }, timeoutMs: 5_000,
    });
    const urlCheck = await answerOne(bridge, run.targetUrl);
    expect(urlCheck.command.type).toBe('current_url');
    const fill = await answerOne(bridge, null);
    expect(fill.command.type).toBe('fill');
    await expect(fillPromise).resolves.toMatchObject({ run: { commandCount: 2, writeCount: 1 } });

    const driftPromise = registry.invoke(run.id, {
      sessionRef: 'chrome-tab:22', command: { type: 'form_state_hash', payload: {} }, timeoutMs: 5_000,
    });
    await answerOne(bridge, 'https://example.test/elsewhere');
    await expect(driftPromise).rejects.toMatchObject({ code: 'VALIDATION_TARGET_DRIFT' });
    bridge.close();
  });
});
