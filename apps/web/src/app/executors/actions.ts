'use server';

import { revalidatePath } from 'next/cache';
import { getJobHarnessClient } from '../../lib/job-harness-client';


function required(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${key}`);
  return value.trim();
}


export async function dispatchPreparedIntentAction(formData: FormData): Promise<void> {
  const intentId = required(formData, 'intentId');
  const decisionNonce = required(formData, 'decisionNonce');
  const client = getJobHarnessClient();
  const intent = await client.submissionIntents.get(intentId);
  if (!intent) throw new Error(`SubmissionIntent '${intentId}' was not found`);
  if (intent.status !== 'planned') throw new Error(`SubmissionIntent '${intentId}' is '${intent.status}', expected 'planned'`);
  if (!intent.resumeRevisionId || !intent.resumeArtifactId) {
    throw new Error(`SubmissionIntent '${intentId}' must bind an immutable Resume Revision and PDF Artifact before safe form fill`);
  }
  const revision = await client.resume.getRevision(intent.resumeRevisionId);
  const artifact = revision?.artifacts.find((candidate) => candidate.id === intent.resumeArtifactId);
  if (!artifact || artifact.kind !== 'pdf' || artifact.mimeType !== 'application/pdf') {
    throw new Error(`SubmissionIntent '${intentId}' Resume evidence is not an immutable PDF Artifact`);
  }
  const detail = await client.workspace.getJobDetail(intent.jobId);
  const listing = intent.listingId ? detail?.job.listings.find((candidate) => candidate.id === intent.listingId) ?? null : null;
  if (!(intent.externalTargetUrl ?? listing?.url)) throw new Error(`SubmissionIntent '${intentId}' has no executable recruiting-site URL`);

  const requiredCapabilities: Array<'humanControl' | 'persistentSession' | 'resumeUpload'> = ['humanControl', 'persistentSession', 'resumeUpload'];
  await client.apply.attempts.dispatch({
    intentId,
    executionMode: 'fill_only',
    preferredBrowserBackend: 'steel',
    requiredCapabilities,
    policySnapshot: {
      allowFormFill: true,
      allowApplicationEntry: true,
      submitAllowed: false,
      initiatedBy: 'user-web',
    },
    idempotencyKey: `web-safe-fill:${intentId}:${decisionNonce}`,
  });
  revalidatePath('/executors');
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
