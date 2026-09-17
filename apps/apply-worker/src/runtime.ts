import { createHash } from 'node:crypto';
import type {
  ApplicantFieldCatalog,
  ApplicantFieldKey,
  ClaimExecutionAttemptOutput,
  ResolvedApplicantValues,
  ExecutionAttempt,
  ExecutorDescriptor,
  ResumeArtifactGrantOutput,
} from '@job-harness/apply-contracts';
import type { BrowserBackendRegistry, BrowserSessionPort } from '@job-harness/apply-browser';
import type { ApplicantDataProviderPort } from '@job-harness/apply-adapters';
import type { FormFillExecutionEngine } from './form-fill-engine';
import type { SubmitExecutionEngine } from './submit-engine';

export interface ApplyWorkerClientPort {
  readonly executors: {
    register(input: ExecutorDescriptor): Promise<unknown>;
    heartbeat(input: { executorId: string; status: ExecutorDescriptor['status']; metadata?: Record<string, unknown> }): Promise<unknown>;
  };
  readonly attempts: {
    claim(input: { executorId: string; leaseSeconds: number }): Promise<ClaimExecutionAttemptOutput>;
    start(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      adapterId: string;
      adapterVersion: string;
      browserBackend: string;
      checkpoint?: string | null;
    }): Promise<ExecutionAttempt>;
    heartbeat(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      leaseSeconds: number;
      checkpoint?: string | null;
    }): Promise<ExecutionAttempt>;
    resumeArtifact?(input: { attemptId: string; executorId: string; leaseToken: string }): Promise<ResumeArtifactGrantOutput>;
    applicantCatalog?(input: { attemptId: string; executorId: string; leaseToken: string }): Promise<ApplicantFieldCatalog>;
    resolveApplicantData?(input: { attemptId: string; executorId: string; leaseToken: string; keys: readonly ApplicantFieldKey[] }): Promise<ResolvedApplicantValues>;
    createReviewSnapshot(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      formStateHash: string;
      formVersion: string;
      catalogVersion: string;
      siteAdapterId: string;
      siteAdapterVersion: string;
      browserSessionRef?: string | null;
      summary: {
        fieldCount: number;
        bindingCount: number;
        filled: number;
        failed: number;
        manual: number;
        requiredPending: number;
        prohibitedCount: number;
        blockingIssueCodes: string[];
        readyForSubmit: boolean;
      };
    }): Promise<{ id: string; reviewHash: string }>;
    beginSubmit(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      authorizationId: string;
      formStateHash: string;
      occurredAt: string;
    }): Promise<{ attemptId: string; state: string; externalEffectState: 'not_crossed' | 'crossed' | 'uncertain' }>;
    reportSubmitSuccess(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      confirmedAt: string;
      appliedAt: string;
      externalReference?: string | null;
      externalEvidence?: Record<string, unknown>;
    }): Promise<ExecutionAttempt>;
    reportSubmitFailure(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      occurredAt: string;
      outcome: 'external_failed' | 'uncertain';
      error: string;
      externalEvidence?: Record<string, unknown>;
    }): Promise<ExecutionAttempt>;
    waiting(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      checkpoint?: string | null;
      reasonCode: string;
      summary: string;
      payload?: Record<string, unknown>;
      browserSessionHandoff?: ExecutionAttempt['browserSessionHandoff'];
    }): Promise<ExecutionAttempt>;
    complete(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      checkpoint?: string | null;
      payload?: Record<string, unknown>;
    }): Promise<ExecutionAttempt>;
    fail(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      checkpoint?: string | null;
      errorCode: string;
      errorSummary: string;
      externalEffectState: 'not_crossed' | 'crossed' | 'uncertain';
      payload?: Record<string, unknown>;
    }): Promise<ExecutionAttempt>;
  };
}

