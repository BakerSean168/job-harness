import { afterEach, describe, expect, it, vi } from 'vitest';
import { BossOutreachExtensionClient } from '../src/outreach-extension';

afterEach(() => vi.unstubAllGlobals());

describe('BossOutreachExtensionClient', () => {
  it('binds one greeting to the exact server-authorized text and job', async () => {
    const requests: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url: String(url), body });
      if (String(url).endsWith('/validation-runs')) return json({ id: 'run-greet', targetUrl: body.targetUrl, sessionRef: null }, 201);
      const type = body?.command?.type;
      if (type === 'session_acquire') return invoke({ sessionRef: 'chrome-tab:greet', currentUrl: 'https://www.zhipin.com/job_detail/abc.html' });
      if (type === 'boss_detail_snapshot') return invoke({ title: '前端开发工程师', talked: false, canGreet: true, chatUrl: 'https://www.zhipin.com/web/geek/chat?id=abc' });
      if (type === 'boss_prepare_chat') return invoke({ status: 'prepared', chatUrl: 'https://www.zhipin.com/web/geek/chat?id=abc' });
      if (type === 'navigate' || type === 'wait') return invoke(null);
      if (type === 'boss_send_message') return invoke({ sent: true, observedMessage: body.command.payload.message });
      throw new Error('Unexpected request ' + String(url) + ' ' + type);
    }));

    const client = clientFixture();
    const result = await client.sendGreeting({
      jobUrl: 'https://www.zhipin.com/job_detail/abc.html',
      message: '精确招呼文本',
      score: 71,
      threshold: 58,
      resumeIndex: 1,
    });

    expect(result).toEqual({ status: 'sent', chatUrl: 'https://www.zhipin.com/web/geek/chat?id=abc', observedMessage: '精确招呼文本' });
    expect(requests.find((request) => request.url.endsWith('/validation-runs'))?.body).toMatchObject({
      mode: 'boss-outreach',
      bossOutreachIntent: {
        operation: 'greet',
        jobUrl: 'https://www.zhipin.com/job_detail/abc.html',
        expectedMessage: '精确招呼文本',
        score: 71,
        threshold: 58,
        resumeIndex: 1,
      },
    });
    expect(requests.filter((request) => request.body?.command?.type === 'boss_send_message'))
      .toEqual([expect.objectContaining({ body: expect.objectContaining({ command: { type: 'boss_send_message', payload: { message: '精确招呼文本' } } }) })]);
  });

  it('inspects unread contacts in a read-only chat scope before any follow-up authority exists', async () => {
    const createBodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (String(url).endsWith('/validation-runs')) {
        createBodies.push(body);
        return json({ id: 'run-inspect', targetUrl: body.targetUrl, sessionRef: null }, 201);
      }
      const type = body?.command?.type;
      if (type === 'session_acquire') return invoke({ sessionRef: 'chrome-tab:chat', currentUrl: 'https://www.zhipin.com/web/geek/chat' });
      if (type === 'boss_scan_unread_contacts') return invoke([{ contactRef: '[data-job-harness-boss-contact-id="jhc-0"]', recruiter: '李女士', company: '四化信息科技', preview: '发份简历' }]);
      if (type === 'boss_open_contact') return invoke({
        url: 'https://www.zhipin.com/web/geek/chat',
        messages: [{ role: 'user', content: '发份简历' }],
        latestRole: 'user',
        needResume: 1,
        resumeSended: false,
        jobUrl: 'https://www.zhipin.com/job_detail/abc.html',
        jobText: '前端开发工程师',
        title: '前端开发工程师',
        recruiter: '李女士',
        company: '四化信息科技',
        bodyText: 'chat',
      });
      throw new Error('Unexpected ' + type);
    }));

    const result = await clientFixture().inspectUnreadChats(10);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ contact: { recruiter: '李女士' }, snapshot: { latestRole: 'user', needResume: 1 } });
    expect(createBodies).toEqual([expect.objectContaining({ mode: 'boss-chat-inspect' })]);
    expect(createBodies[0]).not.toHaveProperty('bossOutreachIntent');
  });

  it('binds a resume follow-up to the exact conversation job and Resume Profile index', async () => {
    const requests: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url: String(url), body });
      if (String(url).endsWith('/validation-runs')) return json({ id: 'run-resume', targetUrl: body.targetUrl, sessionRef: null }, 201);
      const type = body?.command?.type;
      if (type === 'session_acquire') return invoke({ sessionRef: 'chrome-tab:chat', currentUrl: 'https://www.zhipin.com/web/geek/chat' });
      if (type === 'boss_chat_snapshot') return invoke({
        url: 'https://www.zhipin.com/web/geek/chat',
        messages: [{ role: 'user', content: '发份简历' }],
        latestRole: 'user', needResume: 1, resumeSended: false,
        jobUrl: 'https://www.zhipin.com/job_detail/abc.html', jobText: '前端开发工程师', title: '前端开发工程师',
        recruiter: '李女士', company: '四化信息科技', bodyText: 'chat',
      });
      if (type === 'boss_prepare_resume') return invoke({ status: 'ready', mode: 'resume_list', resumes: [{ resumeIndex: 1, label: '前端简历' }] });
      if (type === 'boss_confirm_resume') return invoke({ sent: true, selectedResumeIndex: 1, mode: 'resume_list' });
      throw new Error('Unexpected ' + type);
    }));

    const result = await clientFixture().sendResumeFollowup({
      jobUrl: 'https://www.zhipin.com/job_detail/abc.html',
      resumeIndex: 1,
      score: 71,
      threshold: 58,
      authorizationReason: 'explicit-request',
    });
    expect(result).toEqual({ status: 'sent', selectedResumeIndex: 1, mode: 'resume_list' });

    const create = requests.find((request) => request.url.endsWith('/validation-runs'));
    expect(create.body.bossOutreachIntent).toMatchObject({
      operation: 'resume-followup',
      jobUrl: 'https://www.zhipin.com/job_detail/abc.html',
      expectedResumeIndex: 1,
      authorizationReason: 'explicit-request',
    });
    expect(requests.find((request) => request.body?.command?.type === 'boss_confirm_resume')?.body.command.payload)
      .toEqual({ resumeIndex: 1, expectedJobUrl: 'https://www.zhipin.com/job_detail/abc.html' });
  });
});

function clientFixture() {
  return new BossOutreachExtensionClient({
    apiUrl: 'http://127.0.0.1:20901',
    authToken: 'test-token',
    agentId: 'windows-chrome-primary',
  });
}

function invoke(result: unknown): Response {
  return json({ run: { id: 'run', targetUrl: 'https://www.zhipin.com', sessionRef: 'chrome-tab:1' }, result });
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
