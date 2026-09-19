import 'server-only';

import type { SiteResumeBinding, SubmissionIntent } from '@job-harness/contracts';
import type { JobHarnessRestClient } from '@job-harness/client';
import {
  exactSiteResumeBindingExists,
  makeAtsBindingTarget,
  managedSiteIntentRoute,
  type AtsBindingTarget,
} from './ats-binding-targets';

export async function buildPendingAtsBindingTargets(input: {
  readonly client: JobHarnessRestClient;
  readonly bindings: readonly SiteResumeBinding[];
  readonly plannedIntents: readonly SubmissionIntent[];
  readonly profileId?: string;
}): Promise<readonly AtsBindingTarget[]> {
  const candidates = input.plannedIntents.filter((intent) => {
    if (input.profileId && intent.resumeProfileId !== input.profileId) return false;
    const route = managedSiteIntentRoute(intent);
    if (!route || !intent.resumeProfileId || !intent.resumeRevisionId || !intent.resumeArtifactId) return false;
    return !exactSiteResumeBindingExists(intent, route, input.bindings);
  });

  const targets = await Promise.all(candidates.map(async (intent) => {
    const attempts = await input.client.apply.attempts.list({ intentId: intent.id, limit: 1, offset: 0 });
    if (attempts.total > 0) return null;
    const detail = await input.client.workspace.getJobDetail(intent.jobId);
    return detail ? makeAtsBindingTarget(intent, detail) : null;
  }));

  return targets.filter((target): target is AtsBindingTarget => target !== null);
}
