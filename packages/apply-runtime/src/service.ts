import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ApplicantDataGrantInputSchema,
  AuthorizeSubmitInputSchema,
  BeginSubmitInputSchema,
  BeginSubmitOutputSchema,
  CreateReviewSnapshotInputSchema,
  ListReviewSnapshotsInputSchema,
  ListSubmitAuthorizationsInputSchema,
  ReportSubmitFailureInputSchema,
  ReportSubmitSuccessInputSchema,
  ResolveApplicantDataInputSchema,
  RevokeSubmitAuthorizationInputSchema,
  ReviewSnapshotSchema,
  SubmitAuthorizationSchema,
} from '@job-harness/apply-contracts';
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
import type { ApplicantDataGrantPort, AppendExecutionEventInput, ApplyBundleFactoryPort, ApplyControlPlanePort, ApplyStorePort, SubmissionIntentSafetyPort } from './ports';

export interface ApplySafetyPersistenceIncident {
  readonly operation: 'mark_manual_review';
  readonly reason: 'lease_expired' | 'submit_boundary_persistence_failed' | 'post_boundary_attempt_failed';
  readonly attemptId: string;
  readonly intentId: string;
  readonly message: string;
}

export interface ApplyRuntimeOptions {
  readonly now?: () => string;
  readonly idFactory?: () => string;
  readonly leaseTokenFactory?: () => string;
  readonly executorStaleAfterMs?: number;
  readonly applicantData?: ApplicantDataGrantPort | null;
  readonly onSafetyPersistenceError?: (incident: ApplySafetyPersistenceIncident) => void | Promise<void>;
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
  const applicantData = options.applicantData ?? null;

