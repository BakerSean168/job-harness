export interface BrowserExtensionClickPolicyAttempt {
  readonly adapterId: string | null;
  readonly requiredAdapterId: string | null;
  readonly executionMode: 'fill_only' | 'review_then_submit' | 'auto_submit';
  readonly externalEffectState: 'not_crossed' | 'crossed' | 'uncertain';
  readonly policySnapshot: Readonly<Record<string, unknown>>;
  readonly submitAuthorizationId: string | null;
}

export type BrowserExtensionClickAuthority =
  | 'nowcoder_application_entry'
  | 'nowcoder_authorized_submit';

export function browserExtensionClickAuthority(
  attempt: BrowserExtensionClickPolicyAttempt,
  expectedText: string | null | undefined,
): BrowserExtensionClickAuthority | null {
  const adapterId = attempt.adapterId ?? attempt.requiredAdapterId;
  const exactText = expectedText?.replace(/\s+/g, ' ').trim() ?? null;
  if (
    attempt.externalEffectState === 'not_crossed'
    && attempt.policySnapshot.allowApplicationEntry === true
    && adapterId === 'nowcoder-ats'
    && exactText === '立即申请'
  ) return 'nowcoder_application_entry';
  if (
    attempt.externalEffectState === 'crossed'
    && attempt.executionMode === 'review_then_submit'
    && attempt.policySnapshot.submitAllowed === true
    && Boolean(attempt.submitAuthorizationId)
    && adapterId === 'nowcoder-ats'
    && exactText === '投递简历'
  ) return 'nowcoder_authorized_submit';
  return null;
}
