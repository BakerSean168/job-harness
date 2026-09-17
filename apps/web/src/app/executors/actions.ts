'use server';

import { revalidatePath } from 'next/cache';
import { getJobHarnessClient } from '../../lib/job-harness-client';


function required(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${key}`);
  return value.trim();
}

export async function authorizeSubmitAction(formData: FormData): Promise<void> {
  const attemptId = required(formData, 'attemptId');
  const reviewSnapshotId = required(formData, 'reviewSnapshotId');
  const decisionNonce = required(formData, 'decisionNonce');
  await getJobHarnessClient().apply.attempts.authorizeSubmit({
    attemptId,
    reviewSnapshotId,
    expiresInSeconds: 300,
    actor: 'user',
    idempotencyKey: `web-review:${attemptId}:${reviewSnapshotId}:${decisionNonce}`,
  });
  revalidatePath('/executors');
  revalidatePath(`/executors/${attemptId}`);
}

export async function revokeSubmitAuthorizationAction(formData: FormData): Promise<void> {
  const attemptId = required(formData, 'attemptId');
  const authorizationId = required(formData, 'authorizationId');
  await getJobHarnessClient().apply.attempts.revokeSubmitAuthorization({ attemptId, authorizationId });
  revalidatePath('/executors');
  revalidatePath(`/executors/${attemptId}`);
}

export async function resumeExecutionAttemptAction(formData: FormData): Promise<void> {
  const attemptId = required(formData, 'attemptId');
  await getJobHarnessClient().apply.attempts.resume({ attemptId });
  revalidatePath('/executors');
  revalidatePath(`/executors/${attemptId}`);
}
