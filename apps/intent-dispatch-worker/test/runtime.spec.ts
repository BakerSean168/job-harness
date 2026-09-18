import { describe, expect, it } from 'vitest';
import { PlannedIntentDispatcher } from '../src/runtime';

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intent-1', jobId: 'job-1', listingId: 'listing-1', channel: 'zhilian',
    resumeProfileId: 'ai-agent-app', resumeRevisionId: 'rev-1', resumeArtifactId: 'artifact-1',
    executor: 'browser-extension', executorSessionId: null,
    externalTargetUrl: 'https://www.zhaopin.com/jobdetail/CC1.htm', status: 'planned',
    externalStartedAt: null, externalConfirmedAt: null, appliedAt: null, externalReference: null,
    externalEvidence: {}, applicationId: null, submissionId: null, lastError: null, retryCount: 0,
    note: null, idempotencyKey: 'intent-key', requestHash: 'a'.repeat(64), createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}
function executor(overrides: Record<string, unknown> = {}) {
  return {
    executorId: 'extension-executor', name: 'Chrome', version: '1', hostLabel: 'oracle2', status: 'ready',
    browserBackends: ['extension'], adapterIds: ['zhilian-ats','liepin-ats','nowcoder-ats'], executionModes: ['fill_only'],
    capabilities: { resumeUpload: true, humanControl: true, persistentSession: true, screenshots: false, semanticMapping: false },
    maxConcurrency: 1, metadata: { browserAgentId: 'windows-chrome-primary' },
    lastHeartbeatAt: '2026-09-18T00:00:00.000Z', createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}
function binding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'binding-1', siteFamily: 'zhilian', browserAgentId: 'windows-chrome-primary', profileId: 'ai-agent-app',
    resumeRevisionId: 'rev-1', resumeArtifactId: 'artifact-1', externalResumeLabel: 'AI Agent.pdf', assurance: 'user-confirmed-label',
    characterizationRunId: 'char-1', characterizationFormStateHash: 'b'.repeat(64), characterizationObservedAt: '2026-09-18T00:00:00.000Z',
    status: 'active', createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z', revokedAt: null,
    idempotencyKey: 'binding-key', requestHash: 'c'.repeat(64), revokeIdempotencyKey: null, revokeRequestHash: null,
    ...overrides,
  };
}
function fakeClient(options: { intents?: any[]; executors?: any[]; bindings?: any[]; attempts?: any[] } = {}) {
  const dispatches: any[] = [];
  const client: any = {
    submissionIntents: { async list() { const items = options.intents ?? [intent()]; return { items, total: items.length }; } },
    siteResumeBindings: { async list() { return { items: options.bindings ?? [] }; } },
    apply: {
      executors: { async list() { const items = options.executors ?? [executor()]; return { items, total: items.length }; } },
      attempts: {
        async list() { const items = options.attempts ?? []; return { items, total: items.length }; },
        async dispatch(input: any) { dispatches.push(input); return { id: `attempt-${dispatches.length}`, ...input }; },
      },
    },
  };
  return { client, dispatches };
}

