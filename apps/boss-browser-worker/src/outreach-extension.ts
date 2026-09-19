export interface BossUnreadContact {
  readonly contactRef: string;
  readonly recruiter: string | null;
  readonly company: string | null;
  readonly preview: string;
}

export interface BossChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface BossChatSnapshot {
  readonly url: string;
  readonly messages: readonly BossChatMessage[];
  readonly latestRole: 'user' | 'assistant' | null;
  readonly needResume: number;
  readonly resumeSended: boolean;
  readonly jobUrl: string | null;
  readonly jobText: string;
  readonly title: string | null;
  readonly recruiter: string | null;
  readonly company: string | null;
  readonly bodyText: string;
}

export interface BossInspectedConversation {
  readonly contact: BossUnreadContact;
  readonly snapshot: BossChatSnapshot;
}

export interface BossJobDetailSnapshot {
  readonly url: string;
  readonly title: string;
  readonly salary: string | null;
  readonly detail: string;
  readonly company: string | null;
  readonly city: string | null;
  readonly talked: boolean;
}

export type BossGreetingResult =
  | { readonly status: 'sent'; readonly chatUrl: string; readonly observedMessage: string }
  | { readonly status: 'already_talked' | 'not_greetable' | 'send_unverified'; readonly chatUrl: string | null; readonly observedMessage?: string | null; readonly reason?: string | null };

export type BossResumeSendResult =
  | { readonly status: 'sent'; readonly selectedResumeIndex: number; readonly mode: string }
  | { readonly status: 'already_sent' | 'conversation_mismatch' | 'requested_resume_unavailable' | 'resume_selection_unprovable' | 'send_unverified'; readonly reason?: string | null };

interface BossOutreachExtensionClientOptions {
  readonly apiUrl: string;
  readonly authToken: string;
  readonly agentId: string;
  readonly commandTimeoutMs?: number;
}

interface ValidationRun {
  readonly id: string;
  readonly targetUrl: string;
  readonly sessionRef: string | null;
}

export class BossOutreachExtensionClient {
  private readonly apiUrl: string;
  private readonly authToken: string;
  private readonly agentId: string;
  private readonly commandTimeoutMs: number;

  constructor(options: BossOutreachExtensionClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.authToken = options.authToken.trim();
    this.agentId = options.agentId.trim();
    this.commandTimeoutMs = Math.max(1_000, Math.min(60_000, options.commandTimeoutMs ?? 30_000));
    if (!this.authToken) throw new Error('BOSS outreach extension client requires JOB_HARNESS_AUTH_TOKEN');
    if (!this.agentId) throw new Error('BOSS outreach extension client requires a Browser Bridge agent id');
  }

  async inspectJobDetail(jobUrl: string): Promise<BossJobDetailSnapshot> {
    const searchTarget = 'https://www.zhipin.com/web/geek/job';
    const run = await this.createRun(searchTarget, 'boss-discovery', null);
    const sessionRef = await this.acquire(run, searchTarget, false);
    await this.invoke(run.id, sessionRef, { type: 'navigate', payload: { url: jobUrl } });
    await this.invoke(run.id, sessionRef, { type: 'wait', payload: { milliseconds: 650 } });
    const detail = objectResult(await this.invoke(run.id, sessionRef, { type: 'boss_detail_snapshot', payload: {} }), 'boss_detail_snapshot');
    return {
      url: requiredString(detail.url, 'job URL'),
      title: requiredString(detail.title, 'job title'),
      salary: nullableString(detail.salary),
      detail: requiredString(detail.detail, 'job detail'),
      company: nullableString(detail.company),
      city: nullableString(detail.city),
      talked: detail.talked === true,
    };
  }

  async sendGreeting(input: {
    jobUrl: string;
    message: string;
    score: number;
    threshold: number;
    resumeIndex: number;
  }): Promise<BossGreetingResult> {
    const run = await this.createRun(input.jobUrl, 'boss-outreach', {
      operation: 'greet',
      jobUrl: input.jobUrl,
      expectedMessage: input.message,
      score: input.score,
      threshold: input.threshold,
      resumeIndex: input.resumeIndex,
    });
    const sessionRef = await this.acquire(run, input.jobUrl, true);

    const detail = objectResult(await this.invoke(run.id, sessionRef, { type: 'boss_detail_snapshot', payload: {} }), 'boss_detail_snapshot');
    if (detail.talked === true) {
      return { status: 'already_talked', chatUrl: nullableString(detail.chatUrl) };
    }
    if (detail.canGreet !== true) {
      return { status: 'not_greetable', chatUrl: nullableString(detail.chatUrl), reason: nullableString(detail.actionText) ?? 'BOSS detail is not greet-ready' };
    }

    const prepared = objectResult(await this.invoke(run.id, sessionRef, { type: 'boss_prepare_chat', payload: {} }), 'boss_prepare_chat');
    if (prepared.status === 'already_talked') {
      return { status: 'already_talked', chatUrl: nullableString(prepared.chatUrl) };
    }
    const chatUrl = requiredUrl(prepared.chatUrl, 'BOSS prepared chatUrl');
    await this.invoke(run.id, sessionRef, { type: 'navigate', payload: { url: chatUrl } });
    await this.invoke(run.id, sessionRef, { type: 'wait', payload: { milliseconds: 750 } });
    const sent = objectResult(await this.invoke(run.id, sessionRef, {
      type: 'boss_send_message',
      payload: { message: input.message },
    }), 'boss_send_message');
    const observed = nullableString(sent.observedMessage);
    if (sent.sent === true && observed === input.message) {
      return { status: 'sent', chatUrl, observedMessage: observed };
    }
    return { status: 'send_unverified', chatUrl, observedMessage: observed, reason: 'BOSS did not expose the exact sent greeting after the click' };
  }

