(() => {
  if (globalThis.__jobHarnessBossDriverInstalled) return;
  globalThis.__jobHarnessBossDriverInstalled = true;

  const CONTACT_ATTR = 'data-job-harness-boss-contact-id';
  const RESUME_ATTR = 'data-job-harness-boss-resume-id';

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'JH_BOSS_DRIVER_COMMAND') return false;
    Promise.resolve().then(() => execute(message.command)).then(sendResponse, (error) => {
      sendResponse({ __jobHarnessDriverError: sanitize(error) });
    });
    return true;
  });

  async function execute(command) {
    ensureBossHost();
    const type = String(command?.type || '');
    const payload = command?.payload || {};
    switch (type) {
      case 'boss_detail_snapshot': return detailSnapshot();
      case 'boss_prepare_chat': return prepareChat();
      case 'boss_send_message': return sendMessage(String(payload.message || ''));
      case 'boss_scan_unread_contacts': return scanUnreadContacts(Number(payload.limit || 30));
      case 'boss_open_contact': return openContact(String(payload.contactRef || ''));
      case 'boss_chat_snapshot': return chatSnapshot();
      case 'boss_prepare_resume': return prepareResume(String(payload.expectedJobUrl || ''));
      case 'boss_confirm_resume': return confirmResume(Number(payload.resumeIndex), String(payload.expectedJobUrl || ''));
      default: throw new Error(`Unsupported BOSS driver command '${type}'`);
    }
  }

  function ensureBossHost() {
    if (location.protocol !== 'https:' || !['www.zhipin.com', 'zhipin.com'].includes(location.hostname)) {
      throw new Error('BOSS driver is restricted to zhipin.com');
    }
  }

  function requirePath(pattern, label) {
    if (!pattern.test(location.pathname)) throw new Error(`${label} command is not allowed on ${location.pathname}`);
  }

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function compact(value, max = 5000) {
    return String(value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
  }

  function sanitize(error) {
    return compact(error instanceof Error ? error.message : String(error), 4000);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(15000, ms))));
  }

  function safeHref(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value), location.href);
      if (url.protocol !== 'https:' || !['www.zhipin.com', 'zhipin.com'].includes(url.hostname)) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function firstText(selectors, max = 5000) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = compact(element?.innerText || element?.textContent || '', max);
      if (text) return text;
    }
    return '';
  }

  function detailSnapshot() {
    requirePath(/^\/job_detail\//i, 'BOSS detail');
    const chatBtn = document.querySelector('.btn-startchat');
    const title = firstText(['.name h1', '.job-banner h1', 'h1'], 500);
    const salary = firstText(['.name .salary', '.job-banner .salary', '.salary'], 200);
    const detail = firstText(['.job-sec-text', '.job-detail-section .text', '.job-detail .text'], 50000);
    const company = firstText(['.sider-company .company-info a', '.company-info a', '.job-sider .company-info'], 500);
    const city = firstText(['.job-banner .text-city', '.job-banner .job-location', '.job-location', '[class*="job-location"]'], 300);
    const actionText = compact(chatBtn?.innerText || chatBtn?.textContent || '', 200);
    const chatUrl = safeHref(chatBtn?.getAttribute?.('redirect-url') || chatBtn?.getAttribute?.('href'));
    const addUrl = safeHref(chatBtn instanceof HTMLElement ? chatBtn.dataset?.url : null);
    const talked = chatBtn instanceof HTMLElement && chatBtn.dataset?.isfriend === 'true';
    return {
      url: location.href,
      title,
      salary: salary || null,
      detail,
      company: company || null,
      city: city || null,
      actionText,
      chatUrl,
      addUrl,
      talked,
      canGreet: Boolean(chatBtn && actionText.includes('立即沟通') && chatUrl && addUrl && !talked),
    };
  }

  async function prepareChat() {
    const snapshot = detailSnapshot();
    if (snapshot.talked) return { status: 'already_talked', chatUrl: snapshot.chatUrl };
    if (!snapshot.canGreet || !snapshot.chatUrl || !snapshot.addUrl) {
      throw new Error(`BOSS detail is not greet-ready: ${snapshot.actionText || 'missing action'}`);
    }
    const response = await fetch(snapshot.addUrl, { credentials: 'include', headers: { accept: 'application/json' } });
    const text = await response.text();
    if (!response.ok) throw new Error(`BOSS prepare chat HTTP ${response.status}: ${compact(text, 300)}`);
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('BOSS prepare chat returned invalid JSON'); }
    if (payload?.code !== 0) {
      const message = payload?.zpData?.bizData?.chatRemindDialog?.title || payload?.message || 'unknown BOSS response';
      throw new Error(`BOSS prepare chat rejected: ${compact(message, 300)}`);
    }
    return { status: 'prepared', chatUrl: snapshot.chatUrl };
  }

  function requireChatInput() {
    requirePath(/^\/web\/geek\/chat(?:\/|$)/i, 'BOSS chat');
    const input = document.querySelector('#chat-input');
    if (!(input instanceof HTMLElement) || !visible(input)) throw new Error('BOSS chat input is not available');
    return input;
  }

  function latestOwnMessage() {
    const nodes = [...document.querySelectorAll('.chat-message .item-myself .message-content .text')];
    return compact(nodes.at(-1)?.innerText || nodes.at(-1)?.textContent || '', 5000);
  }

  async function sendMessage(rawMessage) {
    const message = compact(rawMessage, 2000);
    if (!message) throw new Error('BOSS greeting message is empty');
    const input = requireChatInput();
    input.focus();
    input.textContent = message;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: message }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(250);
    const send = [...document.querySelectorAll('.btn-send,button,[role="button"]')]
      .filter((element) => visible(element))
      .find((element) => compact(element.innerText || element.textContent || element.getAttribute('aria-label') || '', 100) === '发送');
    if (!(send instanceof HTMLElement)) throw new Error('BOSS send button is not available');
    if (send.matches(':disabled') || send.getAttribute('aria-disabled') === 'true') throw new Error('BOSS send button is disabled');
    send.click();
    await sleep(700);
    const observed = latestOwnMessage();
    return { sent: observed === message, observedMessage: observed || null };
  }

  function contactRef(element, index, used) {
    let id = compact(element.getAttribute(CONTACT_ATTR) || '', 100);
    if (!/^[A-Za-z0-9._:-]+$/.test(id) || used.has(id)) id = `jhc-${index}`;
    while (used.has(id)) id = `jhc-${index}-${used.size}`;
    element.setAttribute(CONTACT_ATTR, id);
    used.add(id);
    return `[${CONTACT_ATTR}="${CSS.escape(id)}"]`;
  }

  function scanUnreadContacts(limit = 30) {
    requirePath(/^\/web\/geek\/chat(?:\/|$)/i, 'BOSS chat');
    const used = new Set();
    const items = [...document.querySelectorAll('.user-list-content li')].filter((item) => item instanceof HTMLElement && visible(item));
    const result = [];
    for (let index = 0; index < items.length && result.length < Math.max(1, Math.min(100, limit)); index += 1) {
      const item = items[index];
      if (!item.querySelector('.notice-badge')) continue;
      const nameElement = item.querySelector('.name-text');
      const recruiter = compact(nameElement?.innerText || nameElement?.textContent || '', 200);
      const company = compact(nameElement?.nextElementSibling?.innerText || nameElement?.nextElementSibling?.textContent || '', 300);
      result.push({
        contactRef: contactRef(item, index, used),
        recruiter: recruiter || null,
        company: company || null,
        preview: compact(item.innerText || item.textContent || '', 1000),
      });
    }
    return result;
  }

  async function openContact(contactRefValue) {
    requirePath(/^\/web\/geek\/chat(?:\/|$)/i, 'BOSS chat');
    if (!/^\[data-job-harness-boss-contact-id="[A-Za-z0-9._:-]+"\]$/.test(contactRefValue)) throw new Error('Invalid BOSS contact ref');
    const item = document.querySelector(contactRefValue);
    if (!(item instanceof HTMLElement) || !visible(item)) throw new Error('BOSS unread contact is no longer available');
    const clickable = item.querySelector('.name-text') instanceof HTMLElement ? item.querySelector('.name-text') : item;
    clickable.click();
    await sleep(650);
    return chatSnapshot();
  }

  function chatMessages() {
    const container = document.querySelector('.chat-message');
    if (!(container instanceof HTMLElement)) return [];
    const nodes = [...container.querySelectorAll('.item-friend,.item-myself')];
    const messages = [];
    for (const node of nodes) {
      const box = node.querySelector('.message-content .text');
      const content = compact(box?.innerText || box?.textContent || '', 5000);
      if (!content) continue;
      messages.push({ role: node.classList.contains('item-friend') ? 'user' : 'assistant', content });
      if (messages.length >= 300) break;
    }
    return messages;
  }

  function resumeAlreadySent() {
    return [...document.querySelectorAll('.chat-message .boss-green,.boss-green')]
      .some((node) => compact(node.innerText || node.textContent || '', 1000).includes('点击预览附件简历'));
  }

  function recentRecruiterText(messages) {
    let recent = '';
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (item.role !== 'user') break;
      recent = item.content + '\n' + recent;
    }
    return recent.trim();
  }

  function chatSnapshot() {
    requirePath(/^\/web\/geek\/chat(?:\/|$)/i, 'BOSS chat');
    const messages = chatMessages();
    const recent = recentRecruiterText(messages);
    const job = document.querySelector('*[ka="geek_chat_job_detail"]');
    const href = safeHref(job?.getAttribute?.('href'));
    const jobText = compact(job?.innerText || job?.textContent || '', 3000);
    const selected = document.querySelector('.user-list-content li.active,.user-list-content li.selected,.user-list-content li.cur');
    const nameElement = selected?.querySelector?.('.name-text');
    const recruiter = compact(nameElement?.innerText || nameElement?.textContent || '', 200);
    const company = compact(nameElement?.nextElementSibling?.innerText || nameElement?.nextElementSibling?.textContent || '', 300);
    const body = compact(document.body?.innerText || '', 12000);
    const titleGuess = jobText.split('\n').map((value) => compact(value, 500)).find(Boolean) || null;
    return {
      url: location.href,
      messages,
      latestRole: messages.at(-1)?.role || null,
      needResume: /简历|附件|履历|resume|\bcv\b/i.test(recent) ? 1 : 0,
      resumeSended: resumeAlreadySent(),
      jobUrl: href,
      jobText,
      title: titleGuess,
      recruiter: recruiter || null,
      company: company || null,
      bodyText: body,
    };
  }

  function findResumeButton() {
    const candidates = [...document.querySelectorAll('.toolbar-btn.tooltip.tooltip-top,.toolbar-btn,[class*="resume" i]')]
      .filter((element) => element instanceof HTMLElement && visible(element));
    const semantic = candidates.filter((element) => /简历|附件|resume|cv/i.test([
      element.innerText,
      element.textContent,
      element.getAttribute('title'),
      element.getAttribute('aria-label'),
      element.getAttribute('data-title'),
      typeof element.className === 'string' ? element.className : '',
    ].filter(Boolean).join(' ')));
    if (semantic.length === 1) return semantic[0];
    if (semantic.length > 1) throw new Error('BOSS resume send action is ambiguous');
    const legacy = candidates.filter((element) => element.matches('.toolbar-btn.tooltip.tooltip-top'));
    if (legacy.length === 1) return legacy[0];
    throw new Error('BOSS resume send action was not found uniquely');
  }

  function allocateResumeRefs(items) {
    const used = new Set();
    return items.map((item, index) => {
      let id = compact(item.getAttribute(RESUME_ATTR) || '', 100);
      if (!/^[A-Za-z0-9._:-]+$/.test(id) || used.has(id)) id = `jhr-${index}`;
      while (used.has(id)) id = `jhr-${index}-${used.size}`;
      item.setAttribute(RESUME_ATTR, id);
      used.add(id);
      return {
        resumeIndex: index,
        resumeRef: `[${RESUME_ATTR}="${CSS.escape(id)}"]`,
        label: compact(item.innerText || item.textContent || '', 1000),
      };
    });
  }

  function assertCurrentChatJob(expectedJobUrl) {
    const expected = safeHref(expectedJobUrl);
    if (!expected) throw new Error('BOSS expected job URL is invalid');
    const job = document.querySelector('*[ka="geek_chat_job_detail"]');
    const current = safeHref(job?.getAttribute?.('href'));
    if (!current || new URL(current).pathname !== new URL(expected).pathname) {
      throw new Error('BOSS chat conversation no longer matches the authorized job');
    }
    return current;
  }

  async function prepareResume(expectedJobUrl) {
    requirePath(/^\/web\/geek\/chat(?:\/|$)/i, 'BOSS chat');
    assertCurrentChatJob(expectedJobUrl);
    if (resumeAlreadySent()) return { status: 'already_sent', mode: null, resumes: [] };
    const button = findResumeButton();
    button.click();
    await sleep(450);
    const small = document.querySelector('.panel-resume');
    if (small instanceof HTMLElement && visible(small)) {
      return {
        status: 'ready',
        mode: 'small_dialog',
        resumes: [],
        dialogText: compact(small.innerText || small.textContent || '', 2000),
      };
    }
    const list = document.querySelector('.resume-list');
    if (!(list instanceof HTMLElement) || !visible(list)) throw new Error('BOSS resume chooser did not appear');
    const items = [...list.querySelectorAll('li')].filter((item) => item instanceof HTMLElement && visible(item));
    if (!items.length) throw new Error('BOSS resume chooser is empty');
    return { status: 'ready', mode: 'resume_list', resumes: allocateResumeRefs(items), dialogText: null };
  }

  async function confirmResume(resumeIndex, expectedJobUrl) {
    requirePath(/^\/web\/geek\/chat(?:\/|$)/i, 'BOSS chat');
    assertCurrentChatJob(expectedJobUrl);
    if (!Number.isInteger(resumeIndex) || resumeIndex < 0 || resumeIndex > 20) throw new Error('Invalid BOSS resume index');
    if (resumeAlreadySent()) return { sent: false, reason: 'already_sent', selectedResumeIndex: null, mode: null };

    const small = document.querySelector('.panel-resume');
    if (small instanceof HTMLElement && visible(small)) {
      // A small BOSS dialog does not expose which stored resume is selected. It
      // is safe only for the first/default resume; all other indices fail closed.
      if (resumeIndex !== 0) throw new Error('BOSS small resume dialog cannot prove the requested non-default resume selection');
      const confirm = [...small.querySelectorAll('.btn-sure-v2,button,[role="button"]')]
        .find((element) => element instanceof HTMLElement && visible(element) && /确定|发送|确认/.test(compact(element.innerText || element.textContent || '', 100)));
      if (!(confirm instanceof HTMLElement)) throw new Error('BOSS small resume dialog confirm action is unavailable');
      confirm.click();
      await sleep(700);
      return { sent: resumeAlreadySent(), reason: null, selectedResumeIndex: 0, mode: 'small_dialog' };
    }

    const list = document.querySelector('.resume-list');
    if (!(list instanceof HTMLElement) || !visible(list)) throw new Error('BOSS resume list is not open');
    const items = [...list.querySelectorAll('li')].filter((item) => item instanceof HTMLElement && visible(item));
    const item = items[resumeIndex];
    if (!(item instanceof HTMLElement)) throw new Error(`BOSS requested resume index ${resumeIndex} is unavailable`);
    item.click();
    await sleep(250);
    const confirm = [...document.querySelectorAll('.btn-confirm,button,[role="button"]')]
      .filter((element) => element instanceof HTMLElement && visible(element))
      .find((element) => /确定|发送|确认/.test(compact(element.innerText || element.textContent || '', 100)));
    if (!(confirm instanceof HTMLElement)) throw new Error('BOSS resume-list confirm action is unavailable');
    confirm.click();
    await sleep(750);
    return { sent: resumeAlreadySent(), reason: null, selectedResumeIndex: resumeIndex, mode: 'resume_list' };
  }
})();
