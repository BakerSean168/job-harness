import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chromium, type Page } from 'playwright';

const bossDriverPath = fileURLToPath(new URL('../../../integrations/browser-extension/boss-driver.js', import.meta.url));

async function withBossPage<T>(path: string, html: string, run: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhipin.com/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/add-chat') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0 }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    });
    await page.goto('https://www.zhipin.com' + path);
    await page.evaluate(() => {
      (globalThis as unknown as { __jhBossListener?: unknown; chrome?: unknown }).chrome = {
        runtime: { onMessage: { addListener(listener: unknown) {
          (globalThis as unknown as { __jhBossListener?: unknown }).__jhBossListener = listener;
        } } },
      };
    });
    await page.addScriptTag({ content: await readFile(bossDriverPath, 'utf8') });
    return await run(page);
  } finally {
    await browser.close();
  }
}

async function bossCommand(page: Page, type: string, payload: Record<string, unknown> = {}) {
  return page.evaluate(async ({ type, payload }) => {
    const listener = (globalThis as unknown as {
      __jhBossListener?: (message: unknown, sender: unknown, sendResponse: (value: unknown) => void) => boolean;
    }).__jhBossListener;
    if (!listener) throw new Error('BOSS driver listener missing');
    return new Promise<unknown>((resolve, reject) => {
      const keepAlive = listener({ type: 'JH_BOSS_DRIVER_COMMAND', command: { type, payload } }, null, (value) => {
        if (value && typeof value === 'object' && '__jobHarnessDriverError' in value) {
          reject(new Error(String((value as Record<string, unknown>).__jobHarnessDriverError)));
        } else resolve(value);
      });
      if (!keepAlive) reject(new Error('BOSS driver did not keep async response alive'));
    });
  }, { type, payload });
}