  async inspectUnreadChats(limit = 30): Promise<readonly BossInspectedConversation[]> {
    const target = 'https://www.zhipin.com/web/geek/chat';
    const run = await this.createRun(target, 'boss-chat-inspect', null);
    const sessionRef = await this.acquire(run, target, true);
    const raw = await this.invoke(run.id, sessionRef, {
      type: 'boss_scan_unread_contacts',
      payload: { limit: Math.max(1, Math.min(100, Math.trunc(limit))) },
    });
    if (!Array.isArray(raw)) throw new Error('boss_scan_unread_contacts returned non-array');
    const contacts = raw.map(parseUnreadContact);
    const conversations: BossInspectedConversation[] = [];
    for (const contact of contacts) {
      const snapshot = parseChatSnapshot(await this.invoke(run.id, sessionRef, {
        type: 'boss_open_contact',
        payload: { contactRef: contact.contactRef },
      }));
      conversations.push({ contact, snapshot });
    }
    return conversations;
  }

  async sendResumeFollowup(input: {
    jobUrl: string;
    resumeIndex: number;
    score: number;
    threshold: number;
    authorizationReason: 'explicit-request' | 'qualified-followup';
  }): Promise<BossResumeSendResult> {
    const target = 'https://www.zhipin.com/web/geek/chat';
    const run = await this.createRun(target, 'boss-outreach', {
      operation: 'resume-followup',
      jobUrl: input.jobUrl,
      expectedResumeIndex: input.resumeIndex,
      score: input.score,
      threshold: input.threshold,
      authorizationReason: input.authorizationReason,
    });
    const sessionRef = await this.acquire(run, target, true);
    const snapshot = parseChatSnapshot(await this.invoke(run.id, sessionRef, { type: 'boss_chat_snapshot', payload: {} }));
    if (!sameBossJob(snapshot.jobUrl, input.jobUrl)) {
      return { status: 'conversation_mismatch', reason: 'Selected BOSS chat is not the policy-authorized job' };
    }
    if (snapshot.resumeSended) return { status: 'already_sent' };

    const prepared = objectResult(await this.invoke(run.id, sessionRef, {
      type: 'boss_prepare_resume',
      payload: { expectedJobUrl: input.jobUrl },
    }), 'boss_prepare_resume');
    if (prepared.status === 'already_sent') return { status: 'already_sent' };
    const mode = nullableString(prepared.mode);
    if (mode === 'small_dialog' && input.resumeIndex !== 0) {
      return { status: 'resume_selection_unprovable', reason: 'BOSS small resume dialog does not expose a verifiable non-default resume choice' };
    }
    if (mode === 'resume_list') {
      const resumes = Array.isArray(prepared.resumes) ? prepared.resumes : [];
      const available = resumes.some((item) => objectOrNull(item)?.resumeIndex === input.resumeIndex);
      if (!available) return { status: 'requested_resume_unavailable', reason: 'Requested Resume Profile index is absent from the BOSS chooser' };
    }

    const confirmed = objectResult(await this.invoke(run.id, sessionRef, {
      type: 'boss_confirm_resume',
      payload: { resumeIndex: input.resumeIndex, expectedJobUrl: input.jobUrl },
    }), 'boss_confirm_resume');
    if (confirmed.sent === true && confirmed.selectedResumeIndex === input.resumeIndex) {
      return { status: 'sent', selectedResumeIndex: input.resumeIndex, mode: nullableString(confirmed.mode) ?? 'unknown' };
    }
    if (confirmed.reason === 'already_sent') return { status: 'already_sent' };
    return { status: 'send_unverified', reason: 'BOSS did not expose the expected resume-sent marker after confirmation' };
  }

  private async createRun(targetUrl: string, mode: 'boss-discovery' | 'boss-chat-inspect' | 'boss-outreach', bossOutreachIntent: unknown): Promise<ValidationRun> {
    const response = await this.request('/internal/browser-bridge/v1/validation-runs', {
      method: 'POST',
      body: JSON.stringify({
        agentId: this.agentId,
        targetUrl,
        mode,
        ttlMs: 10 * 60_000,
        ...(bossOutreachIntent ? { bossOutreachIntent } : {}),
      }),
    });
    return parseResponse<ValidationRun>(response, 'create BOSS extension run');
  }

