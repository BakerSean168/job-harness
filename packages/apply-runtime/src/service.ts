import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  AuthorizeResumeArtifactInputSchema,
  CancelExecutionAttemptInputSchema,
  ClaimExecutionAttemptInputSchema,
  CompleteExecutionAttemptInputSchema,
  DispatchExecutionAttemptInputSchema,
  ExecutionAttemptSchema,
  ExecutorHeartbeatInputSchema,
  ExecutorRegistrationSchema,
  FailExecutionAttemptInputSchema,
  HeartbeatExecutionAttemptInputSchema,
  ListExecutionAttemptsInputSchema,
  ListExecutorsInputSchema,
  MarkExecutionAttemptWaitingInputSchema,
  RegisterExecutorInputSchema,
  ResumeExecutionAttemptInputSchema,
  StartExecutionAttemptInputSchema,
  type ExecutionAttempt,
  type ExecutorRegistration,
} from '@job-harness/apply-contracts';
import {
  canCancelAttempt,
  canRequeueAttempt,
  canTransitionAttempt,
  executorCanRunAttempt,
  stableJson,
} from '@job-harness/apply-core';
import {
  ApplyConflictError,
  ApplyInvalidTransitionError,
  ApplyLeaseLostError,
  ApplyNotFoundError,
  ApplyNotReadyError,
} from './errors';
import type { AppendExecutionEventInput, ApplyBundleFactoryPort, ApplyControlPlanePort, ApplyStorePort, SubmissionIntentSafetyPort } from './ports';

