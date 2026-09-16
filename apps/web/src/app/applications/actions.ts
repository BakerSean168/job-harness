'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { ApplicationStageSchema, IsoDateTimeSchema } from '@job-harness/contracts';
import { JobHarnessRestError } from '@job-harness/client';
import { getJobHarnessClient } from '../../lib/job-harness-client';

export interface ApplicationTransitionActionResult {
  ok: boolean;
  code?: string;
}

export async function transitionApplicationAction(
  applicationId: string,
  jobId: string,
  toStage: string,
  intentId: string,
  occurredAt: string,
  note?: string,
): Promise<ApplicationTransitionActionResult> {
  const parsedStage = ApplicationStageSchema.safeParse(toStage);
  const parsedOccurredAt = IsoDateTimeSchema.safeParse(occurredAt);
  if (!parsedStage.success) return { ok: false, code: 'INVALID_STAGE' };
  if (!parsedOccurredAt.success) return { ok: false, code: 'INVALID_OCCURRED_AT' };

  try {
    await getJobHarnessClient().applications.transition({
      applicationId,
      toStage: parsedStage.data,
      occurredAt: parsedOccurredAt.data,
      idempotencyKey: `web:application-transition:${intentId || randomUUID()}`,
      actor: 'user',
      ...(note?.trim() ? { note: note.trim() } : {}),
    });
    revalidatePath('/applications');
    revalidatePath(`/applications/${applicationId}`);
    revalidatePath('/jobs');
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof JobHarnessRestError ? error.payload.code : 'INTERNAL_ERROR',
    };
  }
}
