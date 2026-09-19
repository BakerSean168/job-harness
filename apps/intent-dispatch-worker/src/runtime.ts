import { classifyObservedApplySite, type ObservedApplySiteFamily, type ObservedApplySiteRoute } from '@job-harness/apply-adapters';
import type { JobHarnessRestClient } from '@job-harness/client';

type Client = JobHarnessRestClient;
type PlannedIntent = Awaited<ReturnType<Client['submissionIntents']['list']>>['items'][number];
type Executor = Awaited<ReturnType<Client['apply']['executors']['list']>>['items'][number];
type SiteBinding = Awaited<ReturnType<Client['siteResumeBindings']['list']>>['items'][number];

export interface IntentDispatchPolicy {
  readonly dryRun?: boolean;
  readonly limit?: number;
  readonly maxDispatches?: number;
}

export interface IntentDispatchResult {
  readonly scanned: number;
  readonly dispatched: number;
  readonly dryRun: boolean;
  readonly skippedExistingAttempt: number;
  readonly skippedIncompleteResume: number;
  readonly skippedUnsupportedSite: number;
  readonly skippedNoExecutor: number;
  readonly skippedMissingBinding: number;
  readonly skippedStaleBinding: number;
  readonly skippedAmbiguousBinding: number;
  readonly skippedDispatchBudget: number;
  readonly decisions: readonly IntentDispatchDecision[];
  readonly failures: readonly { intentId: string; error: string }[];
}

export interface IntentDispatchDecision {
  readonly intentId: string;
  readonly jobId: string;
  readonly site: ObservedApplySiteFamily | 'unsupported';
  readonly outcome: 'dispatch' | 'skip';
  readonly reason: string;
  readonly attemptId: string | null;
  readonly browserAgentId: string | null;
  readonly siteResumeBindingId: string | null;
}

interface SiteRoute {
  readonly site: ObservedApplySiteFamily;
  readonly adapterId: ObservedApplySiteRoute['adapterId'];
  readonly requiresSiteResumeBinding: boolean;
}

export class PlannedIntentDispatcher {
  private readonly dryRun: boolean;
  private readonly limit: number;
  private readonly maxDispatches: number;

  constructor(private readonly client: Client, policy: IntentDispatchPolicy = {}) {
    this.dryRun = policy.dryRun ?? false;
    this.limit = Math.max(1, Math.min(200, Math.trunc(policy.limit ?? 100)));
    this.maxDispatches = Math.max(1, Math.min(20, Math.trunc(policy.maxDispatches ?? 3)));
  }

  async runOnce(): Promise<IntentDispatchResult> {
    const [intents, executors] = await Promise.all([
      this.client.submissionIntents.list({ statuses: ['planned'], limit: this.limit, offset: 0, order: 'oldest' }),
      this.client.apply.executors.list({ limit: 100, offset: 0, statuses: ['ready'] }),
    ]);
    const readyExtension = executors.items.filter(isReadyExtensionExecutor);
    const decisions: IntentDispatchDecision[] = [];
    const failures: Array<{ intentId: string; error: string }> = [];
    let dispatched = 0;
    let skippedExistingAttempt = 0;
    let skippedIncompleteResume = 0;
    let skippedUnsupportedSite = 0;
    let skippedNoExecutor = 0;
    let skippedMissingBinding = 0;
    let skippedStaleBinding = 0;
    let skippedAmbiguousBinding = 0;
    let skippedDispatchBudget = 0;

    for (const intent of intents.items) {
      try {
        const route = routeIntent(intent);
        if (!route) {
          skippedUnsupportedSite += 1;
          decisions.push(skip(intent, 'unsupported', 'unsupported_site'));
          continue;
        }
        if (!hasFrozenResume(intent)) {
          skippedIncompleteResume += 1;
          decisions.push(skip(intent, route.site, 'incomplete_frozen_resume'));
          continue;
        }
        const attempts = await this.client.apply.attempts.list({ intentId: intent.id, limit: 1, offset: 0 });
        if (attempts.total > 0) {
          skippedExistingAttempt += 1;
          decisions.push(skip(intent, route.site, 'execution_attempt_already_exists'));
          continue;
        }

        const capableExecutors = readyExtension.filter((executor) => executor.adapterIds.includes(route.adapterId));
        if (!capableExecutors.length) {
          skippedNoExecutor += 1;
          decisions.push(skip(intent, route.site, 'no_ready_extension_executor'));
          continue;
        }

        let browserAgentId: string | null = null;
        let siteResumeBindingId: string | null = null;
        if (route.requiresSiteResumeBinding) {
          if (route.site !== 'zhilian' && route.site !== 'liepin') throw new Error(`Site '${route.site}' unexpectedly requires a site-resume binding`);
          const bindingResolution = await this.resolveExactBinding(intent, route.site, capableExecutors);
          if (bindingResolution.kind === 'missing') {
            skippedMissingBinding += 1;
            decisions.push(skip(intent, route.site, 'missing_site_resume_binding'));
            continue;
          }
          if (bindingResolution.kind === 'stale') {
            skippedStaleBinding += 1;
            decisions.push(skip(intent, route.site, 'stale_site_resume_binding'));
            continue;
          }
          if (bindingResolution.kind === 'ambiguous') {
            skippedAmbiguousBinding += 1;
            decisions.push(skip(intent, route.site, 'ambiguous_site_resume_binding'));
            continue;
          }
          browserAgentId = bindingResolution.binding.browserAgentId;
          siteResumeBindingId = bindingResolution.binding.id;
        } else {
          const agentIds = uniqueBrowserAgentIds(capableExecutors);
          if (agentIds.length !== 1) {
            skippedNoExecutor += 1;
            decisions.push(skip(intent, route.site, agentIds.length ? 'ambiguous_browser_agent' : 'no_ready_browser_agent'));
            continue;
          }
          browserAgentId = agentIds[0]!;
        }

        if (this.dryRun) {
          decisions.push({ intentId: intent.id, jobId: intent.jobId, site: route.site, outcome: 'dispatch', reason: 'dry_run_eligible', attemptId: null, browserAgentId, siteResumeBindingId });
          continue;
        }
        if (dispatched >= this.maxDispatches) {
          skippedDispatchBudget += 1;
          decisions.push(skip(intent, route.site, 'dispatch_budget_exhausted'));
          continue;
        }
        const attempt = await this.client.apply.attempts.dispatch({
          intentId: intent.id,
          executionMode: 'fill_only',
          requiredAdapterId: route.adapterId,
          preferredBrowserBackend: 'extension',
          requiredCapabilities: ['humanControl', 'persistentSession', 'resumeUpload'],
          policySnapshot: {
            allowFormFill: true,
            allowApplicationEntry: true,
            submitAllowed: false,
            initiatedBy: 'intent-dispatch-worker',
            requiredBrowserAgentId: browserAgentId,
            ...(siteResumeBindingId ? { siteResumeBindingId } : {}),
          },
          idempotencyKey: `intent-auto-fill:${intent.id}:v1`,
        });
        dispatched += 1;
        decisions.push({ intentId: intent.id, jobId: intent.jobId, site: route.site, outcome: 'dispatch', reason: 'queued_fill_only', attemptId: attempt.id, browserAgentId, siteResumeBindingId });
      } catch (error) {
        failures.push({ intentId: intent.id, error: sanitizeError(error) });
      }
    }

    return {
      scanned: intents.items.length,
      dispatched,
      dryRun: this.dryRun,
      skippedExistingAttempt,
      skippedIncompleteResume,
      skippedUnsupportedSite,
      skippedNoExecutor,
      skippedMissingBinding,
      skippedStaleBinding,
      skippedAmbiguousBinding,
      skippedDispatchBudget,
      decisions,
      failures,
    };
  }

