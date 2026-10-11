export interface BrowserExtensionPairingActionState {
  readonly ok: boolean;
  readonly code: string | null;
  readonly expiresAt: string | null;
  readonly error: string | null;
}

export const initialBrowserExtensionPairingState: BrowserExtensionPairingActionState = {
  ok: false, code: null, expiresAt: null, error: null,
};

export interface ApplicantSettingsActionState {
  readonly ok: boolean;
  readonly message: string | null;
}

export const initialApplicantSettingsActionState: ApplicantSettingsActionState = { ok: false, message: null };