describe('PlannedIntentDispatcher', () => {
  it('holds Zhilian/Liepin planned intents when no exact site-managed Resume binding exists', async () => {
    const { client, dispatches } = fakeClient();
    const result = await new PlannedIntentDispatcher(client).runOnce();
    expect(result).toMatchObject({ scanned: 1, dispatched: 0, skippedMissingBinding: 1, failures: [] });
    expect(result.decisions[0]).toMatchObject({ site: 'zhilian', outcome: 'skip', reason: 'missing_site_resume_binding' });
    expect(dispatches).toEqual([]);
  });

  it('dispatches fill_only only when the site binding matches exact frozen profile/revision/artifact and online Chrome agent', async () => {
    const { client, dispatches } = fakeClient({ bindings: [binding()] });
    const result = await new PlannedIntentDispatcher(client).runOnce();
    expect(result).toMatchObject({ scanned: 1, dispatched: 1, failures: [] });
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({
      intentId: 'intent-1', executionMode: 'fill_only', requiredAdapterId: 'zhilian-ats', preferredBrowserBackend: 'extension',
      requiredCapabilities: ['humanControl','persistentSession','resumeUpload'],
      policySnapshot: {
        allowFormFill: true, allowApplicationEntry: true, submitAllowed: false,
        initiatedBy: 'intent-dispatch-worker', requiredBrowserAgentId: 'windows-chrome-primary', siteResumeBindingId: 'binding-1',
      },
      idempotencyKey: 'intent-auto-fill:intent-1:v1',
    });
  });

  it('rejects a stale site binding that points to an older Resume Revision/Artifact', async () => {
    const { client, dispatches } = fakeClient({ bindings: [binding({ resumeRevisionId: 'rev-old', resumeArtifactId: 'artifact-old' })] });
    const result = await new PlannedIntentDispatcher(client).runOnce();
    expect(result).toMatchObject({ dispatched: 0, skippedStaleBinding: 1 });
    expect(dispatches).toEqual([]);
  });

  it('can auto-dispatch a fully frozen Nowcoder intent to the unique online user-Chrome agent without a site-managed Resume binding', async () => {
    const nowcoder = intent({ channel: 'other', externalTargetUrl: 'https://www.nowcoder.com/jobs/detail/463747' });
    const { client, dispatches } = fakeClient({ intents: [nowcoder], bindings: [] });
    const result = await new PlannedIntentDispatcher(client).runOnce();
    expect(result).toMatchObject({ dispatched: 1, skippedMissingBinding: 0 });
    expect(dispatches[0]).toMatchObject({
      requiredAdapterId: 'nowcoder-ats', executionMode: 'fill_only',
      policySnapshot: { submitAllowed: false, requiredBrowserAgentId: 'windows-chrome-primary' },
    });
    expect(dispatches[0].policySnapshot.siteResumeBindingId).toBeUndefined();
  });

  it('never redispatches an intent that already has any ExecutionAttempt and never accepts Liepin recruiter /a/ pages', async () => {
    const existing = fakeClient({ bindings: [binding()], attempts: [{ id: 'attempt-existing' }] });
    const existingResult = await new PlannedIntentDispatcher(existing.client).runOnce();
    expect(existingResult).toMatchObject({ dispatched: 0, skippedExistingAttempt: 1 });
    expect(existing.dispatches).toEqual([]);

    const recruiterIntent = intent({ channel: 'liepin', externalTargetUrl: 'https://www.liepin.com/a/12345.shtml' });
    const recruiter = fakeClient({ intents: [recruiterIntent] });
    const recruiterResult = await new PlannedIntentDispatcher(recruiter.client).runOnce();
    expect(recruiterResult).toMatchObject({ dispatched: 0, skippedUnsupportedSite: 1 });
  });

  it('caps each live run to a small dispatch budget even when many intents are eligible', async () => {
    const intents = [1,2,3].map((n) => intent({ id:`intent-${n}`, jobId:`job-${n}` }));
    const { client, dispatches } = fakeClient({ intents, bindings: [binding()] });
    const result = await new PlannedIntentDispatcher(client, { maxDispatches: 2 }).runOnce();
    expect(result).toMatchObject({ scanned:3, dispatched:2, skippedDispatchBudget:1 });
    expect(dispatches).toHaveLength(2);
    expect(result.decisions[2]).toMatchObject({ outcome:'skip', reason:'dispatch_budget_exhausted' });
  });

  it('dry-run reports eligibility without creating an Attempt', async () => {
    const { client, dispatches } = fakeClient({ bindings: [binding()] });
    const result = await new PlannedIntentDispatcher(client, { dryRun: true }).runOnce();
    expect(result).toMatchObject({ dryRun: true, dispatched: 0 });
    expect(result.decisions[0]).toMatchObject({ outcome: 'dispatch', reason: 'dry_run_eligible', attemptId: null });
    expect(dispatches).toEqual([]);
  });
});