  private async resolveExactBinding(
    intent: PlannedIntent & { resumeProfileId: string; resumeRevisionId: string; resumeArtifactId: string },
    siteFamily: 'zhilian' | 'liepin',
    executors: readonly Executor[],
  ): Promise<
    | { kind: 'ok'; binding: SiteBinding }
    | { kind: 'missing' }
    | { kind: 'stale' }
    | { kind: 'ambiguous' }
  > {
    const result = await this.client.siteResumeBindings.list({ siteFamily, profileId: intent.resumeProfileId });
    const onlineAgentIds = new Set(uniqueBrowserAgentIds(executors));
    const online = result.items.filter((binding) => binding.status === 'active' && onlineAgentIds.has(binding.browserAgentId));
    if (!online.length) return { kind: 'missing' };
    const exact = online.filter((binding) => binding.resumeRevisionId === intent.resumeRevisionId && binding.resumeArtifactId === intent.resumeArtifactId);
    if (!exact.length) return { kind: 'stale' };
    if (exact.length !== 1) return { kind: 'ambiguous' };
    return { kind: 'ok', binding: exact[0]! };
  }
}

function routeIntent(intent: PlannedIntent): SiteRoute | null {
  if (!intent.externalTargetUrl) return null;
  const route = classifyObservedApplySite(intent.externalTargetUrl);
  return route
    ? { site: route.family, adapterId: route.adapterId, requiresSiteResumeBinding: route.requiresSiteResumeBinding }
    : null;
}

function hasFrozenResume(intent: PlannedIntent): intent is PlannedIntent & { resumeProfileId: string; resumeRevisionId: string; resumeArtifactId: string } {
  return Boolean(intent.resumeProfileId && intent.resumeRevisionId && intent.resumeArtifactId);
}
function isReadyExtensionExecutor(executor: Executor): boolean {
  return executor.status === 'ready'
    && executor.browserBackends.includes('extension')
    && executor.executionModes.includes('fill_only')
    && executor.capabilities.humanControl
    && executor.capabilities.persistentSession
    && executor.capabilities.resumeUpload;
}
function uniqueBrowserAgentIds(executors: readonly Executor[]): string[] {
  return [...new Set(executors.map((executor) => typeof executor.metadata.browserAgentId === 'string' ? executor.metadata.browserAgentId : '').filter(Boolean))].sort();
}
function skip(intent: PlannedIntent, site: IntentDispatchDecision['site'], reason: string): IntentDispatchDecision {
  return { intentId: intent.id, jobId: intent.jobId, site, outcome: 'skip', reason, attemptId: null, browserAgentId: null, siteResumeBindingId: null };
}
function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}
