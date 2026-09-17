'use server';

import { createBrowserExtensionPairing } from '../../lib/job-harness-client';

export interface BrowserExtensionPairingActionState {
  readonly ok: boolean;
  readonly code: string | null;
  readonly expiresAt: string | null;
  readonly error: string | null;
}

export const initialBrowserExtensionPairingState: BrowserExtensionPairingActionState = {
  ok: false,
  code: null,
  expiresAt: null,
  error: null,
};

export async function createBrowserExtensionPairingAction(): Promise<BrowserExtensionPairingActionState> {
  try {
    const pairing = await createBrowserExtensionPairing();
    return { ok: true, code: pairing.code, expiresAt: pairing.expiresAt, error: null };
  } catch (error) {
    return { ok: false, code: null, expiresAt: null, error: error instanceof Error ? error.message : String(error) };
  }
}
