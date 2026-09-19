'use server';

import { revalidatePath } from 'next/cache';
import type { PublishResumeRevisionOutput, ResumeLibrary, ResumeProfile, ResumeProfileContext } from '@job-harness/resume-contracts';
import { JobHarnessRestError } from '@job-harness/client';
import { getJobHarnessClient, syncResumeArtifactToRecruitingSite } from '../../lib/job-harness-client';

export type ResumeSaveResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };

function failure(error: unknown): ResumeSaveResult<never> {
  if (error instanceof JobHarnessRestError) return { ok: false, code: error.payload.code, message: error.payload.message };
  return { ok: false, code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) };
}

export async function saveResumeProfileAction(expectedVersion: number, profile: ResumeProfile): Promise<ResumeSaveResult<ResumeProfileContext>> {
  try {
    const value = await getJobHarnessClient().resume.saveProfile({ expectedVersion, profile });
    revalidatePath('/resumes');
    return { ok: true, value };
  } catch (error) { return failure(error); }
}

export async function saveResumeLibraryAction(expectedVersion: number, library: ResumeLibrary): Promise<ResumeSaveResult<ResumeLibrary>> {
  try {
    const value = await getJobHarnessClient().resume.saveLibrary({ expectedVersion, library });
    revalidatePath('/resumes');
    return { ok: true, value };
  } catch (error) { return failure(error); }
}

export async function publishResumeRevisionAction(profileId: string, expectedProfileVersion: number, expectedLibraryVersion: number, note: string | null): Promise<ResumeSaveResult<PublishResumeRevisionOutput>> {
  try {
    const value = await getJobHarnessClient().resume.publishRevision({ profileId, expectedProfileVersion, expectedLibraryVersion, note });
    revalidatePath('/resumes');
    return { ok: true, value };
  } catch (error) { return failure(error); }
}


export type ResumeSiteSyncValue =
  | { readonly state: 'uploaded'; readonly revisionId: string; readonly artifactId: string; readonly artifactSha256: string; readonly runId: string; readonly currentUrl: string; readonly title: string; readonly stateSignals: readonly string[] }
  | { readonly state: 'profile_onboarding_required' | 'unknown'; readonly revisionId: string; readonly artifactId: string; readonly runId: string; readonly currentUrl: string; readonly title: string; readonly stateSignals: readonly string[]; readonly missingFacts: readonly string[]; readonly manualFacts: readonly string[]; readonly appliedFacts: readonly string[] };

export async function syncResumeRevisionToSiteAction(input: {
  profileId: string;
  revisionId: string;
  agentId: string;
  siteFamily: 'liepin';
  fileName: string;
}): Promise<ResumeSaveResult<ResumeSiteSyncValue>> {
  try {
    const client = getJobHarnessClient();
    const detail = await client.resume.getRevision(input.revisionId);
    if (!detail || detail.revision.profileId !== input.profileId) return { ok: false, code: 'REVISION_MISMATCH', message: 'Resume Revision does not belong to the selected Profile' };
    const materialized = await client.resume.materializeArtifact({ revisionId: input.revisionId, kind: 'pdf' });
    const targetUrl = input.siteFamily === 'liepin' ? 'https://c.liepin.com/resume/create' : neverSite(input.siteFamily);
    const synced = await syncResumeArtifactToRecruitingSite({
      agentId: input.agentId,
      targetUrl,
      artifactId: materialized.artifact.id,
      fileName: input.fileName.endsWith('.pdf') ? input.fileName : `${input.fileName}.pdf`,
    });
    return synced.state === 'uploaded'
      ? { ok: true, value: { state: 'uploaded', revisionId: input.revisionId, artifactId: synced.artifactId, artifactSha256: synced.artifactSha256, runId: synced.runId, currentUrl: synced.currentUrl, title: synced.title, stateSignals: synced.stateSignals } }
      : { ok: true, value: { state: synced.state, revisionId: input.revisionId, artifactId: synced.artifactId, runId: synced.runId, currentUrl: synced.currentUrl, title: synced.title, stateSignals: synced.stateSignals, missingFacts: synced.missingFacts, manualFacts: synced.manualFacts, appliedFacts: synced.appliedFacts } };
  } catch (error) { return failure(error); }
}

function neverSite(value: never): never { throw new Error(`Unsupported Site Resume Sync target '${String(value)}'`); }
