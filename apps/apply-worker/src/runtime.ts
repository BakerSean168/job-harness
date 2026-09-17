import type {
  ClaimExecutionAttemptOutput,
  ExecutionAttempt,
  ExecutorDescriptor,
} from '@job-harness/apply-contracts';
import type { BrowserBackendRegistry, BrowserSessionPort } from '@job-harness/apply-browser';

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
    waiting(input: {
      attemptId: string;
      executorId: string;
      leaseToken: string;
      checkpoint?: string | null;
      reasonCode: string;
      summary: string;
      payload?: Record<string, unknown>;
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
  private running = false;
  private stopRequested = false;
  private executorHeartbeatTimer: NodeJS.Timeout | null = null;

  constructor(options: ApplyWorkerOptions) {
    this.client = options.client;
    this.backends = options.backends;
    this.descriptor = options.descriptor;
    this.backendId = options.backendId;
    this.adapterId = options.adapterId ?? 'readiness-v1';
    this.adapterVersion = options.adapterVersion ?? '1.0.0';
    this.pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 3_000);
    this.executorHeartbeatIntervalMs = Math.max(1_000, options.executorHeartbeatIntervalMs ?? 20_000);
    this.attemptHeartbeatIntervalMs = Math.max(1_000, options.attemptHeartbeatIntervalMs ?? 20_000);
    this.leaseSeconds = Math.max(30, Math.min(300, options.leaseSeconds ?? 90));
    this.logger = options.logger ?? console;
    if (!this.backends.has(this.backendId)) throw new Error(`Configured browser backend '${this.backendId}' is not registered`);
    if (!this.descriptor.browserBackends.includes(this.backendId)) throw new Error(`Executor descriptor does not advertise browser backend '${this.backendId}'`);
    if (!this.descriptor.adapterIds.includes(this.adapterId)) throw new Error(`Executor descriptor does not advertise adapter '${this.adapterId}'`);
    if (!this.descriptor.executionModes.includes('fill_only')) throw new Error('Readiness worker requires fill_only capability');
  }

  async register(): Promise<void> {
    await this.client.executors.register(this.descriptor);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;
    await this.register();
    this.executorHeartbeatTimer = setInterval(() => {
      void this.heartbeatExecutor('ready').catch((error) => this.logger.warn('Apply worker executor heartbeat failed', sanitizeError(error)));
    }, this.executorHeartbeatIntervalMs);
    this.executorHeartbeatTimer.unref();
    try {
      while (!this.stopRequested) {
        await this.runOnce();
        if (!this.stopRequested) await sleep(this.pollIntervalMs);
      }
    } finally {
      if (this.executorHeartbeatTimer) clearInterval(this.executorHeartbeatTimer);
      this.executorHeartbeatTimer = null;
      this.running = false;
    }
  }

  stop(): void { this.stopRequested = true; }

  async runOnce(): Promise<ApplyWorkerRunResult> {
    await this.heartbeatExecutor('ready');
    const claim = await this.client.attempts.claim({ executorId: this.descriptor.executorId, leaseSeconds: this.leaseSeconds });
    if (!claim) return { claimed: false, attemptId: null, outcome: 'idle' };
    await this.heartbeatExecutor('busy');
    try {
      return await this.executeClaim(claim);
    } finally {
      await this.heartbeatExecutor('ready').catch((error) => this.logger.warn('Apply worker ready heartbeat failed', sanitizeError(error)));
    }
  }

  private async executeClaim(claim: NonNullable<ClaimExecutionAttemptOutput>): Promise<ApplyWorkerRunResult> {
    const { attempt, leaseToken } = claim;
    const attemptId = attempt.id;
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

      session = await backend.acquire({ preferredUrl: targetUrl, reuseLiveSession: false });
      const driver = session.driver();
      await driver.navigate(targetUrl);
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

  private heartbeatExecutor(status: ExecutorDescriptor['status']): Promise<unknown> {
    return this.client.executors.heartbeat({
      executorId: this.descriptor.executorId,
      status,
      metadata: { browserBackend: this.backendId, adapter: this.adapterId },
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
