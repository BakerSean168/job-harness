import { describe, expect, it } from 'vitest';
import { BrowserExtensionBridge } from '../src/browser-extension-bridge';
import { BrowserExtensionValidationRegistry } from '../src/browser-extension-validation';

function register(bridge: BrowserExtensionBridge) {
  bridge.register({
    agentId: 'windows-chrome-primary',
    name: 'Windows Chrome',
    version: '0.1.0',
    browserName: 'Chrome',
    platform: 'Win32',
    capabilities: {
      humanControl: true,
      persistentSession: true,
      resumeUpload: true,
      screenshots: true,
      driverCommands: ['session_acquire','current_url','title','body_text','wait','fill','select','set_checked','click','upload','screenshot','scan_controls','scan_actions','form_state_hash'],
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
