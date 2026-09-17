import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExtensionBrowserBackend, BrowserBackendRegistry } from '@job-harness/apply-browser';
import { BROWSER_EXTENSION_DRIVER_COMMANDS, type ExecutorDescriptor } from '@job-harness/apply-contracts';
import { ApplySiteAdapterRegistry, GenericAtsSiteAdapter } from '@job-harness/apply-adapters';
import { ApplyWorker } from '../../apply-worker/src/runtime';
import { FormFillExecutionEngine } from '../../apply-worker/src/form-fill-engine';
import { createJobHarnessRestClient } from '@job-harness/client';
import { SqliteResumeStore } from '@job-harness/persistence-sqlite';
import { createResumeApplicationService, importResumeCatalog } from '@job-harness/resume-application';
import { ResumeLibrarySchema, ResumeProfileSchema } from '@job-harness/resume-contracts';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;
afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
});

const both = (value: string) => ({ 'zh-CN': value, en: value });
async function seedRevision(databasePath: string): Promise<string> {
  const store = new SqliteResumeStore(databasePath);
  try {
    const at = '2026-09-17T13:40:00.000Z';
    const library = ResumeLibrarySchema.parse({
      id: 'primary', schemaVersion: 2, version: 1,
      basics: { displayName: both('Extension User'), contact: { phone: null, email: 'extension@example.test', website: null, github: null, location: both('杭州') }, photoAssetId: null },
      education: [], skills: [], workExperiences: [], projects: [], certificates: [], summaries: [], createdAt: at, updatedAt: at,
    });
    const profile = ResumeProfileSchema.parse({
      id: 'frontend', libraryId: library.id, version: 1, name: both('Frontend Resume'), targetRole: both('Frontend Engineer'), locale: 'zh-CN', templateId: 'classic-v1', positioning: both('Frontend Engineer'),
      output: { documentTitle: both('Frontend Resume'), description: null, onlineUrl: null, pdfName: both('frontend-resume') }, layout: { header: 'without-photo', pageSize: 'A4' },
      sectionOrder: ['skills'], educationIds: [], skillIds: [], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], archivedAt: null, createdAt: at, updatedAt: at,
    });
    await importResumeCatalog(store, { library, profiles: [profile] });
    return (await createResumeApplicationService(store, { now: () => at }).publishRevision({ profileId: profile.id, expectedProfileVersion: 1, expectedLibraryVersion: 1 })).revision.id;
  } finally { store.close(); }
}