export interface ApplyWorkerOptions {
  readonly client: ApplyWorkerClientPort;
  readonly backends: BrowserBackendRegistry;
  readonly descriptor: ExecutorDescriptor;
  readonly backendId: string;
  readonly adapterId?: string;
  readonly adapterVersion?: string;
  readonly pollIntervalMs?: number;
  readonly executorHeartbeatIntervalMs?: number;
  readonly attemptHeartbeatIntervalMs?: number;
  readonly leaseSeconds?: number;
  readonly logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  readonly formFillEngine?: FormFillExecutionEngine | null;
  readonly submitEngine?: SubmitExecutionEngine | null;
  readonly humanReviewHandoffSeconds?: number;
}

export interface ApplyWorkerRunResult {
  readonly claimed: boolean;
  readonly attemptId: string | null;
  readonly outcome: 'idle' | 'completed' | 'waiting' | 'failed';
}

export class ApplyWorker {
  private readonly client: ApplyWorkerClientPort;
  private readonly backends: BrowserBackendRegistry;
  private readonly descriptor: ExecutorDescriptor;
  private readonly backendId: string;
  private readonly adapterId: string;
  private readonly adapterVersion: string;
  private readonly pollIntervalMs: number;
  private readonly executorHeartbeatIntervalMs: number;
  private readonly attemptHeartbeatIntervalMs: number;
  private readonly leaseSeconds: number;
  private readonly logger: Pick<Console, 'log' | 'warn' | 'error'>;
  private readonly formFillEngine: FormFillExecutionEngine | null;
  private readonly submitEngine: SubmitExecutionEngine | null;
  private readonly humanReviewHandoffSeconds: number;
  private running = false;
  private stopRequested = false;
  private executorHeartbeatTimer: NodeJS.Timeout | null = null;

