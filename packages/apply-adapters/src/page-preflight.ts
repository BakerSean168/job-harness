import type { BrowserActionSnapshot, BrowserControlSnapshot, BrowserDriverPort } from '@job-harness/apply-browser';

export const APPLY_PAGE_STATES = [
  'application_form',
  'job_detail',
  'login_required',
  'security_challenge',
  'listing_closed',
  'submitted_state',
  'unknown',
] as const;
export type ApplyPageState = (typeof APPLY_PAGE_STATES)[number];

export interface ApplyPageObservation {
  readonly url: string;
  readonly title: string | null;
  readonly bodyText: string;
  readonly actions: readonly BrowserActionSnapshot[];
  readonly controls: readonly BrowserControlSnapshot[];
}

export interface ApplyPagePreflightResult {
  readonly state: ApplyPageState;
  readonly canInspectForm: boolean;
  readonly reasonCode: string;
  readonly summary: string;
  readonly evidence: {
    readonly host: string;
    readonly path: string;
    readonly actionCount: number;
    readonly controlCount: number;
    readonly applyActionTexts: readonly string[];
    readonly controlKinds: readonly string[];
    readonly signalCount: number;
  };
}

const APPLY_ACTION = /(?:立即申请|申请职位|立即投递|投递简历|去申请|去投递|apply(?:\s+now)?|submit\s+application)/i;
const SECURITY_SIGNAL = /(?:安全验证|人机验证|请稍候|访问验证|security\s+check|verify\s+you(?:'|’)re\s+human|captcha)/i;
const LOGIN_SIGNAL = /(?:登录|登入|验证码|手机号登录|sign\s*in|log\s*in|verification\s+code)/i;
const CLOSED_SIGNAL = /(?:职位已下线|职位已关闭|停止招聘|招聘已结束|已停止接受申请|no\s+longer\s+accepting\s+applications|position\s+closed)/i;
const SUBMITTED_SIGNAL = /(?:投递成功|申请成功|提交成功|application\s+(?:has\s+been\s+)?submitted|thanks\s+for\s+applying)/i;
const JOB_DETAIL_PATH = /(?:\/jobs?\/detail\/|\/jobdetail\/|\/job_detail\/|#\/job\/|\/jobs?\/[^/]+$)/i;

export async function inspectApplyPagePreflight(browser: BrowserDriverPort): Promise<ApplyPagePreflightResult> {
  const [title, bodyText, actions, controls] = await Promise.all([
    browser.title().catch(() => null),
    browser.bodyText(80_000).catch(() => ''),
    browser.scanActions().catch(() => []),
    browser.scanControls().catch(() => []),
  ]);
  return classifyApplyPage({ url: browser.currentUrl(), title, bodyText, actions, controls });
}

export function classifyApplyPage(input: ApplyPageObservation): ApplyPagePreflightResult {
  const url = new URL(input.url);
  const compactTitle = (input.title ?? '').replace(/\s+/g, ' ').trim();
  const body = input.bodyText.slice(0, 80_000);
  const text = `${compactTitle}\n${body}`;
  const path = `${url.pathname}${url.hash}`;
  const applyActions = input.actions
    .filter((action) => !action.disabled && !action.ariaDisabled && APPLY_ACTION.test(action.text))
    .map((action) => action.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
  const controlKinds = [...new Set(input.controls.map((control) => control.kind))].sort();
  const signalCount = applicationFieldSignalCount(input.controls);
  const evidence = {
    host: url.hostname,
    path: path.slice(0, 1000),
    actionCount: input.actions.length,
    controlCount: input.controls.length,
    applyActionTexts: applyActions,
    controlKinds,
    signalCount,
  } as const;

  if (/\/(?:security|captcha|verify)(?:[/.]|$)/i.test(url.pathname) || SECURITY_SIGNAL.test(text)) {
    return result('security_challenge', false, 'security_challenge', 'The recruiting site is showing a security/human-verification state; browser automation must hand off to a human.', evidence);
  }
  if (CLOSED_SIGNAL.test(text)) {
    return result('listing_closed', false, 'listing_closed', 'The listing appears closed or no longer accepting applications.', evidence);
  }
  if (SUBMITTED_SIGNAL.test(text) && input.controls.length < 2) {
    return result('submitted_state', false, 'submitted_state_requires_reconciliation', 'The page resembles a post-submit state; generic page text is not sufficient success evidence and requires reconciliation.', evidence);
  }
  if (looksLikeLogin(url, text, input.controls)) {
    return result('login_required', false, 'login_required', 'Authentication or verification is required before the application form can be inspected.', evidence);
  }
  if (looksLikeApplicationForm(input.controls, signalCount)) {
    return result('application_form', true, 'application_form_detected', 'A candidate application form was detected from conservative control metadata.', evidence);
  }
  if (applyActions.length > 0 || JOB_DETAIL_PATH.test(path)) {
    return result('job_detail', false, 'application_entry_required', 'A job-detail/application-entry page was detected; entering the application flow requires an explicit site-specific or human action.', evidence);
  }
  return result('unknown', false, 'application_form_not_detected', 'No conservatively identifiable application form was detected; automation must not fill this page.', evidence);
}

function result(
  state: ApplyPageState,
  canInspectForm: boolean,
  reasonCode: string,
  summary: string,
  evidence: ApplyPagePreflightResult['evidence'],
): ApplyPagePreflightResult {
  return { state, canInspectForm, reasonCode, summary, evidence };
}

function looksLikeLogin(url: URL, text: string, controls: readonly BrowserControlSnapshot[]): boolean {
  if (/\/(?:login|signin|sign-in|passport|auth)(?:[/.]|$)/i.test(url.pathname)) return true;
  const visiblePhone = controls.some((control) => /(?:手机|手机号|phone|mobile)/i.test(fieldText(control)));
  const visibleCode = controls.some((control) => /(?:验证码|verification\s*code|otp)/i.test(fieldText(control)));
  return LOGIN_SIGNAL.test(text) && (visiblePhone || visibleCode) && !controls.some((control) => control.kind === 'file');
}

function looksLikeApplicationForm(controls: readonly BrowserControlSnapshot[], signalCount: number): boolean {
  if (controls.some((control) => control.kind === 'file' && /(?:简历|resume|cv|附件|upload)/i.test(fieldText(control)))) return true;
  const required = controls.filter((control) => control.required && !control.disabled && !control.readOnly).length;
  return controls.length >= 2 && signalCount >= 2 && required >= 1;
}

function applicationFieldSignalCount(controls: readonly BrowserControlSnapshot[]): number {
  const groups = new Set<string>();
  for (const control of controls) {
    const text = fieldText(control);
    if (/(?:姓名|full\s*name|candidate\s*name|name)/i.test(text)) groups.add('name');
    if (/(?:邮箱|电子邮箱|e-?mail)/i.test(text)) groups.add('email');
    if (/(?:手机|手机号|电话|phone|mobile|tel)/i.test(text)) groups.add('phone');
    if (/(?:学校|院校|university|college|school)/i.test(text)) groups.add('school');
    if (/(?:专业|major)/i.test(text)) groups.add('major');
    if (/(?:学历|学位|degree|education)/i.test(text)) groups.add('degree');
    if (control.kind === 'file' && /(?:简历|resume|cv|附件|upload)/i.test(text)) groups.add('resume');
  }
  return groups.size;
}

function fieldText(control: BrowserControlSnapshot): string {
  return [control.label, control.name ?? '', control.description ?? '', ...control.semanticHints]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
