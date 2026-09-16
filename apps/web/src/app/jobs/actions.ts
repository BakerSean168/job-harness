'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { Job } from '@job-harness/contracts';
import { JobHarnessRestError } from '@job-harness/client';
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
