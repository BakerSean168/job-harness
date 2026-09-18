'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getJobHarnessClient } from '../../lib/job-harness-client';


function required(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${key}`);
  return value.trim();
}


export async function dispatchPreparedIntentAction(formData: FormData): Promise<void> {
  const intentId = required(formData, 'intentId');
  const decisionNonce = required(formData, 'decisionNonce');
  const browserBackend = required(formData, 'browserBackend');
  const executionMode = required(formData, 'executionMode');
  if (!/^[a-z0-9][a-z0-9._:-]{0,99}$/i.test(browserBackend)) throw new Error(`Invalid browser backend '${browserBackend}'`);
  if (executionMode !== 'fill_only' && executionMode !== 'review_then_submit') throw new Error(`Invalid execution mode '${executionMode}'`);
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
  const executors = await client.apply.executors.list({ limit: 100, offset: 0 });
  const compatibleExecutor = executors.items.some((executor) =>
    executor.status === 'ready'
    && executor.browserBackends.includes(browserBackend)
    && executor.executionModes.includes(executionMode)
    && executor.capabilities.humanControl
    && executor.capabilities.persistentSession
    && executor.capabilities.resumeUpload,
  );
  if (!compatibleExecutor) throw new Error(`No compatible ready Apply Executor is available for browser backend '${browserBackend}'`);
  await client.apply.attempts.dispatch({
    intentId,
    executionMode,
    preferredBrowserBackend: browserBackend,
    requiredCapabilities,
    policySnapshot: {
      allowFormFill: true,
      allowApplicationEntry: true,
      submitAllowed: executionMode === 'review_then_submit',
      initiatedBy: 'user-web',
    },
    idempotencyKey: `web-${executionMode}:${intentId}:${decisionNonce}`,
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


export async function reconcileUncertainAttemptAction(formData: FormData): Promise<void> {
  const sourceAttemptId = required(formData, 'attemptId');
  const decisionNonce = required(formData, 'decisionNonce');
  const client = getJobHarnessClient();
  const detail = await client.apply.attempts.get(sourceAttemptId);
  if (!detail) throw new Error(`ExecutionAttempt '${sourceAttemptId}' was not found`);
  const source = detail.attempt;
  if (source.state !== 'failed' || source.externalEffectState !== 'uncertain') {
    throw new Error(`ExecutionAttempt '${sourceAttemptId}' is not an uncertain terminal submit attempt`);
  }
  const intent = await client.submissionIntents.get(source.intentId);
  if (!intent || intent.status !== 'needs_manual_review') {
    throw new Error(`SubmissionIntent '${source.intentId}' is not awaiting manual reconciliation`);
  }
  const executors = await client.apply.executors.list({ limit: 100, offset: 0 });
  const ready = executors.items.some((executor) =>
    executor.status === 'ready'
    && executor.browserBackends.includes('extension')
    && executor.adapterIds.includes('readiness-v1')
    && executor.executionModes.includes('fill_only')
    && executor.capabilities.humanControl
    && executor.capabilities.persistentSession,
  );
  if (!ready) throw new Error('No ready user-Chrome reconciliation executor is available');
  const attempt = await client.apply.attempts.dispatch({
    intentId: intent.id,
    executionMode: 'fill_only',
    requiredAdapterId: 'readiness-v1',
    preferredBrowserBackend: 'extension',
    requiredCapabilities: ['humanControl', 'persistentSession'],
    policySnapshot: {
      reconciliationOnly: true,
      readinessOnly: true,
      allowFormFill: false,
      allowApplicationEntry: false,
      submitAllowed: false,
      initiatedBy: 'user-web-reconciliation',
    },
    idempotencyKey: `web-reconcile:${sourceAttemptId}:${decisionNonce}`,
  });
  revalidatePath('/executors');
  revalidatePath(`/executors/${sourceAttemptId}`);
  redirect(`/executors/${attempt.id}`);
}