  private async acquire(run: ValidationRun, preferredUrl: string, preferReuse: boolean): Promise<string> {
    try {
      const acquired = await this.invoke(run.id, null, {
        type: 'session_acquire',
        payload: { preferredUrl, reuseLiveSession: preferReuse, requireLiveSession: false },
      });
      return requiredString(objectResult(acquired, 'session_acquire').sessionRef, 'sessionRef');
    } catch (error) {
      if (!preferReuse || !isTargetMismatch(error)) throw error;
      const acquired = await this.invoke(run.id, null, {
        type: 'session_acquire',
        payload: { preferredUrl, reuseLiveSession: false, requireLiveSession: false },
      });
      return requiredString(objectResult(acquired, 'session_acquire').sessionRef, 'sessionRef');
    }
  }

  private async invoke(runId: string, sessionRef: string | null, command: Record<string, unknown>): Promise<unknown> {
    const response = await this.request(
      '/internal/browser-bridge/v1/validation-runs/' + encodeURIComponent(runId) + '/invoke',
      {
        method: 'POST',
        body: JSON.stringify({ sessionRef, command, timeoutMs: this.commandTimeoutMs }),
      },
      this.commandTimeoutMs + 5_000,
    );
    const parsed = await parseResponse<{ result: unknown }>(response, 'invoke BOSS extension command');
    return parsed.result;
  }

  private request(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
    return fetch(this.apiUrl + path, {
      ...init,
      headers: {
        authorization: 'Bearer ' + this.authToken,
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
}

async function parseResponse<T>(response: Response, action: string): Promise<T> {
  const text = await response.text();
  const parsed = text ? safeJson(text) : null;
  if (!response.ok) {
    const message = errorMessage(parsed) || ('HTTP ' + response.status);
    const error = new Error(action + ' failed: ' + message) as Error & { status?: number; code?: string };
    error.status = response.status;
    const code = errorCode(parsed);
    if (code) error.code = code;
    throw error;
  }
  return parsed as T;
}

function parseUnreadContact(value: unknown): BossUnreadContact {
  const item = objectResult(value, 'BOSS unread contact');
  return {
    contactRef: requiredString(item.contactRef, 'contactRef'),
    recruiter: nullableString(item.recruiter),
    company: nullableString(item.company),
    preview: nullableString(item.preview) ?? '',
  };
}

function parseChatSnapshot(value: unknown): BossChatSnapshot {
  const item = objectResult(value, 'BOSS chat snapshot');
  const messages = Array.isArray(item.messages)
    ? item.messages.map((message) => {
        const row = objectResult(message, 'BOSS chat message');
        const role: BossChatMessage['role'] | null = row.role === 'user' || row.role === 'assistant' ? row.role : null;
        if (!role) throw new Error('BOSS chat message role is invalid');
        return { role, content: requiredString(row.content, 'message content') };
      })
    : [];
  const latestRole = item.latestRole === 'user' || item.latestRole === 'assistant' ? item.latestRole : null;
  return {
    url: requiredString(item.url, 'chat URL'),
    messages,
    latestRole,
    needResume: Number.isInteger(item.needResume) ? Number(item.needResume) : 0,
    resumeSended: item.resumeSended === true,
    jobUrl: nullableString(item.jobUrl),
    jobText: nullableString(item.jobText) ?? '',
    title: nullableString(item.title),
    recruiter: nullableString(item.recruiter),
    company: nullableString(item.company),
    bodyText: nullableString(item.bodyText) ?? '',
  };
}

function sameBossJob(left: string | null, right: string): boolean {
  if (!left) return false;
  try {
    const a = new URL(left);
    const b = new URL(right);
    const hosts = new Set(['zhipin.com', 'www.zhipin.com']);
    return hosts.has(a.hostname.toLowerCase())
      && hosts.has(b.hostname.toLowerCase())
      && /^\/job_detail\//i.test(a.pathname)
      && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

function objectResult(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' returned invalid data');
  return value as Record<string, unknown>;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' must be a non-empty string');
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function requiredUrl(value: unknown, label: string): string {
  const raw = requiredString(value, label);
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error(label + ' must use HTTPS');
  return url.toString();
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 500) }; }
}

function errorMessage(value: unknown): string | null {
  const outer = objectOrNull(value);
  const inner = objectOrNull(outer?.error);
  return nullableString(inner?.message);
}

function errorCode(value: unknown): string | undefined {
  const outer = objectOrNull(value);
  const inner = objectOrNull(outer?.error);
  return nullableString(inner?.code) ?? undefined;
}

function isTargetMismatch(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'VALIDATION_TARGET_MISMATCH');
}
