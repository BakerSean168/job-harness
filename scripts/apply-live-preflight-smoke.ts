import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../apps/server/src/index.ts';
import { ApplyWorker } from '../apps/apply-worker/src/runtime.ts';
import { FormFillExecutionEngine } from '../apps/apply-worker/src/form-fill-engine.ts';
import { ApplySiteAdapterRegistry, GenericAtsSiteAdapter, NowcoderAtsSiteAdapter } from '@job-harness/apply-adapters';
import { BrowserBackendRegistry, SteelBrowserBackend, type BrowserSessionPort } from '@job-harness/apply-browser';
import type { ExecutorDescriptor } from '@job-harness/apply-contracts';
import { createJobHarnessRestClient } from '@job-harness/client';

const DEFAULT_TARGET = 'https://www.nowcoder.com/jobs/detail/457892';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateTarget(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('Live preflight smoke accepts HTTPS only');
  if (!['www.nowcoder.com', 'nowcoder.com'].includes(url.hostname)) {
    throw new Error(`Live preflight smoke is intentionally restricted to the observed Nowcoder family, got '${url.hostname}'`);
  }
  if (!/^\/jobs\/detail\//.test(url.pathname)) throw new Error(`Expected a Nowcoder job-detail URL, got '${url.pathname}'`);
  return url.toString();
}

async function main(): Promise<void> {
  const targetUrl = validateTarget(process.env.JOB_HARNESS_LIVE_PREFLIGHT_URL?.trim() || DEFAULT_TARGET);
  const work = await mkdtemp(join(tmpdir(), 'job-harness-live-preflight-'));
  const globalToken = `global-${randomUUID()}-${randomUUID()}`;
  const workerToken = `worker-${randomUUID()}-${randomUUID()}`;
  let server: RunningJobHarnessServer | null = null;
  let retained: BrowserSessionPort | null = null;

  const steel = new SteelBrowserBackend({
    baseUrl: process.env.JOB_HARNESS_STEEL_BASE_URL ?? 'http://127.0.0.1:3000',
    viewerBaseUrl: null,
    apiKey: process.env.STEEL_API_KEY ?? null,
    contextPath: join(work, 'steel-context.json'),
    headless: true,
    timezone: 'Asia/Shanghai',
  });

  try {
    const health = await steel.health();
    assert(health.ok, `Steel is unavailable: ${health.detail ?? 'unknown'}`);

    server = await startJobHarnessServer({
      databasePath: join(work, 'career.db'),
      artifactDirectory: join(work, 'artifacts'),
      host: '127.0.0.1',
      port: 0,
      authToken: globalToken,
      executorAuthToken: workerToken,
      submissionReconcileIntervalMs: null,
    });
    const globalClient = createJobHarnessRestClient({ baseUrl: server.apiUrl, authToken: globalToken });
    const workerClient = createJobHarnessRestClient({ baseUrl: server.apiUrl, authToken: workerToken });
    const observedAt = new Date().toISOString();

    const upserted = await globalClient.jobs.upsertJobsBatch({
      jobs: [{
        companyName: 'Live Preflight Fixture',
        title: 'Read-only Nowcoder preflight fixture',
        city: null,
        description: null,
        observedAt,
        listings: [{ sourceKind: 'other', url: targetUrl, identityKind: 'url', status: 'active' }],
      }],
    });
    const jobId = upserted.items[0]?.jobId;
    assert(jobId, 'Fixture Job was not created');
    const detail = await globalClient.workspace.getJobDetail(jobId);
    const listingId = detail?.job.listings[0]?.id;
    assert(listingId, 'Fixture Listing was not created');

    const intent = await globalClient.submissionIntents.prepare({
      jobId,
      listingId,
      channel: 'other',
      executor: 'other',
      externalTargetUrl: targetUrl,
      idempotencyKey: `live-preflight-intent:${randomUUID()}`,
      note: 'Ephemeral read-only live preflight smoke. No click/fill/upload/submit is permitted.',
    });

    const attempt = await globalClient.apply.attempts.dispatch({
      intentId: intent.id,
      executionMode: 'fill_only',
      requiredAdapterId: 'nowcoder-ats',
      preferredBrowserBackend: 'steel',
      requiredCapabilities: ['humanControl'],
      policySnapshot: { allowFormFill: true, livePreflightSmoke: true },
      idempotencyKey: `live-preflight-attempt:${randomUUID()}`,
    });

    const descriptor: ExecutorDescriptor = {
      executorId: `live-preflight-${randomUUID()}`,
      name: 'Ephemeral Live Preflight Worker',
      version: '0.2.0',
      hostLabel: 'oracle2-ephemeral',
      status: 'ready',
      browserBackends: ['steel'],
      adapterIds: ['nowcoder-ats', 'generic-ats'],
      executionModes: ['fill_only'],
      capabilities: { resumeUpload: false, humanControl: true, persistentSession: true, screenshots: false, semanticMapping: false },
      maxConcurrency: 1,
      metadata: { smoke: 'read-only-live-preflight', externalSideEffects: false },
    };

    const worker = new ApplyWorker({
      client: workerClient.apply,
      backends: new BrowserBackendRegistry([steel]),
      descriptor,
      backendId: 'steel',
      adapterId: 'nowcoder-ats',
      formFillEngine: new FormFillExecutionEngine({
        siteAdapters: new ApplySiteAdapterRegistry([new NowcoderAtsSiteAdapter(), new GenericAtsSiteAdapter()]),
      }),
      leaseSeconds: 90,
      humanReviewHandoffSeconds: 300,
      attemptHeartbeatIntervalMs: 60_000,
      logger: { log() {}, warn() {}, error() {} },
    });

    await worker.register();
    const run = await worker.runOnce();
    assert(run.claimed && run.attemptId === attempt.id, `Worker did not claim the expected attempt: ${JSON.stringify(run)}`);
    assert(run.outcome === 'waiting', `Live preflight must fail closed into human waiting, got '${run.outcome}'`);

    const after = await globalClient.apply.attempts.get(attempt.id);
    assert(after, 'ExecutionAttempt disappeared after worker run');
    const current = after.attempt;
    assert(current.state === 'waiting_for_user', `Expected waiting_for_user, got '${current.state}'`);
    assert(current.externalEffectState === 'not_crossed', `External-effect boundary changed to '${current.externalEffectState}'`);
    assert(current.checkpoint?.startsWith('human-entry:'), `Expected human-entry checkpoint, got '${current.checkpoint}'`);
    assert(current.browserSessionHandoff, 'Expected a retained browser handoff');

    const reviews = await globalClient.apply.attempts.listReviewSnapshots(attempt.id, 20);
    assert(reviews.items.length === 0, `Read-only preflight unexpectedly created ${reviews.items.length} ReviewSnapshot(s)`);
    const applications = await globalClient.workspace.listApplicationBoard({ limit: 20, offset: 0 });
    assert(applications.total === 0, `Read-only preflight unexpectedly created ${applications.total} Application(s)`);
    const intentAfter = await globalClient.submissionIntents.get(intent.id);
    assert(intentAfter?.status === 'planned', `SubmissionIntent moved unexpectedly to '${intentAfter?.status ?? 'missing'}'`);

    const handoff = current.browserSessionHandoff;
    retained = await steel.resume(handoff);
    await retained.release();
    retained = null;

    const waitingEvent = [...after.events].reverse().find((event) => event.type === 'human_action_required');
    const payload = waitingEvent?.payload ?? {};
    const pageState = typeof payload.pageState === 'string'
      ? payload.pageState
      : typeof (payload.preflight as Record<string, unknown> | undefined)?.state === 'string'
        ? String((payload.preflight as Record<string, unknown>).state)
        : current.checkpoint?.replace(/^human-entry:/, '') ?? 'unknown';

    console.log(JSON.stringify({
      ok: true,
      mode: 'ephemeral-live-preflight',
      targetHost: new URL(targetUrl).hostname,
      attemptState: current.state,
      checkpoint: current.checkpoint,
      pageState,
      adapterId: current.adapterId,
      externalEffectState: current.externalEffectState,
      reviewSnapshots: reviews.items.length,
      applications: applications.total,
      submissionIntentStatus: intentAfter.status,
      browserHandoffReleased: true,
      externalActionsPerformed: 0,
    }, null, 2));
  } finally {
    if (retained) await retained.release().catch(() => {});
    // The smoke uses its own temporary Steel handoff registry. Reap with a
    // future timestamp so a failed assertion cannot leak an anonymous session.
    await steel.reapExpired(new Date(Date.now() + 10 * 60_000).toISOString()).catch(() => {});
    if (server) await server.close().catch(() => {});
    await rm(work, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
