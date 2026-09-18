export interface AtsCharacterizationActionState {
  readonly ok: boolean;
  readonly runId: string | null;
  readonly agentId: string | null;
  readonly error: string | null;
  readonly evidence: {
    readonly observedAt: string;
    readonly currentUrl: string;
    readonly title: string;
    readonly formStateHash: string;
    readonly bodyTextLength: number;
    readonly stateSignals: readonly string[];
    readonly actions: readonly { readonly tag: string; readonly text: string; readonly href: string | null; readonly type: string | null; readonly role: string | null; readonly disabled: boolean; readonly ariaDisabled: boolean }[];
    readonly controls: readonly { readonly kind: string; readonly label: string; readonly name: string | null; readonly description: string | null; readonly required: boolean; readonly disabled: boolean; readonly readOnly: boolean; readonly optionLabels: readonly string[]; readonly semanticHints: readonly string[]; readonly accept: string | null; readonly multiple: boolean; readonly sectionLabel: string | null }[];
  } | null;
}

export const initialAtsCharacterizationActionState: AtsCharacterizationActionState = {
  ok: false,
  runId: null,
  agentId: null,
  error: null,
  evidence: null,
};

export interface SiteResumeBindingActionState {
  readonly ok: boolean;
  readonly bindingId: string | null;
  readonly message: string | null;
}
export const initialSiteResumeBindingActionState: SiteResumeBindingActionState = { ok: false, bindingId: null, message: null };
