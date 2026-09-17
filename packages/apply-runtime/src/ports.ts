import type {
  ApplyBundle,
  DispatchExecutionAttemptInput,
  ExecutionAttempt,
  ExecutionEvent,
  ExecutionEventType,
  ExecutorRegistration,
  ListExecutionAttemptsInput,
  ListExecutionAttemptsOutput,
  ListExecutorsInput,
  ListExecutorsOutput,
} from '@job-harness/apply-contracts';

export interface ApplyBundleFactoryPort {
  create(input: {
    readonly intentId: string;
    readonly attemptId: string;
    readonly policySnapshot: Record<string, unknown>;
    readonly applicantCatalogVersion: string | null;
    readonly answerSetVersion: string | null;
    readonly answerSetHash: string | null;
    readonly createdAt: string;
  }): Promise<ApplyBundle>;
}

export interface AttemptMutation {
  readonly state?: ExecutionAttempt['state'];
  readonly executorId?: string | null;
  readonly adapterId?: string | null;
  readonly adapterVersion?: string | null;
  readonly browserBackend?: string | null;
  readonly leaseOwner?: string | null;
  readonly leaseTokenHash?: string | null;
  readonly leaseExpiresAt?: string | null;
  readonly lastHeartbeatAt?: string | null;
  readonly checkpoint?: string | null;
  readonly externalEffectState?: ExecutionAttempt['externalEffectState'];
  readonly reviewHash?: string | null;
  readonly submitAuthorizationId?: string | null;
  readonly errorCode?: string | null;
  readonly errorSummary?: string | null;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly updatedAt: string;
}

export interface AppendExecutionEventInput {
  readonly id: string;
  readonly attemptId: string;
  readonly type: ExecutionEventType;
  readonly occurredAt: string;
  readonly checkpoint: string | null;
  readonly payload: Record<string, unknown>;
}

export interface ApplyStorePort {
  listExecutors(input: ListExecutorsInput): Promise<ListExecutorsOutput>;
  getExecutor(executorId: string): Promise<ExecutorRegistration | null>;
  upsertExecutor(executor: ExecutorRegistration): Promise<ExecutorRegistration>;

  listAttempts(input: ListExecutionAttemptsInput): Promise<ListExecutionAttemptsOutput>;
  getAttempt(attemptId: string): Promise<ExecutionAttempt | null>;
  listEvents(attemptId: string): Promise<readonly ExecutionEvent[]>;
  findAttemptByIdempotencyKey(idempotencyKey: string): Promise<ExecutionAttempt | null>;
  findActiveAttemptByIntent(intentId: string): Promise<ExecutionAttempt | null>;
  insertAttempt(attempt: ExecutionAttempt, initialEvent: AppendExecutionEventInput): Promise<ExecutionAttempt>;

  countLeasedAttempts(executorId: string, at: string): Promise<number>;
  abandonExpiredAttempts(input: { readonly now: string; readonly limit: number; readonly eventIdFactory: () => string }): Promise<readonly ExecutionAttempt[]>;
  tryClaimAttempt(input: {
    readonly attemptId: string;
    readonly executorId: string;
    readonly leaseTokenHash: string;
    readonly leaseExpiresAt: string;
    readonly now: string;
    readonly event: AppendExecutionEventInput;
  }): Promise<ExecutionAttempt | null>;

  mutateWithLease(input: {
    readonly attemptId: string;
    readonly executorId: string;
    readonly leaseTokenHash: string;
    readonly now: string;
    readonly allowedStates: readonly ExecutionAttempt['state'][];
    readonly mutation: AttemptMutation;
    readonly event?: AppendExecutionEventInput;
  }): Promise<ExecutionAttempt | null>;

  mutateWithoutLease(input: {
    readonly attemptId: string;
    readonly allowedStates: readonly ExecutionAttempt['state'][];
    readonly mutation: AttemptMutation;
    readonly event: AppendExecutionEventInput;
  }): Promise<ExecutionAttempt | null>;
}


export interface SubmissionIntentSafetyPort {
  markManualReview(input: {
    readonly intentId: string;
    readonly occurredAt: string;
    readonly error: string;
    readonly evidence: Record<string, unknown>;
  }): Promise<void>;
}

export interface ApplyControlPlanePort {
  executors: {
    list(input?: ListExecutorsInput): Promise<ListExecutorsOutput>;
    get(executorId: string): Promise<ExecutorRegistration | null>;
    register(input: unknown): Promise<ExecutorRegistration>;
    heartbeat(input: unknown): Promise<ExecutorRegistration>;
  };
  attempts: {
    list(input?: ListExecutionAttemptsInput): Promise<ListExecutionAttemptsOutput>;
    get(attemptId: string): Promise<{ attempt: ExecutionAttempt; events: readonly ExecutionEvent[] } | null>;
    dispatch(input: DispatchExecutionAttemptInput): Promise<ExecutionAttempt>;
    claim(input: unknown): Promise<{ attempt: ExecutionAttempt; leaseToken: string } | null>;
    heartbeat(input: unknown): Promise<ExecutionAttempt>;
    start(input: unknown): Promise<ExecutionAttempt>;
    waiting(input: unknown): Promise<ExecutionAttempt>;
    resume(input: unknown): Promise<ExecutionAttempt>;
    complete(input: unknown): Promise<ExecutionAttempt>;
    fail(input: unknown): Promise<ExecutionAttempt>;
    cancel(input: unknown): Promise<ExecutionAttempt>;
  };
}
