'use server';

import { revalidatePath } from 'next/cache';
import {
  EntityIdSchema,
  UpsertSavedViewInputSchema,
  type UpsertSavedViewInput,
} from '@job-harness/contracts';
import { JobHarnessRestError } from '@job-harness/client';
import { getJobHarnessClient } from '../../lib/job-harness-client';

export interface SavedViewActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

function revalidateSavedViewWorkspaces() {
  revalidatePath('/jobs');
  revalidatePath('/applications');
}

export async function upsertSavedViewAction(input: UpsertSavedViewInput): Promise<SavedViewActionResult> {
  const parsed = UpsertSavedViewInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid Saved View' };
  }
  try {
    await getJobHarnessClient().savedViews.upsert(parsed.data);
    revalidateSavedViewWorkspaces();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof JobHarnessRestError ? error.payload.code : 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function deleteSavedViewAction(savedViewId: string): Promise<SavedViewActionResult> {
  const parsed = EntityIdSchema.safeParse(savedViewId);
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid Saved View id' };
  try {
    await getJobHarnessClient().savedViews.delete(parsed.data);
    revalidateSavedViewWorkspaces();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof JobHarnessRestError ? error.payload.code : 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
