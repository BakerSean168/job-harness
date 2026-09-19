'use server';

import { revalidatePath } from 'next/cache';
import {
  SaveApplicantProfileInputSchema,
  SaveApplicationAnswerSetInputSchema,
} from '@job-harness/applicant-contracts';
import { JobHarnessRestError } from '@job-harness/client';
import { characterizeBrowserExtensionSite, createBrowserExtensionPairing, getJobHarnessClient } from '../../lib/job-harness-client';
import type { AtsCharacterizationActionState, SiteResumeBindingActionState } from './characterization-state';

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
    await getJobHarnessClient().applicant.saveProfile(input); revalidatePath('/settings'); revalidatePath('/resumes'); return { ok: true, message: null };
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
  const requestedMode = String(formData.get('mode') ?? 'site-readonly').trim();
  const mode = requestedMode === 'site-staged-readonly' ? 'site-staged-readonly' as const : 'site-readonly' as const;
  if (!agentId || !targetUrl) return { ok: false, runId: null, agentId: null, error: 'Agent ID and target URL are required', evidence: null };
  try {
    const result = await characterizeBrowserExtensionSite({ agentId, targetUrl, mode });
    return { ok: true, runId: result.runId, agentId, error: null, evidence: result.evidence };
  } catch (error) {
    return { ok: false, runId: null, agentId: null, error: error instanceof Error ? error.message : String(error), evidence: null };
  }
}


export async function createSiteResumeBindingAction(_previous: SiteResumeBindingActionState, formData: FormData): Promise<SiteResumeBindingActionState> {
  const siteFamily = String(formData.get('siteFamily') ?? '').trim();
  const browserAgentId = String(formData.get('browserAgentId') ?? '').trim();
  const profileId = String(formData.get('profileId') ?? '').trim();
  const resumeRevisionId = String(formData.get('resumeRevisionId') ?? '').trim();
  const resumeArtifactId = String(formData.get('resumeArtifactId') ?? '').trim();
  const externalResumeLabel = String(formData.get('externalResumeLabel') ?? '').trim();
  const characterizationRunId = String(formData.get('characterizationRunId') ?? '').trim();
  if (!['zhilian','liepin'].includes(siteFamily) || !browserAgentId || !profileId || !externalResumeLabel || !characterizationRunId) {
    return { ok: false, bindingId: null, message: 'Site resume binding input is incomplete' };
  }
  try {
    const binding = await getJobHarnessClient().siteResumeBindings.create({
      siteFamily: siteFamily as 'zhilian' | 'liepin',
      browserAgentId,
      profileId,
      ...(resumeRevisionId && resumeArtifactId ? { resumeRevisionId, resumeArtifactId } : {}),
      externalResumeLabel,
      characterizationRunId,
      idempotencyKey: `web:site-resume-binding:${characterizationRunId}:${profileId}:${externalResumeLabel}`,
    });
    revalidatePath('/settings');
    revalidatePath('/resumes');
    return { ok: true, bindingId: binding.id, message: binding.externalResumeLabel };
  } catch (error) {
    return { ok: false, bindingId: null, message: error instanceof JobHarnessRestError ? error.payload.message : error instanceof Error ? error.message : String(error) };
  }
}

export async function revokeSiteResumeBindingAction(formData: FormData): Promise<void> {
  const bindingId = String(formData.get('bindingId') ?? '').trim();
  if (!bindingId) throw new Error('Site resume binding ID is required');
  await getJobHarnessClient().siteResumeBindings.revoke(bindingId, { idempotencyKey: `web:site-resume-binding-revoke:${bindingId}` });
  revalidatePath('/settings');
  revalidatePath('/resumes');
}
