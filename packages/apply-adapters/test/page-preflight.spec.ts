import { describe, expect, it } from 'vitest';
import type { BrowserActionSnapshot, BrowserControlSnapshot } from '@job-harness/apply-browser';
import { classifyApplyPage } from '../src';

const control = (partial: Partial<BrowserControlSnapshot> & Pick<BrowserControlSnapshot, 'controlRef'|'kind'|'label'>): BrowserControlSnapshot => ({
  name: null, description: null, required: false, disabled: false, readOnly: false, options: [], semanticHints: [], accept: null, multiple: false, sectionLabel: null, ...partial,
});
const action = (text: string): BrowserActionSnapshot => ({ actionRef: '#action', tag: 'button', text, href: null, type: 'button', role: null, disabled: false, ariaDisabled: false });

function classify(overrides: Partial<Parameters<typeof classifyApplyPage>[0]> = {}) {
  return classifyApplyPage({ url: 'https://jobs.example.test/job/123', title: 'Job', bodyText: '', actions: [], controls: [], ...overrides });
}

describe('apply page preflight classification', () => {
  it('detects a conservative application form', () => {
    const result = classify({
      url: 'https://jobs.example.test/apply/123',
      controls: [
        control({ controlRef: '#name', kind: 'text', label: '姓名', required: true }),
        control({ controlRef: '#email', kind: 'email', label: '电子邮箱', required: true }),
      ],
    });
    expect(result).toMatchObject({ state: 'application_form', canInspectForm: true, reasonCode: 'application_form_detected' });
  });

  it('classifies exact apply CTA job-detail pages as human entry points', () => {
    const result = classify({ actions: [action('立即申请')] });
    expect(result).toMatchObject({ state: 'job_detail', canInspectForm: false, reasonCode: 'application_entry_required' });
    expect(result.evidence.applyActionTexts).toEqual(['立即申请']);
  });

  it('classifies phone plus verification-code login surfaces before application-form heuristics', () => {
    const result = classify({
      bodyText: '登录 / 注册',
      controls: [
        control({ controlRef: '#phone', kind: 'text', label: '请输入手机号码' }),
        control({ controlRef: '#code', kind: 'text', label: '请输入验证码' }),
      ],
    });
    expect(result).toMatchObject({ state: 'login_required', canInspectForm: false, reasonCode: 'login_required' });
  });

  it('classifies anti-bot/security pages as human-only', () => {
    const result = classify({ url: 'https://jobs.example.test/security/check', title: '请稍候 - 安全验证' });
    expect(result).toMatchObject({ state: 'security_challenge', canInspectForm: false, reasonCode: 'security_challenge' });
  });
});