  constructor(options: ApplyWorkerOptions) {
    this.client = options.client;
    this.backends = options.backends;
    this.descriptor = options.descriptor;
    this.backendId = options.backendId;
    this.adapterId = options.adapterId ?? options.descriptor.adapterIds[0] ?? 'readiness-v1';
    this.adapterVersion = options.adapterVersion ?? '1.0.0';
    this.pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 3_000);
    this.executorHeartbeatIntervalMs = Math.max(1_000, options.executorHeartbeatIntervalMs ?? 20_000);
    this.attemptHeartbeatIntervalMs = Math.max(1_000, options.attemptHeartbeatIntervalMs ?? 20_000);
    this.leaseSeconds = Math.max(30, Math.min(300, options.leaseSeconds ?? 90));
    this.logger = options.logger ?? console;
    this.formFillEngine = options.formFillEngine ?? null;
    this.submitEngine = options.submitEngine ?? null;
    this.humanReviewHandoffSeconds = Math.max(60, Math.min(3600, options.humanReviewHandoffSeconds ?? 1200));
    if (!this.backends.has(this.backendId)) throw new Error(`Configured browser backend '${this.backendId}' is not registered`);
    if (!this.descriptor.browserBackends.includes(this.backendId)) throw new Error(`Executor descriptor does not advertise browser backend '${this.backendId}'`);
    if (!this.descriptor.adapterIds.includes(this.adapterId)) throw new Error(`Executor descriptor does not advertise adapter '${this.adapterId}'`);
    if (this.adapterId === 'readiness-v1' && !this.descriptor.executionModes.includes('fill_only')) throw new Error('Readiness worker requires fill_only capability');
    if (this.formFillEngine && !this.descriptor.executionModes.some((mode) => mode === 'fill_only' || mode === 'review_then_submit')) throw new Error('Form-fill worker requires fill_only or review_then_submit capability');
    if (this.submitEngine && !this.descriptor.executionModes.includes('review_then_submit')) throw new Error('Submit worker requires review_then_submit capability');
  }

  async register(): Promise<void> {
    const status = await this.backendStatus();
    await this.client.executors.register({ ...this.descriptor, status });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;
    await this.registerWithRetry();
    if (this.stopRequested) { this.running = false; return; }
    this.executorHeartbeatTimer = setInterval(() => {
      void this.heartbeatBackendStatus().catch((error) => this.logger.warn('Apply worker executor heartbeat failed', sanitizeError(error)));
    }, this.executorHeartbeatIntervalMs);
    this.executorHeartbeatTimer.unref();
    let transientBackoffMs = 1_000;
    try {
      while (!this.stopRequested) {
        try {
          await this.runOnce();
          transientBackoffMs = 1_000;
          if (!this.stopRequested) await sleep(this.pollIntervalMs);
        } catch (error) {
          this.logger.warn('Apply worker control-plane cycle failed; retrying without exiting', sanitizeError(error));
          if (!this.stopRequested) await sleep(transientBackoffMs);
          transientBackoffMs = Math.min(15_000, transientBackoffMs * 2);
        }
      }
    } finally {
      if (this.executorHeartbeatTimer) clearInterval(this.executorHeartbeatTimer);
      this.executorHeartbeatTimer = null;
      this.running = false;
    }
  }

  stop(): void { this.stopRequested = true; }

  private async registerWithRetry(): Promise<void> {
    let backoffMs = 1_000;
    while (!this.stopRequested) {
      try {
        await this.register();
        return;
      } catch (error) {
        this.logger.warn('Apply worker registration failed; retrying without process restart', sanitizeError(error));
        await sleep(backoffMs);
        backoffMs = Math.min(15_000, backoffMs * 2);
      }
    }
  }

  async runOnce(): Promise<ApplyWorkerRunResult> {
    await this.backends.reapExpired().catch((error) => this.logger.warn('Apply worker browser handoff reap failed', sanitizeError(error)));
    const backendStatus = await this.backendStatus();
    await this.heartbeatExecutor(backendStatus);
    if (backendStatus !== 'ready') return { claimed: false, attemptId: null, outcome: 'idle' };
    const claim = await this.client.attempts.claim({ executorId: this.descriptor.executorId, leaseSeconds: this.leaseSeconds });
    if (!claim) return { claimed: false, attemptId: null, outcome: 'idle' };
    await this.heartbeatExecutor('busy');
    try {
      return await this.executeClaim(claim);
    } finally {
      await this.heartbeatBackendStatus().catch((error) => this.logger.warn('Apply worker ready heartbeat failed', sanitizeError(error)));
    }
  }

  private async executeClaim(claim: NonNullable<ClaimExecutionAttemptOutput>): Promise<ApplyWorkerRunResult> {
    const { attempt, leaseToken } = claim;
    const attemptId = attempt.id;
    if (attempt.requiredAdapterId !== 'readiness-v1') {
      if (attempt.submitAuthorizationId && this.submitEngine && attempt.executionMode === 'review_then_submit') {
        return this.executeAuthorizedSubmitClaim(claim);
      }
      if (this.formFillEngine && (attempt.executionMode === 'fill_only' || attempt.executionMode === 'review_then_submit')) {
        if (attempt.policySnapshot.allowFormFill !== true) {
          await this.client.attempts.waiting({
            attemptId,
            executorId: this.descriptor.executorId,
            leaseToken,
            checkpoint: 'policy-gate',
            reasonCode: 'form_fill_not_authorized',
            summary: 'Form filling requires the frozen policy allowFormFill=true.',
            payload: { requiredPolicy: 'allowFormFill=true' },
          });
          return { claimed: true, attemptId, outcome: 'waiting' };
        }
        return this.executeFormFillClaim(claim);
      }
      await this.client.attempts.waiting({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        checkpoint: 'adapter-gate',
        reasonCode: 'unsupported_worker_adapter',
        summary: `Worker has no enabled execution engine for adapter '${attempt.requiredAdapterId ?? 'auto'}'.`,
        payload: { requiredAdapterId: attempt.requiredAdapterId },
      });
      return { claimed: true, attemptId, outcome: 'waiting' };
    }
    if (attempt.executionMode !== 'fill_only' || attempt.policySnapshot.readinessOnly !== true) {
      await this.client.attempts.waiting({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        checkpoint: 'policy-gate',
        reasonCode: 'readiness_only_worker',
        summary: 'This worker is currently enabled only for non-destructive readiness checks.',
        payload: { requiredPolicy: 'readinessOnly=true' },
      });
      return { claimed: true, attemptId, outcome: 'waiting' };
    }

    const targetUrl = attempt.bundle.listingUrl;
    if (!targetUrl) {
      await this.failPreSubmit(attempt, leaseToken, 'missing_target_url', 'Frozen ApplyBundle has no listing URL');
      return { claimed: true, attemptId, outcome: 'failed' };
    }

    const backend = this.backends.get(this.backendId);
    const health = await backend.health();
    if (!health.ok) {
      await this.failPreSubmit(attempt, leaseToken, 'browser_backend_unavailable', health.detail ?? 'Browser backend is unavailable');
      return { claimed: true, attemptId, outcome: 'failed' };
    }

    let session: BrowserSessionPort | null = null;
    let attemptHeartbeat: NodeJS.Timeout | null = null;
    let heartbeatError: unknown = null;
    try {
      await this.client.attempts.start({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        adapterId: this.adapterId,
        adapterVersion: this.adapterVersion,
        browserBackend: this.backendId,
        checkpoint: 'browser-acquire',
      });
      attemptHeartbeat = setInterval(() => {
        void this.client.attempts.heartbeat({
          attemptId,
          executorId: this.descriptor.executorId,
          leaseToken,
          leaseSeconds: this.leaseSeconds,
          checkpoint: 'readiness-check',
        }).catch((error) => { heartbeatError = error; });
      }, this.attemptHeartbeatIntervalMs);
      attemptHeartbeat.unref();

      if (attempt.browserSessionHandoff) {
        if (attempt.browserSessionHandoff.backendId !== this.backendId) {
          throw new Error(`Attempt handoff requires backend '${attempt.browserSessionHandoff.backendId}', worker is '${this.backendId}'`);
        }
        session = await backend.resume(attempt.browserSessionHandoff, { executionScope: { attemptId, executorId: this.descriptor.executorId, leaseToken } });
      } else {
        session = await backend.acquire({ preferredUrl: targetUrl, reuseLiveSession: false, executionScope: { attemptId, executorId: this.descriptor.executorId, leaseToken } });
      }
      const driver = session.driver();
      if (!attempt.browserSessionHandoff) await driver.navigate(targetUrl);
      if (heartbeatError) throw heartbeatError;
      const title = sanitizeText(await driver.title(), 240);
      const body = await driver.bodyText(50_000);
      const currentUrl = driver.currentUrl();
      const current = new URL(currentUrl);
      const target = new URL(targetUrl);
      await session.persist();
      await this.client.attempts.complete({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        checkpoint: 'readiness-complete',
        payload: {
          readinessOnly: true,
          browserBackend: this.backendId,
          browserSessionId: session.sessionId,
          targetHost: target.hostname,
          observedHost: current.hostname,
          observedPath: current.pathname.slice(0, 500),
          title,
          bodyTextLength: body.length,
        },
      });
      return { claimed: true, attemptId, outcome: 'completed' };
    } catch (error) {
      this.logger.error('Apply worker readiness attempt failed', sanitizeError(error));
      try {
        await this.failPreSubmit(attempt, leaseToken, 'readiness_failed', sanitizeError(error));
      } catch (reportError) {
        this.logger.error('Apply worker could not report readiness failure', sanitizeError(reportError));
      }
      return { claimed: true, attemptId, outcome: 'failed' };
    } finally {
      if (attemptHeartbeat) clearInterval(attemptHeartbeat);
      if (session) await session.release().catch((error) => this.logger.warn('Browser session release failed', sanitizeError(error)));
    }
  }

  private async executeAuthorizedSubmitClaim(claim: NonNullable<ClaimExecutionAttemptOutput>): Promise<ApplyWorkerRunResult> {
    const { attempt, leaseToken } = claim;
    const attemptId = attempt.id;
    const targetUrl = attempt.bundle.listingUrl;
    if (!targetUrl || !attempt.submitAuthorizationId || !attempt.browserSessionHandoff) {
      await this.failPreSubmit(attempt, leaseToken, 'submit_context_missing', 'Authorized submit requires listing URL, authorization id, and retained browser handoff');
      return { claimed: true, attemptId, outcome: 'failed' };
    }
    const backend = this.backends.get(this.backendId);
    let session: BrowserSessionPort | null = null;
    let boundaryCrossed = false;
    try {
      await this.client.attempts.start({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        adapterId: attempt.adapterId ?? attempt.requiredAdapterId ?? 'formal-application',
        adapterVersion: attempt.adapterVersion ?? '1.0.0',
        browserBackend: this.backendId,
        checkpoint: 'submit-review-verify',
      });
      session = await backend.resume(attempt.browserSessionHandoff, { executionScope: { attemptId, executorId: this.descriptor.executorId, leaseToken } });
      const driver = session.driver();
      const currentFormStateHash = await driver.formStateHash();
      // This call is the single permission gate. The server first validates the
      // exact user-reviewed hash, moves SubmissionIntent to external_in_progress,
      // consumes the short-lived authorization, and only then returns permission
      // to perform one site submit action.
      const boundary = await this.client.attempts.beginSubmit({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        authorizationId: attempt.submitAuthorizationId,
        formStateHash: currentFormStateHash,
        occurredAt: new Date().toISOString(),
      });
      if (boundary.externalEffectState !== 'crossed') {
        throw new Error(`Submit boundary returned unexpected state '${boundary.externalEffectState}'`);
      }
      boundaryCrossed = true;
      const result = await this.submitEngine!.execute({ attempt, browser: driver });
      if (result.outcome === 'success') {
        await this.client.attempts.reportSubmitSuccess({
          attemptId,
          executorId: this.descriptor.executorId,
          leaseToken,
          confirmedAt: result.confirmedAt,
          appliedAt: result.appliedAt,
          ...(result.externalReference !== null ? { externalReference: result.externalReference } : {}),
          externalEvidence: { ...result.evidence },
        });
        return { claimed: true, attemptId, outcome: 'completed' };
      }
      await this.client.attempts.reportSubmitFailure({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        occurredAt: result.confirmedAt,
        outcome: result.outcome,
        error: result.error ?? (result.outcome === 'uncertain' ? 'Submit result is uncertain' : 'External site rejected the submit'),
        externalEvidence: { ...result.evidence },
      });
      return { claimed: true, attemptId, outcome: 'failed' };
    } catch (error) {
      this.logger.error('Apply worker authorized submit failed', sanitizeError(error));
      if (!boundaryCrossed) {
        // Do not convert a failed/lost begin-submit response into another site
        // action. If the server crossed the boundary but the response was lost,
        // the lease will expire into manual review instead of a duplicate click.
        return { claimed: true, attemptId, outcome: 'failed' };
      }
      try {
        await this.client.attempts.reportSubmitFailure({
          attemptId,
          executorId: this.descriptor.executorId,
          leaseToken,
          occurredAt: new Date().toISOString(),
          outcome: 'uncertain',
          error: sanitizeError(error),
          externalEvidence: { phase: 'post-boundary-exception' },
        });
      } catch (reportError) {
        this.logger.error('Apply worker could not report uncertain submit result', sanitizeError(reportError));
      }
      return { claimed: true, attemptId, outcome: 'failed' };
    } finally {
      if (session) await session.release().catch((error) => this.logger.warn('Browser session release failed', sanitizeError(error)));
    }
  }

  private async executeFormFillClaim(claim: NonNullable<ClaimExecutionAttemptOutput>): Promise<ApplyWorkerRunResult> {
    const { attempt, leaseToken } = claim;
    const attemptId = attempt.id;
    const targetUrl = attempt.bundle.listingUrl;
    if (!targetUrl) {
      await this.failPreSubmit(attempt, leaseToken, 'missing_target_url', 'Frozen ApplyBundle has no listing URL');
      return { claimed: true, attemptId, outcome: 'failed' };
    }
    const backend = this.backends.get(this.backendId);
    const health = await backend.health();
    if (!health.ok) {
      await this.failPreSubmit(attempt, leaseToken, 'browser_backend_unavailable', health.detail ?? 'Browser backend is unavailable');
      return { claimed: true, attemptId, outcome: 'failed' };
    }
    let session: BrowserSessionPort | null = null;
    let attemptHeartbeat: NodeJS.Timeout | null = null;
    let heartbeatError: unknown = null;
    try {
      const adapter = this.formFillEngine!.resolveAdapterDescriptor(attempt);
      await this.client.attempts.start({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        adapterId: adapter.id,
        adapterVersion: adapter.version,
        browserBackend: this.backendId,
        checkpoint: 'form-inspection',
      });
      attemptHeartbeat = setInterval(() => {
        void this.client.attempts.heartbeat({
          attemptId,
          executorId: this.descriptor.executorId,
          leaseToken,
          leaseSeconds: this.leaseSeconds,
          checkpoint: 'form-fill',
        }).catch((error) => { heartbeatError = error; });
      }, this.attemptHeartbeatIntervalMs);
      attemptHeartbeat.unref();

      if (attempt.browserSessionHandoff) {
        if (attempt.browserSessionHandoff.backendId !== this.backendId) throw new Error(`Attempt handoff requires backend '${attempt.browserSessionHandoff.backendId}', worker is '${this.backendId}'`);
        session = await backend.resume(attempt.browserSessionHandoff, { executionScope: { attemptId, executorId: this.descriptor.executorId, leaseToken } });
      } else {
        session = await backend.acquire({ preferredUrl: targetUrl, reuseLiveSession: false, executionScope: { attemptId, executorId: this.descriptor.executorId, leaseToken } });
      }
      const driver = session.driver();
      if (!attempt.browserSessionHandoff) await driver.navigate(targetUrl);
      if (heartbeatError) throw heartbeatError;
      const resumeFile = await this.loadResumeArtifact(attempt, leaseToken);
      const applicant = this.createLeaseScopedApplicantProvider(attempt, leaseToken);
      const result = await this.formFillEngine!.execute({ attempt, browser: driver, observedAt: new Date().toISOString(), resumeFile, applicant });
      const expiresAt = new Date(Date.now() + this.humanReviewHandoffSeconds * 1000).toISOString();
      const handoff = await session.retainForHuman({ expiresAt });
      if (result.outcome === 'handoff_required') {
        await this.client.attempts.waiting({
          attemptId,
          executorId: this.descriptor.executorId,
          leaseToken,
          checkpoint: `human-entry:${String(result.payload.pageState ?? 'unknown')}`.slice(0, 200),
          reasonCode: result.reasonCode,
          summary: result.summary,
          payload: result.payload,
          browserSessionHandoff: handoff,
        });
        return { claimed: true, attemptId, outcome: 'waiting' };
      }
      const snapshot = await this.client.attempts.createReviewSnapshot({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        formStateHash: result.review.formStateHash,
        formVersion: result.review.formVersion,
        catalogVersion: result.review.catalogVersion,
        siteAdapterId: result.review.siteAdapterId,
        siteAdapterVersion: result.review.siteAdapterVersion,
        browserSessionRef: handoff.sessionRef,
        summary: { ...result.review.summary, blockingIssueCodes: [...result.review.summary.blockingIssueCodes] },
      });
      await this.client.attempts.waiting({
        attemptId,
        executorId: this.descriptor.executorId,
        leaseToken,
        checkpoint: result.outcome === 'review_ready' ? 'review-ready' : 'manual-review',
        reasonCode: result.reasonCode,
        summary: result.summary,
        payload: { ...result.payload, reviewSnapshotId: snapshot.id, reviewHash: snapshot.reviewHash },
        browserSessionHandoff: handoff,
      });
      return { claimed: true, attemptId, outcome: 'waiting' };
    } catch (error) {
      this.logger.error('Apply worker form-fill attempt failed', sanitizeError(error));
      try { await this.failPreSubmit(attempt, leaseToken, 'form_fill_failed', sanitizeError(error)); }
      catch (reportError) { this.logger.error('Apply worker could not report form-fill failure', sanitizeError(reportError)); }
      return { claimed: true, attemptId, outcome: 'failed' };
    } finally {
      if (attemptHeartbeat) clearInterval(attemptHeartbeat);
      if (session) await session.release().catch((error) => this.logger.warn('Browser session release failed', sanitizeError(error)));
    }
  }

  private createLeaseScopedApplicantProvider(attempt: ExecutionAttempt, leaseToken: string): ApplicantDataProviderPort | null {
    const catalog = this.client.attempts.applicantCatalog;
    const resolve = this.client.attempts.resolveApplicantData;
    if (!catalog || !resolve) return null;
    const common = { attemptId: attempt.id, executorId: this.descriptor.executorId, leaseToken };
    return {
      catalog: () => catalog(common),
      resolve: (keys) => resolve({ ...common, keys }),
    };
  }

  private async loadResumeArtifact(attempt: ExecutionAttempt, leaseToken: string) {
    if (!attempt.bundle.resumeArtifact) return null;
    if (!this.client.attempts.resumeArtifact) throw new Error('Worker client cannot fetch the frozen Resume Artifact');
    const grant = await this.client.attempts.resumeArtifact({
      attemptId: attempt.id,
      executorId: this.descriptor.executorId,
      leaseToken,
    });
    const bytes = new Uint8Array(Buffer.from(grant.bytesBase64, 'base64'));
    if (bytes.byteLength !== grant.byteSize) throw new Error('Resume Artifact byte-size mismatch');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== grant.sha256.toLowerCase()) throw new Error('Resume Artifact SHA-256 mismatch');
    if (grant.mimeType !== 'application/pdf') throw new Error(`Resume Artifact must be application/pdf, got '${grant.mimeType}'`);
    if (grant.artifactId !== attempt.bundle.resumeArtifact.id || grant.revisionId !== attempt.bundle.resumeArtifact.revisionId) {
      throw new Error('Resume Artifact grant no longer matches the frozen ApplyBundle');
    }
    return { name: grant.fileName, mimeType: grant.mimeType, bytes, sha256 };
  }

  private async failPreSubmit(attempt: ExecutionAttempt, leaseToken: string, errorCode: string, errorSummary: string): Promise<void> {
    await this.client.attempts.fail({
      attemptId: attempt.id,
      executorId: this.descriptor.executorId,
      leaseToken,
      checkpoint: attempt.checkpoint ?? 'pre-submit',
      errorCode,
      errorSummary: sanitizeText(errorSummary, 900),
      externalEffectState: 'not_crossed',
      payload: { readinessOnly: true },
    });
  }

  private async backendStatus(): Promise<ExecutorDescriptor['status']> {
    try {
      const health = await this.backends.get(this.backendId).health();
      return health.ok ? 'ready' : 'degraded';
    } catch {
      return 'degraded';
    }
  }

  private async heartbeatBackendStatus(): Promise<void> {
    await this.heartbeatExecutor(await this.backendStatus());
  }

  private heartbeatExecutor(status: ExecutorDescriptor['status']): Promise<unknown> {
    return this.client.executors.heartbeat({
      executorId: this.descriptor.executorId,
      status,
      metadata: { ...this.descriptor.metadata, browserBackend: this.backendId, adapter: this.adapterId, adapterIds: [...this.descriptor.adapterIds], executionModes: [...this.descriptor.executionModes] },
    });
  }
}

function sanitizeError(error: unknown): string {
  return sanitizeText(error instanceof Error ? error.message : String(error), 900);
}
function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, maxLength);
}
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
