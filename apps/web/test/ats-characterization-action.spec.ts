import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../../server/src';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
const originalApiUrl = process.env.JOB_HARNESS_API_URL;
const originalToken = process.env.JOB_HARNESS_AUTH_TOKEN;

afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
  if (originalApiUrl === undefined) delete process.env.JOB_HARNESS_API_URL; else process.env.JOB_HARNESS_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.JOB_HARNESS_AUTH_TOKEN; else process.env.JOB_HARNESS_AUTH_TOKEN = originalToken;
  vi.resetModules();
});

describe('Web ATS read-only characterization action', () => {
  it('runs through the paired browser bridge and returns only redacted structural evidence', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-web-ats-characterization-'));
    running = await startJobHarnessServer({
      databasePath: join(dir, 'career.db'),
      host: '127.0.0.1',
      port: 0,
      authToken: 'characterization-secret',
      browserExtensionValidationAllowedOrigin: 'https://job-harness.test:20900',
      submissionReconcileIntervalMs: null,
    });
    process.env.JOB_HARNESS_API_URL = running.apiUrl;
    process.env.JOB_HARNESS_AUTH_TOKEN = 'characterization-secret';

    const bridgeUrl = `${running.url}/internal/browser-bridge/v1`;
    const headers = { authorization: 'Bearer characterization-secret', 'content-type': 'application/json' };
    const registered = await fetch(`${bridgeUrl}/agents/register`, {
      method: 'POST', headers,
      body: JSON.stringify({
        agentId: 'windows-chrome-characterization-test',
        name: 'Windows Chrome', version: '0.1.4', browserName: 'Chrome', platform: 'Win32',
        capabilities: {
          humanControl: true, persistentSession: true, resumeUpload: true, screenshots: true,
          driverCommands: ['session_acquire','current_url','title','body_text','wait','scan_actions','scan_controls','form_state_hash'],
        },
      }),
    });
    expect(registered.status).toBe(200);

    const target = 'https://www.zhaopin.com/jobdetail/CC168270920J40838372514.htm';
    const form = new FormData();
    form.set('agentId', 'windows-chrome-characterization-test');
    form.set('targetUrl', target);
    const { characterizeAtsSiteAction } = await import('../src/app/settings/actions');
    const actionPromise = characterizeAtsSiteAction({ ok: false, runId: null, error: null, evidence: null }, form);

    const seen: string[] = [];
    const resultFor = (type: string): unknown => {
      switch (type) {
        case 'session_acquire': return { sessionRef: 'chrome-tab:999', currentUrl: target };
        case 'current_url': return target;
        case 'title': return 'AI应用开发工程师 - 智联招聘';
        case 'body_text': return '职位详情 立即投递 选择简历 在线简历 private-job-description';
        case 'scan_actions': return [{ actionRef: 'private-action-ref', tag: 'button', text: '立即投递', href: null, type: 'button', role: null, disabled: false, ariaDisabled: false }];
        case 'scan_controls': return [{ controlRef: 'private-control-ref', kind: 'select', label: '选择简历', name: 'resumeId', description: '在线简历', required: true, disabled: false, readOnly: false, options: [{ value: 'private-resume-id', label: 'AI Agent简历', disabled: false }], semanticHints: ['resume-selector'], accept: null, multiple: false, sectionLabel: '在线简历' }];
        case 'form_state_hash': return 'a'.repeat(64);
        case 'wait': return null;
        default: throw new Error(`unexpected command: ${type}`);
      }
    };

    for (let index = 0; index < 15; index += 1) {
      const poll = await fetch(`${bridgeUrl}/agents/windows-chrome-characterization-test/poll`, {
        method: 'POST', headers, body: JSON.stringify({ waitMs: 5_000 }),
      });
      expect(poll.status).toBe(200);
      const body = await poll.json() as { command: { commandId: string; command: { type: string } } | null };
      expect(body.command).not.toBeNull();
      seen.push(body.command!.command.type);
      const completed = await fetch(`${bridgeUrl}/agents/windows-chrome-characterization-test/results`, {
        method: 'POST', headers,
        body: JSON.stringify({ commandId: body.command!.commandId, ok: true, result: resultFor(body.command!.command.type) }),
      });
      expect(completed.status).toBe(204);
    }

    const state = await actionPromise;
    expect(state).toMatchObject({
      ok: true,
      runId: expect.any(String),
      error: null,
      evidence: {
        currentUrl: target,
        title: 'AI应用开发工程师 - 智联招聘',
        formStateHash: 'a'.repeat(64),
        stateSignals: ['立即投递','选择简历','在线简历'],
        actions: [{ tag: 'button', text: '立即投递', disabled: false }],
        controls: [{ kind: 'select', label: '选择简历', name: 'resumeId', optionLabels: ['AI Agent简历'], semanticHints: ['resume-selector'] }],
      },
    });
    expect(seen).not.toContain('fill');
    expect(seen).not.toContain('upload');
    expect(seen).not.toContain('click');
    expect(seen).not.toContain('screenshot');
    expect(JSON.stringify(state)).not.toContain('private-action-ref');
    expect(JSON.stringify(state)).not.toContain('private-control-ref');
    expect(JSON.stringify(state)).not.toContain('private-resume-id');
    expect(JSON.stringify(state)).not.toContain('private-job-description');
  });
});
