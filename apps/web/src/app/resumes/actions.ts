'use server';

import { revalidatePath } from 'next/cache';
import type { ResumeLibrary, ResumeProfile, ResumeProfileContext } from '@job-harness/resume-contracts';
import { JobHarnessRestError } from '@job-harness/client';
import { getJobHarnessClient } from '../../lib/job-harness-client';

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
