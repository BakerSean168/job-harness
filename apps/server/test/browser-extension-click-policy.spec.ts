import { describe, expect, it } from 'vitest';
import { browserExtensionClickAuthority, type BrowserExtensionClickPolicyAttempt } from '../src/browser-extension-click-policy';

function attempt(overrides: Partial<BrowserExtensionClickPolicyAttempt> = {}): BrowserExtensionClickPolicyAttempt {
  return {
    adapterId: 'nowcoder-ats',
    requiredAdapterId: 'nowcoder-ats',
    executionMode: 'fill_only',
    externalEffectState: 'not_crossed',
    policySnapshot: { allowApplicationEntry: true, submitAllowed: false },
    submitAuthorizationId: null,
    ...overrides,
  };
}

describe('Browser Extension click authority', () => {
  it('allows only the characterized Nowcoder application-entry click before the external-effect boundary', () => {
    expect(browserExtensionClickAuthority(attempt(), '立即申请')).toBe('nowcoder_application_entry');
    expect(browserExtensionClickAuthority(attempt(), '投递简历')).toBeNull();
    expect(browserExtensionClickAuthority(attempt({ policySnapshot: { allowApplicationEntry: false } }), '立即申请')).toBeNull();
  });

  it('allows final Nowcoder submit only after the durable supervised-submit boundary is crossed', () => {
    const authorized = attempt({
      executionMode: 'review_then_submit',
      externalEffectState: 'crossed',
      policySnapshot: { allowApplicationEntry: true, submitAllowed: true },
      submitAuthorizationId: 'submit-auth-1',
    });
    expect(browserExtensionClickAuthority(authorized, '投递简历')).toBe('nowcoder_authorized_submit');
    expect(browserExtensionClickAuthority({ ...authorized, externalEffectState: 'not_crossed' }, '投递简历')).toBeNull();
    expect(browserExtensionClickAuthority({ ...authorized, submitAuthorizationId: null }, '投递简历')).toBeNull();
    expect(browserExtensionClickAuthority({ ...authorized, executionMode: 'fill_only' }, '投递简历')).toBeNull();
    expect(browserExtensionClickAuthority({ ...authorized, policySnapshot: { submitAllowed: false } }, '投递简历')).toBeNull();
    expect(browserExtensionClickAuthority({ ...authorized, adapterId: 'zhilian-ats' }, '投递简历')).toBeNull();
  });
});