describe('user-browser extension backend through the normal ApplyWorker Attempt protocol', () => {
  it('reaches Review on the same durable attempt without giving the extension Career/Resume authority', async () => {
    dir = await mkdtemp(join(tmpdir(), 'jh-extension-worker-'));
    const databasePath = join(dir, 'career.db');
    const revisionId = await seedRevision(databasePath);
    running = await startJobHarnessServer({
      databasePath, host: '127.0.0.1', port: 0,
      authToken: 'global-secret', executorAuthToken: 'worker-secret', browserExtensionSigningKey: 'fixture-browser-extension-signing-key-0123456789',
      submissionReconcileIntervalMs: null,
    });
    const global = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'global-secret' });
    const workerClient = createJobHarnessRestClient({ baseUrl: running.apiUrl, authToken: 'worker-secret' });
    const bridgeUrl = `${running.url}/internal/browser-bridge/v1`;
    const agentId = 'windows-chrome-review';
    const pairing = await fetch(`${bridgeUrl}/pairings`, { method: 'POST', headers: { authorization: 'Bearer global-secret' } });
    expect(pairing.status).toBe(201);
    const pairingBody = await pairing.json() as { code: string };
    const paired = await fetch(`${bridgeUrl}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      pairingCode: pairingBody.code,
      agentId, name: 'Windows Chrome', version: '0.1.0', browserName: 'Chrome', platform: 'Windows',
      capabilities: { humanControl: true, persistentSession: true, resumeUpload: false, screenshots: false, driverCommands: BROWSER_EXTENSION_DRIVER_COMMANDS.filter((type) => type !== 'upload' && type !== 'screenshot') },
    }) });
    expect(paired.status).toBe(201);
    const pairedBody = await paired.json() as { agentToken: string };
    const extensionHeaders = { authorization: `Bearer ${pairedBody.agentToken}`, 'content-type': 'application/json' };

    const inserted = await global.jobs.upsertJobsBatch({ jobs: [{
      companyName: 'Extension Fixture Co', title: 'Frontend Engineer', city: '杭州', observedAt: '2026-09-17T13:40:00.000Z',
      listings: [{ sourceKind: 'official', url: 'https://jobs.example.test/apply', identityKind: 'url', status: 'active' }],
    }] });
    const jobId = inserted.items[0]!.jobId!;
    const job = await global.workspace.getJobDetail(jobId);
    const listingId = job!.job.listings[0]!.id;
    const intent = await global.submissionIntents.prepare({
      jobId, listingId, resumeRevisionId: revisionId, executor: 'other', externalTargetUrl: 'https://jobs.example.test/apply', idempotencyKey: 'extension-review-intent-1',
    });

    const descriptor: ExecutorDescriptor = {
      executorId: 'extension-review-worker', name: 'Extension Review Worker', version: '0.2.0', hostLabel: 'test', status: 'ready',
      browserBackends: ['extension'], adapterIds: ['generic-ats'], executionModes: ['fill_only'],
      capabilities: { resumeUpload: false, humanControl: true, persistentSession: true, screenshots: false, semanticMapping: false }, maxConcurrency: 1,
      metadata: { userBrowser: true, externalSubmit: false },
    };
    await workerClient.apply.executors.register(descriptor);
    const attempt = await global.apply.attempts.dispatch({
      intentId: intent.id, executionMode: 'fill_only', requiredAdapterId: 'generic-ats', preferredBrowserBackend: 'extension',
      requiredCapabilities: ['humanControl', 'persistentSession'], policySnapshot: { allowFormFill: true, submitAllowed: false }, idempotencyKey: 'extension-review-attempt-1',
    });

    let stop = false;
    let currentUrl = 'https://jobs.example.test/apply';
    const values = new Map<string, string>();
    const controls = [
      { controlRef: '#name', kind: 'text', label: '姓名', name: 'name', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['name'], accept: null, multiple: false, sectionLabel: '基本信息' },
      { controlRef: '#email', kind: 'email', label: '邮箱', name: 'email', description: null, required: true, disabled: false, readOnly: false, options: [], semanticHints: ['email'], accept: null, multiple: false, sectionLabel: '基本信息' },
    ];
    const agentLoop = (async () => {
      while (!stop) {
        const response = await fetch(`${bridgeUrl}/agents/${agentId}/poll`, { method: 'POST', headers: extensionHeaders, body: JSON.stringify({ waitMs: 100 }) });
        if (!response.ok) throw new Error(`poll HTTP ${response.status}`);
        const { command } = await response.json() as { command: null | { commandId: string; command: { type: string; payload: Record<string, unknown> } } };
        if (!command) continue;
        let result: unknown = null;
        switch (command.command.type) {
          case 'session_acquire': result = { sessionRef: 'chrome-tab:42', currentUrl }; break;
          case 'navigate': currentUrl = String(command.command.payload.url); break;
          case 'current_url': result = currentUrl; break;
          case 'title': result = 'Frontend Engineer Application'; break;
          case 'body_text': result = 'Frontend Engineer Application 姓名 邮箱'; break;
          case 'scan_controls': result = controls; break;
          case 'scan_actions': result = []; break;
          case 'fill': values.set(String(command.command.payload.selector), String(command.command.payload.value)); break;
          case 'exists': result = true; break;
          case 'text': result = null; break;
          case 'select': case 'set_checked': case 'click': case 'wait': result = null; break;
          case 'form_state_hash': {
            const text = [...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('|');
            const { createHash } = await import('node:crypto');
            result = createHash('sha256').update(text).digest('hex');
            break;
          }
          default: throw new Error(`unexpected command ${command.command.type}`);
        }
        const completed = await fetch(`${bridgeUrl}/agents/${agentId}/results`, { method: 'POST', headers: extensionHeaders, body: JSON.stringify({ commandId: command.commandId, ok: true, result }) });
        if (completed.status !== 204) throw new Error(`result HTTP ${completed.status}`);
      }
    })();

    try {
      const backend = new ExtensionBrowserBackend({ bridgeUrl, executorAuthToken: 'worker-secret', agentId, backendId: 'extension', commandTimeoutMs: 5_000 });
      const worker = new ApplyWorker({
        client: workerClient.apply,
        backends: new BrowserBackendRegistry([backend]),
        descriptor,
        backendId: 'extension',
        adapterId: 'generic-ats',
        formFillEngine: new FormFillExecutionEngine({ siteAdapters: new ApplySiteAdapterRegistry([new GenericAtsSiteAdapter()]) }),
        humanReviewHandoffSeconds: 600,
        attemptHeartbeatIntervalMs: 60_000,
        logger: { log() {}, warn() {}, error() {} },
      });
      expect(await worker.runOnce()).toEqual({ claimed: true, attemptId: attempt.id, outcome: 'waiting' });
      expect(values.get('#name')).toBe('Extension User');
      expect(values.get('#email')).toBe('extension@example.test');
      const detail = await global.apply.attempts.get(attempt.id);
      expect(detail?.attempt).toMatchObject({ state: 'waiting_for_user', checkpoint: 'review-ready', externalEffectState: 'not_crossed', browserSessionHandoff: { backendId: 'extension', sessionRef: 'chrome-tab:42' } });
      const reviews = await global.apply.attempts.listReviewSnapshots(attempt.id, 10);
      expect(reviews.items).toHaveLength(1);
      expect(reviews.items[0]).toMatchObject({ siteAdapterId: 'generic-ats', summary: { filled: 2, requiredPending: 0, readyForSubmit: false } });
      expect((await global.submissionIntents.get(intent.id))?.status).toBe('planned');
      expect((await global.workspace.listApplicationBoard({ limit: 20, offset: 0 })).total).toBe(0);

      const extensionCannotReadCareer = await fetch(`${running.apiUrl}/jobs?limit=1&offset=0`, { headers: { authorization: `Bearer ${pairedBody.agentToken}` } });
      expect(extensionCannotReadCareer.status).toBe(401);
      const extensionCannotAuthorize = await fetch(`${running.apiUrl}/execution-attempts/${attempt.id}/submit-authorizations`, { method: 'POST', headers: extensionHeaders, body: '{}' });
      expect(extensionCannotAuthorize.status).toBe(401);
    } finally {
      stop = true;
      await agentLoop;
    }
  });
});
