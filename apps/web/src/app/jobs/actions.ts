'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Job } from '@job-harness/contracts';
import { JobHarnessRestError } from '@job-harness/client';
import { JobSourceKindSchema } from '@job-harness/contracts';
import { getJobHarnessClient } from '../../lib/job-harness-client';
import type { AddJobActionState, JobStateActionResult } from './action-state';

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


export async function prepareRecommendedApplicationAction(formData: FormData): Promise<void> {
  const jobId = formString(formData, 'jobId');
  const listingId = formString(formData, 'listingId');
  const preferredProfileId = formString(formData, 'preferredProfileId');
  const decisionNonce = formString(formData, 'decisionNonce');
  if (!jobId || !preferredProfileId || !decisionNonce) throw new Error('Job, Resume Profile, and decision nonce are required');
  const client = getJobHarnessClient();
  const executors = await client.apply.executors.list({ limit: 100, offset: 0 });
  const extensionReady = executors.items.some((executor) =>
    executor.status === 'ready'
    && executor.browserBackends.includes('extension')
    && executor.executionModes.includes('fill_only')
    && executor.capabilities.humanControl
    && executor.capabilities.persistentSession
    && executor.capabilities.resumeUpload,
  );
  if (!extensionReady) throw new Error('No ready user-Chrome Apply Executor is available for automatic form fill');

  const prepared = await client.jobs.prepareRecommendedSubmission(jobId, {
    ...(listingId ? { listingId } : {}),
    preferredProfileId,
    executor: 'browser-extension',
    idempotencyKey: `web:auto-resume:${jobId}:${preferredProfileId}:${decisionNonce}`,
    note: 'Prepared from Job detail using deterministic Resume Profile recommendation.',
  });
  const attempt = await client.apply.attempts.dispatch({
    intentId: prepared.intent.id,
    executionMode: 'fill_only',
    preferredBrowserBackend: 'extension',
    requiredCapabilities: ['humanControl', 'persistentSession', 'resumeUpload'],
    policySnapshot: {
      allowFormFill: true,
      allowApplicationEntry: true,
      submitAllowed: false,
      initiatedBy: 'user-web-auto-fill',
    },
    idempotencyKey: `web:auto-fill:${prepared.intent.id}:${decisionNonce}`,
  });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/executors');
  redirect(`/executors/${attempt.id}`);
}
