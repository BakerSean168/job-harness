'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { Job } from '@job-harness/contracts';
import { JobHarnessRestError } from '@job-harness/client';
import { JobSourceKindSchema } from '@job-harness/contracts';
import { getJobHarnessClient } from '../../lib/job-harness-client';

export interface JobStateActionResult {
  ok: boolean;
  code?: string;
}

export async function setJobStateAction(
  jobId: string,
  state: Job['state'],
  intentId: string,
): Promise<JobStateActionResult> {
  try {
    await getJobHarnessClient().jobs.setJobState({
      jobId,
      state,
      idempotencyKey: `web:job-state:${intentId || randomUUID()}`,
    });
    revalidatePath('/jobs');
    revalidatePath('/inbox');
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof JobHarnessRestError ? error.payload.code : 'INTERNAL_ERROR',
    };
  }
}


export interface AddJobActionState {
  ok: boolean;
  jobId: string | null;
  status: 'inserted' | 'updated' | 'duplicate' | 'rejected' | null;
  code: string | null;
  message: string | null;
}

export const initialAddJobActionState: AddJobActionState = {
  ok: false,
  jobId: null,
  status: null,
  code: null,
  message: null,
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function addJobAction(_previous: AddJobActionState, formData: FormData): Promise<AddJobActionState> {
  const companyName = formString(formData, 'companyName');
  const title = formString(formData, 'title');
  const city = formString(formData, 'city');
  const description = formString(formData, 'description');
  const url = formString(formData, 'url');
  const externalId = formString(formData, 'externalId');
  const sourceParsed = JobSourceKindSchema.safeParse(formString(formData, 'sourceKind') || 'manual');
  if (!companyName || !title || !sourceParsed.success) {
    return { ok: false, jobId: null, status: null, code: 'VALIDATION_ERROR', message: 'Company, title, and source are required.' };
  }
  if (url) {
    try { new URL(url); } catch {
      return { ok: false, jobId: null, status: null, code: 'VALIDATION_ERROR', message: 'Listing URL is invalid.' };
    }
  }

  const identityKind = externalId ? 'external-id' as const : url ? 'url' as const : 'scoped' as const;
  try {
    const result = await getJobHarnessClient().jobs.upsertJobsBatch({
      jobs: [{
        companyName,
        title,
        ...(city ? { city } : {}),
        ...(description ? { description } : {}),
        observedAt: new Date().toISOString(),
        listings: [{
          sourceKind: sourceParsed.data,
          label: sourceParsed.data === 'manual' ? 'Manual entry' : sourceParsed.data,
          ...(url ? { url } : {}),
          ...(externalId ? { externalId, externalNamespace: sourceParsed.data } : {}),
          identityKind,
          status: 'active',
          metadataSnapshot: identityKind === 'scoped' ? { manualEntryId: randomUUID() } : {},
        }],
      }],
    });
    const item = result.items[0];
    if (!item || item.status === 'rejected' || !item.jobId) {
      return { ok: false, jobId: null, status: item?.status ?? 'rejected', code: 'UPSERT_REJECTED', message: item?.reason ?? 'Job was rejected.' };
    }
    revalidatePath('/jobs');
    revalidatePath('/inbox');
    revalidatePath('/companies');
    return { ok: true, jobId: item.jobId, status: item.status, code: null, message: item.reason };
  } catch (error) {
    return {
      ok: false,
      jobId: null,
      status: null,
      code: error instanceof JobHarnessRestError ? error.payload.code : 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Could not add job.',
    };
  }
}