export interface ApplyRuntimeOptions {
  readonly now?: () => string;
  readonly idFactory?: () => string;
  readonly leaseTokenFactory?: () => string;
  readonly executorStaleAfterMs?: number;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

function makeEvent(
  idFactory: () => string,
  attemptId: string,
  type: AppendExecutionEventInput['type'],
  occurredAt: string,
  checkpoint: string | null = null,
  payload: Record<string, unknown> = {},
): AppendExecutionEventInput {
  return { id: idFactory(), attemptId, type, occurredAt, checkpoint, payload };
}

export function createApplyControlPlane(
  store: ApplyStorePort,
  bundleFactory: ApplyBundleFactoryPort,
  intentSafety: SubmissionIntentSafetyPort,
  options: ApplyRuntimeOptions = {},
): ApplyControlPlanePort {
  const now = options.now ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? randomUUID;
  const leaseTokenFactory = options.leaseTokenFactory ?? (() => randomBytes(32).toString('base64url'));
  const executorStaleAfterMs = options.executorStaleAfterMs ?? 60_000;

  function effectiveExecutor(executor: ExecutorRegistration, at: string): ExecutorRegistration {
    if (executor.status === 'offline') return executor;
    if (new Date(at).getTime() - new Date(executor.lastHeartbeatAt).getTime() <= executorStaleAfterMs) return executor;
    return ExecutorRegistrationSchema.parse({ ...executor, status: 'offline' });
  }

  async function requireLease(input: {
    attemptId: string;
    executorId: string;
    leaseToken: string;
    allowedStates: readonly ExecutionAttempt['state'][];
    mutation: Parameters<ApplyStorePort['mutateWithLease']>[0]['mutation'];
    event?: AppendExecutionEventInput;
  }): Promise<ExecutionAttempt> {
    const at = now();
    const updated = await store.mutateWithLease({
      attemptId: input.attemptId,
      executorId: input.executorId,
      leaseTokenHash: sha256(input.leaseToken),
      now: at,
      allowedStates: input.allowedStates,
      mutation: input.mutation,
      ...(input.event ? { event: input.event } : {}),
    });
    if (updated) return updated;
    const current = await store.getAttempt(input.attemptId);
    if (!current) throw new ApplyNotFoundError('ExecutionAttempt', input.attemptId);
    if (!input.allowedStates.includes(current.state)) {
      throw new ApplyInvalidTransitionError(current.state, input.mutation.state ?? current.state);
    }
    throw new ApplyLeaseLostError(input.attemptId);
  }

  return {
    executors: {
      async list(input = {}) {
        const parsed = ListExecutorsInputSchema.parse(input);
        const result = await store.listExecutors(parsed);
        const at = now();
        return { ...result, items: result.items.map((item) => effectiveExecutor(item, at)) };
      },
      async get(executorId) {
        const executor = await store.getExecutor(executorId);
        return executor ? effectiveExecutor(executor, now()) : null;
      },
      async register(raw) {
        const parsed = RegisterExecutorInputSchema.parse(raw);
        const timestamp = now();
        const current = await store.getExecutor(parsed.executorId);
        const registration = ExecutorRegistrationSchema.parse({
          ...parsed,
          lastHeartbeatAt: timestamp,
          createdAt: current?.createdAt ?? timestamp,
          updatedAt: timestamp,
        });
        return store.upsertExecutor(registration);
      },
      async heartbeat(raw) {
        const parsed = ExecutorHeartbeatInputSchema.parse(raw);
        const current = await store.getExecutor(parsed.executorId);
        if (!current) throw new ApplyNotFoundError('ExecutorRegistration', parsed.executorId);
        const timestamp = now();
        return store.upsertExecutor(ExecutorRegistrationSchema.parse({
          ...current,
          status: parsed.status,
          metadata: parsed.metadata ?? current.metadata,
          lastHeartbeatAt: timestamp,
          updatedAt: timestamp,
        }));
      },
    },
    attempts: {
      list(input = {}) {
        return store.listAttempts(ListExecutionAttemptsInputSchema.parse(input));
      },
      async get(attemptId) {
        const attempt = await store.getAttempt(attemptId);
        if (!attempt) return null;
        return { attempt, events: await store.listEvents(attemptId) };
      },
      async dispatch(raw) {
        const parsed = DispatchExecutionAttemptInputSchema.parse(raw);
        const requestHash = sha256(stableJson(parsed));
        const existing = await store.findAttemptByIdempotencyKey(parsed.idempotencyKey);
        if (existing) {
          if (existing.dispatchRequestHash !== requestHash) {
            throw new ApplyConflictError(`Execution dispatch idempotency key '${parsed.idempotencyKey}' was already used with different input`);
          }
          return existing;
        }
        const active = await store.findActiveAttemptByIntent(parsed.intentId);
        if (active) {
          throw new ApplyConflictError(`SubmissionIntent '${parsed.intentId}' already has active ExecutionAttempt '${active.id}'`);
        }
        const timestamp = now();
        const id = idFactory();
        const bundle = await bundleFactory.create({
          intentId: parsed.intentId,
          attemptId: id,
          policySnapshot: parsed.policySnapshot,
          applicantCatalogVersion: parsed.applicantCatalogVersion ?? null,
          answerSetVersion: parsed.answerSetVersion ?? null,
          answerSetHash: parsed.answerSetHash ?? null,
          createdAt: timestamp,
        });
        const bundleHash = sha256(stableJson(bundle));
        const attempt = ExecutionAttemptSchema.parse({
          id,
          intentId: parsed.intentId,
          executorId: null,
          requiredAdapterId: parsed.requiredAdapterId ?? null,
          adapterId: null,
          adapterVersion: null,
          preferredBrowserBackend: parsed.preferredBrowserBackend ?? null,
          browserBackend: null,
          executionMode: parsed.executionMode,
          state: 'queued',
          leaseOwner: null,
          leaseExpiresAt: null,
          lastHeartbeatAt: null,
          checkpoint: null,
          externalEffectState: 'not_crossed',
          requiredCapabilities: parsed.requiredCapabilities,
          policySnapshot: parsed.policySnapshot,
          bundle,
          bundleHash,
          dispatchRequestHash: requestHash,
          reviewHash: null,
          submitAuthorizationId: null,
          errorCode: null,
          errorSummary: null,
          startedAt: null,
          completedAt: null,
          idempotencyKey: parsed.idempotencyKey,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        return store.insertAttempt(attempt, makeEvent(idFactory, id, 'attempt_queued', timestamp, null, {
          executionMode: attempt.executionMode,
          requiredAdapterId: attempt.requiredAdapterId,
          preferredBrowserBackend: attempt.preferredBrowserBackend,
        }));
      },
      async claim(raw) {
        const parsed = ClaimExecutionAttemptInputSchema.parse(raw);
        const timestamp = now();
        const abandoned = await store.abandonExpiredAttempts({ now: timestamp, limit: 100, eventIdFactory: idFactory });
        for (const expired of abandoned) {
          if (expired.externalEffectState !== 'not_crossed') {
            await intentSafety.markManualReview({
              intentId: expired.intentId,
              occurredAt: timestamp,
              error: `Execution attempt ${expired.id} lease expired after the external-effect boundary; verify the recruiting site before any new submit`,
              evidence: { executionAttemptId: expired.id, externalEffectState: expired.externalEffectState, reason: 'lease_expired' },
            });
          }
        }
        const registered = await store.getExecutor(parsed.executorId);
        if (!registered) throw new ApplyNotFoundError('ExecutorRegistration', parsed.executorId);
        const executor = effectiveExecutor(registered, timestamp);
        if (executor.status === 'offline' || executor.status === 'degraded' || executor.status === 'login_required' || executor.status === 'human_action_required') {
          throw new ApplyNotReadyError(`Executor '${executor.executorId}' is '${executor.status}' and cannot claim new work`);
        }
        if (await store.countLeasedAttempts(executor.executorId, timestamp) >= executor.maxConcurrency) return null;
        const queued = await store.listAttempts({ states: ['queued'], limit: 200, offset: 0 });
        for (const candidate of queued.items) {
          if (!executorCanRunAttempt(executor, candidate)) continue;
          const leaseToken = leaseTokenFactory();
          const claimed = await store.tryClaimAttempt({
            attemptId: candidate.id,
            executorId: executor.executorId,
            leaseTokenHash: sha256(leaseToken),
            leaseExpiresAt: addSeconds(timestamp, parsed.leaseSeconds),
            now: timestamp,
            event: makeEvent(idFactory, candidate.id, 'attempt_claimed', timestamp, candidate.checkpoint, {
              executorId: executor.executorId,
              leaseSeconds: parsed.leaseSeconds,
            }),
          });
          if (claimed) return { attempt: claimed, leaseToken };
        }
        return null;
      },
      async heartbeat(raw) {
        const parsed = HeartbeatExecutionAttemptInputSchema.parse(raw);
        const timestamp = now();
        return requireLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseToken: parsed.leaseToken,
          allowedStates: ['claimed', 'running'],
          mutation: {
            leaseExpiresAt: addSeconds(timestamp, parsed.leaseSeconds),
            lastHeartbeatAt: timestamp,
            ...(parsed.checkpoint !== undefined ? { checkpoint: parsed.checkpoint } : {}),
            updatedAt: timestamp,
          },
        });
      },
      async start(raw) {
        const parsed = StartExecutionAttemptInputSchema.parse(raw);
        const timestamp = now();
        const current = await store.getAttempt(parsed.attemptId);
        if (!current) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        if (!canTransitionAttempt(current.state, 'running')) throw new ApplyInvalidTransitionError(current.state, 'running');
        if (current.requiredAdapterId && current.requiredAdapterId !== parsed.adapterId) {
          throw new ApplyConflictError(`Attempt '${current.id}' requires adapter '${current.requiredAdapterId}', not '${parsed.adapterId}'`);
        }
        if (current.preferredBrowserBackend && current.preferredBrowserBackend !== parsed.browserBackend) {
          throw new ApplyConflictError(`Attempt '${current.id}' requires browser backend '${current.preferredBrowserBackend}', not '${parsed.browserBackend}'`);
        }
        return requireLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseToken: parsed.leaseToken,
          allowedStates: ['claimed'],
          mutation: {
            state: 'running',
            adapterId: parsed.adapterId,
            adapterVersion: parsed.adapterVersion,
            browserBackend: parsed.browserBackend,
            checkpoint: parsed.checkpoint ?? current.checkpoint,
            startedAt: current.startedAt ?? timestamp,
            lastHeartbeatAt: timestamp,
            updatedAt: timestamp,
          },
          event: makeEvent(idFactory, parsed.attemptId, 'attempt_started', timestamp, parsed.checkpoint ?? current.checkpoint, {
            adapterId: parsed.adapterId,
            adapterVersion: parsed.adapterVersion,
            browserBackend: parsed.browserBackend,
          }),
        });
      },
      async waiting(raw) {
        const parsed = MarkExecutionAttemptWaitingInputSchema.parse(raw);
        const timestamp = now();
        const current = await store.getAttempt(parsed.attemptId);
        if (!current) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        if (!canTransitionAttempt(current.state, 'waiting_for_user')) throw new ApplyInvalidTransitionError(current.state, 'waiting_for_user');
        return requireLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseToken: parsed.leaseToken,
          allowedStates: ['claimed', 'running'],
          mutation: {
            state: 'waiting_for_user',
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: timestamp,
            checkpoint: parsed.checkpoint ?? current.checkpoint,
            errorCode: parsed.reasonCode,
            errorSummary: parsed.summary,
            updatedAt: timestamp,
          },
          event: makeEvent(idFactory, parsed.attemptId, 'human_action_required', timestamp, parsed.checkpoint ?? current.checkpoint, {
            reasonCode: parsed.reasonCode,
            summary: parsed.summary,
            ...parsed.payload,
          }),
        });
      },
      async resume(raw) {
        const parsed = ResumeExecutionAttemptInputSchema.parse(raw);
        const current = await store.getAttempt(parsed.attemptId);
        if (!current) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        if (!canRequeueAttempt(current)) throw new ApplyInvalidTransitionError(current.state, 'queued');
        const timestamp = now();
        const updated = await store.mutateWithoutLease({
          attemptId: current.id,
          allowedStates: ['waiting_for_user'],
          mutation: {
            state: 'queued',
            executorId: null,
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            errorCode: null,
            errorSummary: null,
            updatedAt: timestamp,
          },
          event: makeEvent(idFactory, current.id, 'attempt_resumed', timestamp, current.checkpoint),
        });
        if (!updated) throw new ApplyConflictError(`ExecutionAttempt '${current.id}' changed while resuming`);
        return updated;
      },
      async complete(raw) {
        const parsed = CompleteExecutionAttemptInputSchema.parse(raw);
        const timestamp = now();
        const current = await store.getAttempt(parsed.attemptId);
        if (!current) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        if (!canTransitionAttempt(current.state, 'completed')) throw new ApplyInvalidTransitionError(current.state, 'completed');
        return requireLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseToken: parsed.leaseToken,
          allowedStates: ['running'],
          mutation: {
            state: 'completed',
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: timestamp,
            checkpoint: parsed.checkpoint ?? current.checkpoint,
            completedAt: timestamp,
            updatedAt: timestamp,
          },
          event: makeEvent(idFactory, current.id, 'attempt_completed', timestamp, parsed.checkpoint ?? current.checkpoint, parsed.payload),
        });
      },
      async fail(raw) {
        const parsed = FailExecutionAttemptInputSchema.parse(raw);
        const timestamp = now();
        const current = await store.getAttempt(parsed.attemptId);
        if (!current) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        if (!canTransitionAttempt(current.state, 'failed')) throw new ApplyInvalidTransitionError(current.state, 'failed');
        if (parsed.externalEffectState !== 'not_crossed') {
          await intentSafety.markManualReview({
            intentId: current.intentId,
            occurredAt: timestamp,
            error: `Execution attempt ${current.id} ended after the external-effect boundary with state '${parsed.externalEffectState}': ${parsed.errorSummary}`,
            evidence: {
              executionAttemptId: current.id,
              externalEffectState: parsed.externalEffectState,
              errorCode: parsed.errorCode,
              checkpoint: parsed.checkpoint ?? current.checkpoint,
              ...parsed.payload,
            },
          });
        }
        return requireLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseToken: parsed.leaseToken,
          allowedStates: ['claimed', 'running'],
          mutation: {
            state: 'failed',
            externalEffectState: parsed.externalEffectState,
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: timestamp,
            checkpoint: parsed.checkpoint ?? current.checkpoint,
            errorCode: parsed.errorCode,
            errorSummary: parsed.errorSummary,
            completedAt: timestamp,
            updatedAt: timestamp,
          },
          event: makeEvent(idFactory, current.id,
            parsed.externalEffectState === 'uncertain' ? 'external_result_uncertain' : 'attempt_failed',
            timestamp,
            parsed.checkpoint ?? current.checkpoint,
            { errorCode: parsed.errorCode, errorSummary: parsed.errorSummary, ...parsed.payload },
          ),
        });
      },
      async cancel(raw) {
        const parsed = CancelExecutionAttemptInputSchema.parse(raw);
        const current = await store.getAttempt(parsed.attemptId);
        if (!current) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        if (!canCancelAttempt(current)) {
          throw new ApplyConflictError(`ExecutionAttempt '${current.id}' cannot be cancelled after the external-effect boundary`);
        }
        if (!canTransitionAttempt(current.state, 'cancelled')) throw new ApplyInvalidTransitionError(current.state, 'cancelled');
        const timestamp = now();
        const updated = await store.mutateWithoutLease({
          attemptId: current.id,
          allowedStates: [current.state],
          mutation: {
            state: 'cancelled',
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            completedAt: timestamp,
            errorCode: parsed.reason ? 'cancelled_by_user' : null,
            errorSummary: parsed.reason ?? null,
            updatedAt: timestamp,
          },
          event: makeEvent(idFactory, current.id, 'attempt_cancelled', timestamp, current.checkpoint, {
            ...(parsed.reason ? { reason: parsed.reason } : {}),
          }),
        });
        if (!updated) throw new ApplyConflictError(`ExecutionAttempt '${current.id}' changed while cancelling`);
        return updated;
      },
      async authorizeResumeArtifact(raw) {
        const parsed = AuthorizeResumeArtifactInputSchema.parse(raw);
        const timestamp = now();
        const attempt = await store.getAttempt(parsed.attemptId);
        if (!attempt) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        const valid = await store.hasValidLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseTokenHash: sha256(parsed.leaseToken),
          now: timestamp,
          allowedStates: ['claimed', 'running'],
        });
        if (!valid) throw new ApplyLeaseLostError(parsed.attemptId);
        const artifact = attempt.bundle.resumeArtifact;
        if (!artifact) throw new ApplyNotReadyError(`ExecutionAttempt '${attempt.id}' has no frozen Resume PDF Artifact`);
        return {
          artifactId: artifact.id,
          revisionId: artifact.revisionId,
          sha256: artifact.sha256,
          byteSize: artifact.byteSize,
          mimeType: artifact.mimeType,
        };
      },
    },
  };
}