  async function reportSafetyPersistenceError(incident: ApplySafetyPersistenceIncident): Promise<void> {
    if (!options.onSafetyPersistenceError) return;
    try { await options.onSafetyPersistenceError(incident); } catch { /* reporting must never change fail-closed behavior */ }
  }

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
          browserSessionHandoff: null,
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
            try {
              await intentSafety.markManualReview({
                intentId: expired.intentId,
                occurredAt: timestamp,
                error: `Execution attempt ${expired.id} lease expired after the external-effect boundary; verify the recruiting site before any new submit`,
                evidence: { executionAttemptId: expired.id, externalEffectState: expired.externalEffectState, reason: 'lease_expired' },
              });
            } catch (error) {
              await reportSafetyPersistenceError({
                operation: 'mark_manual_review', reason: 'lease_expired', attemptId: expired.id, intentId: expired.intentId,
                message: error instanceof Error ? error.message : String(error),
              });
            }
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
        if (current.adapterId && current.adapterId !== parsed.adapterId) {
          throw new ApplyConflictError(`Attempt '${current.id}' is already bound to adapter '${current.adapterId}', not '${parsed.adapterId}'`);
        }
        if (current.adapterVersion && current.adapterVersion !== parsed.adapterVersion) {
          throw new ApplyConflictError(`Attempt '${current.id}' is already bound to adapter version '${current.adapterVersion}', not '${parsed.adapterVersion}'`);
        }
        if (current.preferredBrowserBackend && current.preferredBrowserBackend !== parsed.browserBackend) {
          throw new ApplyConflictError(`Attempt '${current.id}' requires browser backend '${current.preferredBrowserBackend}', not '${parsed.browserBackend}'`);
        }
        if (current.browserBackend && current.browserBackend !== parsed.browserBackend) {
          throw new ApplyConflictError(`Attempt '${current.id}' is already bound to browser backend '${current.browserBackend}', not '${parsed.browserBackend}'`);
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
            ...(parsed.browserSessionHandoff !== undefined ? { browserSessionHandoff: parsed.browserSessionHandoff } : {}),
            errorCode: parsed.reasonCode,
            errorSummary: parsed.summary,
            updatedAt: timestamp,
          },
          event: makeEvent(idFactory, parsed.attemptId, 'human_action_required', timestamp, parsed.checkpoint ?? current.checkpoint, {
            reasonCode: parsed.reasonCode,
            summary: parsed.summary,
            browserSessionRetained: Boolean(parsed.browserSessionHandoff),
            browserSessionBackend: parsed.browserSessionHandoff?.backendId ?? null,
            browserSessionExpiresAt: parsed.browserSessionHandoff?.expiresAt ?? null,
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
        if (current.browserSessionHandoff && current.browserSessionHandoff.expiresAt <= timestamp) {
          throw new ApplyNotReadyError(`ExecutionAttempt '${current.id}' browser handoff expired at ${current.browserSessionHandoff.expiresAt}; cancel/restart instead of silently recreating a reviewed browser state`);
        }
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
            browserSessionHandoff: null,
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
        const leaseTokenHash = sha256(parsed.leaseToken);
        const validLease = await store.hasValidLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseTokenHash,
          now: timestamp,
          allowedStates: ['claimed', 'running'],
        });
        if (!validLease) throw new ApplyLeaseLostError(parsed.attemptId);
        if (parsed.externalEffectState !== current.externalEffectState) {
          throw new ApplyConflictError(`Generic failure reporting cannot change externalEffectState from '${current.externalEffectState}' to '${parsed.externalEffectState}'; use the dedicated submit-boundary protocol`);
        }
        const failed = await requireLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseToken: parsed.leaseToken,
          allowedStates: ['claimed', 'running'],
          mutation: {
            state: 'failed',
            externalEffectState: current.externalEffectState,
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: timestamp,
            checkpoint: parsed.checkpoint ?? current.checkpoint,
            browserSessionHandoff: null,
            errorCode: parsed.errorCode,
            errorSummary: parsed.errorSummary,
            completedAt: timestamp,
            updatedAt: timestamp,
          },
          event: makeEvent(idFactory, current.id,
            current.externalEffectState === 'uncertain' ? 'external_result_uncertain' : 'attempt_failed',
            timestamp,
            parsed.checkpoint ?? current.checkpoint,
            { errorCode: parsed.errorCode, errorSummary: parsed.errorSummary, ...parsed.payload },
          ),
        });
        if (current.externalEffectState !== 'not_crossed') {
          try {
            await intentSafety.markManualReview({
              intentId: current.intentId,
              occurredAt: timestamp,
              error: `Execution attempt ${current.id} ended after the external-effect boundary with state '${current.externalEffectState}': ${parsed.errorSummary}`,
              evidence: {
                executionAttemptId: current.id,
                externalEffectState: current.externalEffectState,
                errorCode: parsed.errorCode,
                checkpoint: parsed.checkpoint ?? current.checkpoint,
                ...parsed.payload,
              },
            });
          } catch (error) {
            await reportSafetyPersistenceError({
              operation: 'mark_manual_review', reason: 'post_boundary_attempt_failed', attemptId: current.id, intentId: current.intentId,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return failed;
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
            browserSessionHandoff: null,
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
          fileName: artifact.fileName,
        };
      },
      async applicantCatalog(raw) {
        const parsed = ApplicantDataGrantInputSchema.parse(raw);
        if (!applicantData) throw new ApplyNotReadyError('Applicant data grant is not configured');
        const at = now();
        const attempt = await store.getAttempt(parsed.attemptId);
        if (!attempt) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        const valid = await store.hasValidLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseTokenHash: sha256(parsed.leaseToken),
          now: at,
          allowedStates: ['claimed', 'running'],
        });
        if (!valid) throw new ApplyLeaseLostError(parsed.attemptId);
        return applicantData.catalog(attempt);
      },
      async resolveApplicantData(raw) {
        const parsed = ResolveApplicantDataInputSchema.parse(raw);
        if (!applicantData) throw new ApplyNotReadyError('Applicant data grant is not configured');
        const at = now();
        const attempt = await store.getAttempt(parsed.attemptId);
        if (!attempt) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        const valid = await store.hasValidLease({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseTokenHash: sha256(parsed.leaseToken),
          now: at,
          allowedStates: ['claimed', 'running'],
        });
        if (!valid) throw new ApplyLeaseLostError(parsed.attemptId);
        return applicantData.resolve(attempt, parsed.keys);
      },
      async createReviewSnapshot(raw) {
        const parsed = CreateReviewSnapshotInputSchema.parse(raw);
        const timestamp = now();
        const attempt = await store.getAttempt(parsed.attemptId);
        if (!attempt) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        if (parsed.summary.readyForSubmit && (parsed.summary.requiredPending > 0 || parsed.summary.failed > 0 || parsed.summary.blockingIssueCodes.length > 0)) {
          throw new ApplyConflictError('ReviewSnapshot cannot be readyForSubmit while blocking/pending/failed fields remain');
        }
        if (!attempt.adapterId || !attempt.adapterVersion) {
          throw new ApplyConflictError(`ExecutionAttempt '${attempt.id}' must bind a concrete adapter id/version before review`);
        }
        if (parsed.siteAdapterId !== attempt.adapterId || parsed.siteAdapterVersion !== attempt.adapterVersion) {
          throw new ApplyConflictError(`ReviewSnapshot adapter '${parsed.siteAdapterId}@${parsed.siteAdapterVersion}' does not match frozen Attempt adapter '${attempt.adapterId}@${attempt.adapterVersion}'`);
        }
        const browserSessionRef = parsed.browserSessionRef ?? attempt.browserSessionHandoff?.sessionRef ?? null;
        const material = {
          attemptId: attempt.id,
          bundleHash: attempt.bundleHash,
          browserSessionRef,
          formStateHash: parsed.formStateHash,
          formVersion: parsed.formVersion,
          catalogVersion: parsed.catalogVersion,
          siteAdapterId: parsed.siteAdapterId,
          siteAdapterVersion: parsed.siteAdapterVersion,
          summary: parsed.summary,
        };
        const snapshot = ReviewSnapshotSchema.parse({
          id: idFactory(),
          ...material,
          reviewHash: sha256(stableJson(material)),
          createdAt: timestamp,
        });
        return store.createReviewSnapshot({ snapshot, executorId: parsed.executorId, leaseTokenHash: sha256(parsed.leaseToken), now: timestamp });
      },
      async listReviewSnapshots(raw) {
        const parsed = ListReviewSnapshotsInputSchema.parse(raw);
        const attempt = await store.getAttempt(parsed.attemptId);
        if (!attempt) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        return { items: await store.listReviewSnapshots(parsed.attemptId, parsed.limit) };
      },
      async authorizeSubmit(raw) {
        const parsed = AuthorizeSubmitInputSchema.parse(raw);
        const timestamp = now();
        const attempt = await store.getAttempt(parsed.attemptId);
        if (!attempt) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        const snapshot = await store.getReviewSnapshot(parsed.reviewSnapshotId);
        if (!snapshot || snapshot.attemptId !== attempt.id) throw new ApplyNotFoundError('ReviewSnapshot', parsed.reviewSnapshotId);
        const requestHash = sha256(stableJson({
          attemptId: parsed.attemptId,
          reviewSnapshotId: parsed.reviewSnapshotId,
          expiresInSeconds: parsed.expiresInSeconds,
          actor: parsed.actor,
        }));
        const authorization = SubmitAuthorizationSchema.parse({
          id: idFactory(),
          attemptId: attempt.id,
          reviewSnapshotId: snapshot.id,
          reviewHash: snapshot.reviewHash,
          actor: parsed.actor,
          status: 'active',
          issuedAt: timestamp,
          expiresAt: new Date(Date.parse(timestamp) + parsed.expiresInSeconds * 1000).toISOString(),
          consumedAt: null,
          revokedAt: null,
          idempotencyKey: parsed.idempotencyKey,
          requestHash,
        });
        return store.issueSubmitAuthorization(authorization);
      },
      async listSubmitAuthorizations(raw) {
        const parsed = ListSubmitAuthorizationsInputSchema.parse(raw);
        const attempt = await store.getAttempt(parsed.attemptId);
        if (!attempt) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        return { items: await store.listSubmitAuthorizations(parsed.attemptId, parsed.limit) };
      },
      async revokeSubmitAuthorization(raw) {
        const parsed = RevokeSubmitAuthorizationInputSchema.parse(raw);
        return store.revokeSubmitAuthorization({ ...parsed, now: now() });
      },
      async beginSubmit(raw) {
        const parsed = BeginSubmitInputSchema.parse(raw);
        const timestamp = now();
        const leaseTokenHash = sha256(parsed.leaseToken);
        // Validate the exact review/authorization/lease first, but do not consume the
        // authorization yet. If the business SubmissionIntent cannot enter
        // external_in_progress, the user authorization stays usable instead of being
        // burned by a local coordination failure.
        const validated = await store.validateSubmitAuthorization({
          attemptId: parsed.attemptId,
          executorId: parsed.executorId,
          leaseTokenHash,
          authorizationId: parsed.authorizationId,
          formStateHash: parsed.formStateHash,
          now: timestamp,
        });
        try {
          await intentSafety.beginExternal({ intentId: validated.attempt.intentId, occurredAt: parsed.occurredAt });
        } catch (error) {
          throw new ApplyConflictError(`SubmissionIntent could not enter external_in_progress before submit: ${error instanceof Error ? error.message : String(error)}`);
        }
        let crossed;
        try {
          crossed = await store.consumeAndMarkSubmitBoundary({
            attemptId: parsed.attemptId,
            executorId: parsed.executorId,
            leaseTokenHash,
            authorizationId: parsed.authorizationId,
            formStateHash: parsed.formStateHash,
            now: timestamp,
            authorizedEventId: idFactory(),
            triggeredEventId: idFactory(),
          });
        } catch (error) {
          // The business intent is already external_in_progress but no click permission
          // was returned. Fail closed to manual review rather than issuing another
          // automatic submit attempt.
          try {
            await intentSafety.markManualReview({
              intentId: validated.attempt.intentId,
              occurredAt: parsed.occurredAt,
              error: 'SubmissionIntent entered external_in_progress but the local submit boundary could not be durably recorded',
              evidence: { executionAttemptId: parsed.attemptId, submitAuthorizationId: parsed.authorizationId },
            });
          } catch (safetyError) {
            await reportSafetyPersistenceError({
              operation: 'mark_manual_review', reason: 'submit_boundary_persistence_failed', attemptId: parsed.attemptId, intentId: validated.attempt.intentId,
              message: safetyError instanceof Error ? safetyError.message : String(safetyError),
            });
          }
          throw error;
        }
        return BeginSubmitOutputSchema.parse({
          attemptId: crossed.attempt.id,
          state: crossed.attempt.state,
          externalEffectState: crossed.attempt.externalEffectState,
          authorization: crossed.authorization,
        });
      },
      async reportSubmitSuccess(raw) {
        const parsed = ReportSubmitSuccessInputSchema.parse(raw);
        const attempt = await store.getAttempt(parsed.attemptId);
        if (!attempt) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        if (attempt.externalEffectState !== 'crossed') throw new ApplyConflictError('External success cannot be recorded before the submit boundary is durably crossed');
        const controlPlaneNow = now();
        const valid = await store.hasValidLease({
          attemptId: attempt.id,
          executorId: parsed.executorId,
          leaseTokenHash: sha256(parsed.leaseToken),
          now: controlPlaneNow,
          allowedStates: ['running'],
        });
        if (!valid) throw new ApplyLeaseLostError(attempt.id);
        await intentSafety.confirmExternal({
          intentId: attempt.intentId,
          confirmedAt: parsed.confirmedAt,
          appliedAt: parsed.appliedAt,
          ...(parsed.externalReference !== undefined ? { externalReference: parsed.externalReference } : {}),
          evidence: parsed.externalEvidence,
        });
        return store.completeSubmitSuccess({
          attemptId: attempt.id,
          executorId: parsed.executorId,
          leaseTokenHash: sha256(parsed.leaseToken),
          now: controlPlaneNow,
          eventIdFactory: idFactory,
          payload: { externalReference: parsed.externalReference ?? null, evidenceKeys: Object.keys(parsed.externalEvidence).sort() },
        });
      },
      async reportSubmitFailure(raw) {
        const parsed = ReportSubmitFailureInputSchema.parse(raw);
        const attempt = await store.getAttempt(parsed.attemptId);
        if (!attempt) throw new ApplyNotFoundError('ExecutionAttempt', parsed.attemptId);
        if (attempt.externalEffectState !== 'crossed') throw new ApplyConflictError('External submit failure cannot be recorded before the submit boundary is durably crossed');
        const controlPlaneNow = now();
        const valid = await store.hasValidLease({
          attemptId: attempt.id,
          executorId: parsed.executorId,
          leaseTokenHash: sha256(parsed.leaseToken),
          now: controlPlaneNow,
          allowedStates: ['running'],
        });
        if (!valid) throw new ApplyLeaseLostError(attempt.id);
        const status = parsed.outcome === 'external_failed' ? 'external_failed' : 'needs_manual_review';
        await intentSafety.failExternal({
          intentId: attempt.intentId,
          occurredAt: parsed.occurredAt,
          status,
          error: parsed.error,
          evidence: parsed.externalEvidence,
        });
        return store.failSubmitAttempt({
          attemptId: attempt.id,
          executorId: parsed.executorId,
          leaseTokenHash: sha256(parsed.leaseToken),
          now: controlPlaneNow,
          externalEffectState: parsed.outcome === 'uncertain' ? 'uncertain' : 'crossed',
          errorCode: parsed.outcome === 'uncertain' ? 'submit_result_uncertain' : 'external_submit_failed',
          errorSummary: parsed.error,
          payload: { outcome: parsed.outcome, evidenceKeys: Object.keys(parsed.externalEvidence).sort() },
          eventId: idFactory(),
        });
      },
    },
  };
}
