import type {
  ApplyBundle,
  ApplicantFieldCatalog,
  ApplicantFieldKey,
  ResolvedApplicantValues,
  DispatchExecutionAttemptInput,
  ExecutionAttempt,
  ReviewSnapshot,
  SubmitAuthorization,
  ExecutionEvent,
  ExecutionEventType,
  ExecutorRegistration,
  ListExecutionAttemptsInput,
  ListExecutionAttemptsOutput,
  ListExecutorsInput,
  ListExecutorsOutput,
} from '@job-harness/apply-contracts';

export interface ApplicantDataGrantPort {
  catalog(attempt: ExecutionAttempt): Promise<ApplicantFieldCatalog>;
  resolve(attempt: ExecutionAttempt, keys: readonly ApplicantFieldKey[]): Promise<ResolvedApplicantValues>;
}

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
  readonly browserSessionHandoff?: ExecutionAttempt['browserSessionHandoff'];
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
  hasValidLease(input: { readonly attemptId: string; readonly executorId: string; readonly leaseTokenHash: string; readonly now: string; readonly allowedStates: readonly ExecutionAttempt['state'][] }): Promise<boolean>;
  createReviewSnapshot(input: { readonly snapshot: ReviewSnapshot; readonly executorId: string; readonly leaseTokenHash: string; readonly now: string }): Promise<ReviewSnapshot>;
  listReviewSnapshots(attemptId: string, limit: number): Promise<readonly ReviewSnapshot[]>;
  getReviewSnapshot(snapshotId: string): Promise<ReviewSnapshot | null>;
  issueSubmitAuthorization(authorization: SubmitAuthorization): Promise<SubmitAuthorization>;
  listSubmitAuthorizations(attemptId: string, limit: number): Promise<readonly SubmitAuthorization[]>;
  getSubmitAuthorization(authorizationId: string): Promise<SubmitAuthorization | null>;
  revokeSubmitAuthorization(input: { readonly attemptId: string; readonly authorizationId: string; readonly now: string }): Promise<SubmitAuthorization>;
  validateSubmitAuthorization(input: { readonly attemptId: string; readonly executorId: string; readonly leaseTokenHash: string; readonly authorizationId: string; readonly formStateHash: string; readonly now: string }): Promise<{ readonly attempt: ExecutionAttempt; readonly authorization: SubmitAuthorization; readonly snapshot: ReviewSnapshot }>;
  consumeAndMarkSubmitBoundary(input: { readonly attemptId: string; readonly executorId: string; readonly leaseTokenHash: string; readonly authorizationId: string; readonly formStateHash: string; readonly now: string; readonly authorizedEventId: string; readonly triggeredEventId: string }): Promise<{ readonly attempt: ExecutionAttempt; readonly authorization: SubmitAuthorization; readonly snapshot: ReviewSnapshot }>;
  completeSubmitSuccess(input: { readonly attemptId: string; readonly executorId: string; readonly leaseTokenHash: string; readonly now: string; readonly eventIdFactory: () => string; readonly payload: Record<string, unknown> }): Promise<ExecutionAttempt>;
  failSubmitAttempt(input: { readonly attemptId: string; readonly executorId: string; readonly leaseTokenHash: string; readonly now: string; readonly externalEffectState: 'crossed' | 'uncertain'; readonly errorCode: string; readonly errorSummary: string; readonly payload: Record<string, unknown>; readonly eventId: string }): Promise<ExecutionAttempt>;
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
  beginExternal(input: { readonly intentId: string; readonly occurredAt: string }): Promise<void>;
  confirmExternal(input: { readonly intentId: string; readonly confirmedAt: string; readonly appliedAt: string; readonly externalReference?: string | null; readonly evidence: Record<string, unknown> }): Promise<void>;
  failExternal(input: { readonly intentId: string; readonly occurredAt: string; readonly status: 'external_failed' | 'needs_manual_review'; readonly error: string; readonly evidence: Record<string, unknown> }): Promise<void>;
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
    authorizeResumeArtifact(input: unknown): Promise<{ artifactId: string; revisionId: string; sha256: string; byteSize: number; mimeType: string; fileName: string }>;
    applicantCatalog(input: unknown): Promise<ApplicantFieldCatalog>;
    resolveApplicantData(input: unknown): Promise<ResolvedApplicantValues>;
    createReviewSnapshot(input: unknown): Promise<ReviewSnapshot>;
    listReviewSnapshots(input: unknown): Promise<{ items: readonly ReviewSnapshot[] }>;
    authorizeSubmit(input: unknown): Promise<SubmitAuthorization>;
    listSubmitAuthorizations(input: unknown): Promise<{ items: readonly SubmitAuthorization[] }>;
    revokeSubmitAuthorization(input: unknown): Promise<SubmitAuthorization>;
    beginSubmit(input: unknown): Promise<{ attemptId: string; state: string; externalEffectState: 'not_crossed' | 'crossed' | 'uncertain'; authorization: SubmitAuthorization }>;
    reportSubmitSuccess(input: unknown): Promise<ExecutionAttempt>;
    reportSubmitFailure(input: unknown): Promise<ExecutionAttempt>;
  };
}
