'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { ApplicationStageSchema, ApplicationSubmissionChannelSchema, IsoDateTimeSchema, ListApplicationBoardInputSchema, type ListApplicationBoardOutput } from '@job-harness/contracts';
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

export interface ApplicationLaneLoadResult {
  ok: boolean;
  value?: ListApplicationBoardOutput;
  code?: string;
}

export async function loadApplicationLaneAction(input: unknown): Promise<ApplicationLaneLoadResult> {
  const parsed = ListApplicationBoardInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_FILTERS' };
  try {
    const value = await getJobHarnessClient().workspace.listApplicationBoard(parsed.data);
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof JobHarnessRestError ? error.payload.code : 'INTERNAL_ERROR',
    };
  }
}


export interface RecordApplicationActionState {
  ok: boolean;
  applicationId: string | null;
  code: string | null;
  message: string | null;
}

export const initialRecordApplicationActionState: RecordApplicationActionState = {
  ok: false,
  applicationId: null,
  code: null,
  message: null,
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function recordApplicationAction(
  _previous: RecordApplicationActionState,
  formData: FormData,
): Promise<RecordApplicationActionState> {
  const jobId = formString(formData, 'jobId');
  const listingId = formString(formData, 'listingId');
  const channel = formString(formData, 'channel');
  const resumeProfileId = formString(formData, 'resumeProfileId');
  const appliedAtIso = formString(formData, 'appliedAtIso');
  const note = formString(formData, 'note');
  const linkLatestRevision = formData.get('linkLatestRevision') === 'on';
  const parsedAppliedAt = IsoDateTimeSchema.safeParse(appliedAtIso);
  const parsedChannel = channel ? ApplicationSubmissionChannelSchema.safeParse(channel) : null;
  if (!jobId || !parsedAppliedAt.success || (parsedChannel && !parsedChannel.success)) {
    return { ok: false, applicationId: null, code: 'VALIDATION_ERROR', message: 'Job, application time, and channel must be valid.' };
  }

  try {
    const client = getJobHarnessClient();
    let resumeRevisionId: string | undefined;
    let resumeArtifactId: string | undefined;
    if (resumeProfileId && linkLatestRevision) {
      const revisions = await client.resume.listRevisions(resumeProfileId);
      const latest = revisions.items[0];
      if (latest) {
        resumeRevisionId = latest.id;
        const detail = await client.resume.getRevision(latest.id);
        resumeArtifactId = detail?.artifacts.find((artifact) => artifact.kind === 'pdf')?.id;
      }
    }
    const result = await client.applications.record({
      jobId,
      appliedAt: parsedAppliedAt.data,
      ...(listingId ? { listingId } : {}),
      ...(parsedChannel?.success ? { channel: parsedChannel.data } : {}),
      ...(resumeProfileId ? { resumeProfileId } : {}),
      ...(resumeRevisionId ? { resumeRevisionId } : {}),
      ...(resumeArtifactId ? { resumeArtifactId } : {}),
      idempotencyKey: `web:application-record:${randomUUID()}`,
      actor: 'user',
      ...(note ? { note } : {}),
    });
    revalidatePath('/applications');
    revalidatePath('/jobs');
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/applications/${result.application.id}`);
    return { ok: true, applicationId: result.application.id, code: null, message: null };
  } catch (error) {
    return {
      ok: false,
      applicationId: null,
      code: error instanceof JobHarnessRestError ? error.payload.code : 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Could not record application.',
    };
  }
}