describe('MV3 BOSS semantic driver', () => {
  it('extracts the old Copilot detail contract and prepares chat without sending a greeting', async () => {
    const html = '<!doctype html><div class="name"><h1>前端开发工程师</h1><span class="salary">9-13K</span></div><div class="job-banner"><span class="text-city">深圳</span></div><div class="job-sec-text">负责 Vue3、React 和性能优化。</div><div class="sider-company"><div class="company-info"><a>四化信息科技</a></div></div><a class="btn-startchat" redirect-url="/web/geek/chat?id=abc" data-url="/api/add-chat" data-isfriend="false">立即沟通</a>';
    await withBossPage('/job_detail/abc.html', html, async (page) => {
      const snapshot = await bossCommand(page, 'boss_detail_snapshot') as Record<string, unknown>;
      expect(snapshot).toMatchObject({
        title: '前端开发工程师', salary: '9-13K', city: '深圳', company: '四化信息科技',
        talked: false, canGreet: true, chatUrl: 'https://www.zhipin.com/web/geek/chat?id=abc',
        addUrl: 'https://www.zhipin.com/api/add-chat',
      });
      expect(await bossCommand(page, 'boss_prepare_chat'))
        .toEqual({ status: 'prepared', chatUrl: 'https://www.zhipin.com/web/geek/chat?id=abc' });
    });
  });

  it('scans unread chats and sends only the requested semantic greeting', async () => {
    const html = '<!doctype html><ul class="user-list-content"><li class="active"><span class="notice-badge">1</span><span class="name-text">李女士</span><span>四化信息科技</span><span>可以发份简历吗</span></li><li><span class="name-text">王先生</span><span>其他公司</span></li></ul><div class="chat-message"><div class="item-friend"><div class="message-content"><span class="text">你好，可以发份简历吗</span></div></div></div><a ka="geek_chat_job_detail" href="/job_detail/abc.html">前端开发工程师 深圳</a><div id="chat-input" contenteditable="true"></div><button class="btn-send">发送</button><script>document.querySelector(".btn-send").addEventListener("click",()=>{const text=document.querySelector("#chat-input").textContent||"";const row=document.createElement("div");row.className="item-myself";const box=document.createElement("div");box.className="message-content";const span=document.createElement("span");span.className="text";span.textContent=text;box.appendChild(span);row.appendChild(box);document.querySelector(".chat-message").appendChild(row);});</script>';
    await withBossPage('/web/geek/chat', html, async (page) => {
      const contacts = await bossCommand(page, 'boss_scan_unread_contacts', { limit: 10 }) as Array<Record<string, unknown>>;
      expect(contacts).toHaveLength(1);
      expect(contacts[0]).toMatchObject({ recruiter: '李女士', company: '四化信息科技' });
      const snapshot = await bossCommand(page, 'boss_open_contact', { contactRef: contacts[0]!.contactRef }) as Record<string, unknown>;
      expect(snapshot).toMatchObject({ latestRole: 'user', needResume: 1, resumeSended: false, jobUrl: 'https://www.zhipin.com/job_detail/abc.html' });
      const message = '我是四川农业大学的应届生，看到这个岗位比较匹配，希望进一步沟通。';
      expect(await bossCommand(page, 'boss_send_message', { message }))
        .toEqual({ sent: true, observedMessage: message });
    });
  });

  it('requires an exact resume index and verifies the resume-send marker', async () => {
    const html = '<!doctype html><div class="user-list-content"><li class="active"><span class="name-text">李女士</span><span>四化信息科技</span></li></div><div class="chat-message"><div class="item-friend"><div class="message-content"><span class="text">麻烦发一下简历</span></div></div></div><a ka="geek_chat_job_detail" href="/job_detail/abc.html">前端开发工程师</a><button class="toolbar-btn tooltip tooltip-top" aria-label="发送简历">简历</button><div class="resume-list" style="display:none"><ul><li>Agent 简历</li><li>前端开发工程师简历</li><li>全栈开发工程师简历</li></ul></div><button class="btn-confirm" style="display:none">发送</button><script>const button=document.querySelector(".toolbar-btn");const list=document.querySelector(".resume-list");const confirm=document.querySelector(".btn-confirm");button.addEventListener("click",()=>{list.style.display="block";confirm.style.display="block";});confirm.addEventListener("click",()=>{const marker=document.createElement("div");marker.className="boss-green";marker.textContent="点击预览附件简历";document.querySelector(".chat-message").appendChild(marker);});</script>';
    await withBossPage('/web/geek/chat', html, async (page) => {
      const prepared = await bossCommand(page, 'boss_prepare_resume', { expectedJobUrl: 'https://www.zhipin.com/job_detail/abc.html' }) as Record<string, unknown>;
      expect(prepared).toMatchObject({ status: 'ready', mode: 'resume_list' });
      expect(prepared.resumes).toEqual(expect.arrayContaining([expect.objectContaining({ resumeIndex: 1, label: '前端开发工程师简历' })]));
      expect(await bossCommand(page, 'boss_confirm_resume', { resumeIndex: 1, expectedJobUrl: 'https://www.zhipin.com/job_detail/abc.html' }))
        .toEqual({ sent: true, reason: null, selectedResumeIndex: 1, mode: 'resume_list' });
      expect((await bossCommand(page, 'boss_chat_snapshot') as Record<string, unknown>).resumeSended).toBe(true);
    });
  });

  it('fails closed when a small resume dialog cannot prove a non-default resume choice', async () => {
    const html = '<!doctype html><div class="chat-message"></div><a ka="geek_chat_job_detail" href="/job_detail/abc.html">前端开发工程师</a><button class="toolbar-btn tooltip tooltip-top" aria-label="发送简历">简历</button><div class="panel-resume" style="display:none"><button class="btn-sure-v2">确定发送</button></div><script>document.querySelector(".toolbar-btn").addEventListener("click",()=>document.querySelector(".panel-resume").style.display="block");</script>';
    await withBossPage('/web/geek/chat', html, async (page) => {
      await bossCommand(page, 'boss_prepare_resume', { expectedJobUrl: 'https://www.zhipin.com/job_detail/abc.html' });
      await expect(bossCommand(page, 'boss_confirm_resume', { resumeIndex: 1, expectedJobUrl: 'https://www.zhipin.com/job_detail/abc.html' }))
        .rejects.toThrow(/cannot prove the requested non-default resume selection/);
    });
  });
});
