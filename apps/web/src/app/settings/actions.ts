'use server';

import { revalidatePath } from 'next/cache';
import {
  SaveApplicantProfileInputSchema,
  SaveApplicationAnswerSetInputSchema,
} from '@job-harness/applicant-contracts';
import { JobHarnessRestError } from '@job-harness/client';
import { characterizeBrowserExtensionSite, createBrowserExtensionPairing, getJobHarnessClient } from '../../lib/job-harness-client';
import type { AtsCharacterizationActionState } from './characterization-state';

export interface BrowserExtensionPairingActionState {
  readonly ok: boolean;
  readonly code: string | null;
  readonly expiresAt: string | null;
  readonly error: string | null;
}
export const initialBrowserExtensionPairingState: BrowserExtensionPairingActionState = { ok: false, code: null, expiresAt: null, error: null };
export async function createBrowserExtensionPairingAction(): Promise<BrowserExtensionPairingActionState> {
  try { const pairing = await createBrowserExtensionPairing(); return { ok: true, code: pairing.code, expiresAt: pairing.expiresAt, error: null }; }
  catch (error) { return { ok: false, code: null, expiresAt: null, error: error instanceof Error ? error.message : String(error) }; }
}

export interface ApplicantSettingsActionState { readonly ok: boolean; readonly message: string | null; }
export const initialApplicantSettingsActionState: ApplicantSettingsActionState = { ok: false, message: null };
function number(formData: FormData, key: string): number { return Number(String(formData.get(key) ?? '')); }
function json(formData: FormData, key: string): unknown { return JSON.parse(String(formData.get(key) ?? 'null')); }
function failure(error: unknown): ApplicantSettingsActionState {
  return { ok: false, message: error instanceof JobHarnessRestError ? error.payload.message : error instanceof Error ? error.message : String(error) };
}
export async function saveApplicantProfileAction(_previous: ApplicantSettingsActionState, formData: FormData): Promise<ApplicantSettingsActionState> {
  try {
    const input = SaveApplicantProfileInputSchema.parse({ expectedVersion: number(formData, 'expectedVersion'), profile: json(formData, 'profileJson') });
    await getJobHarnessClient().applicant.saveProfile(input); revalidatePath('/settings'); return { ok: true, message: null };
  } catch (error) { return failure(error); }
}
export async function saveApplicationAnswerSetAction(_previous: ApplicantSettingsActionState, formData: FormData): Promise<ApplicantSettingsActionState> {
  try {
    const input = SaveApplicationAnswerSetInputSchema.parse({ expectedVersion: number(formData, 'expectedVersion'), answerSet: json(formData, 'answerSetJson') });
    await getJobHarnessClient().applicant.saveAnswerSet(input); revalidatePath('/settings'); return { ok: true, message: null };
  } catch (error) { return failure(error); }
}


export async function characterizeAtsSiteAction(_previous: AtsCharacterizationActionState, formData: FormData): Promise<AtsCharacterizationActionState> {
  const agentId = String(formData.get('agentId') ?? '').trim();
  const targetUrl = String(formData.get('targetUrl') ?? '').trim();
  if (!agentId || !targetUrl) return { ok: false, runId: null, error: 'Agent ID and target URL are required', evidence: null };
  try {
    const result = await characterizeBrowserExtensionSite({ agentId, targetUrl });
    return { ok: true, runId: result.runId, error: null, evidence: result.evidence };
  } catch (error) {
    return { ok: false, runId: null, error: error instanceof Error ? error.message : String(error), evidence: null };
  }
}
