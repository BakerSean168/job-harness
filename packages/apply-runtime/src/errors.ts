export type ApplyRuntimeErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'INVALID_TRANSITION' | 'LEASE_LOST' | 'NOT_READY';

export class ApplyRuntimeError extends Error {
  constructor(readonly code: ApplyRuntimeErrorCode, message: string) {
    super(message);
    this.name = 'ApplyRuntimeError';
  }
}

export class ApplyNotFoundError extends ApplyRuntimeError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} '${id}' was not found`);
    this.name = 'ApplyNotFoundError';
  }
}

export class ApplyConflictError extends ApplyRuntimeError {
  constructor(message: string) {
    super('CONFLICT', message);
    this.name = 'ApplyConflictError';
  }
}

export class ApplyInvalidTransitionError extends ApplyRuntimeError {
  constructor(from: string, to: string) {
    super('INVALID_TRANSITION', `ExecutionAttempt cannot transition from '${from}' to '${to}'`);
    this.name = 'ApplyInvalidTransitionError';
  }
}

export class ApplyLeaseLostError extends ApplyRuntimeError {
  constructor(attemptId: string) {
    super('LEASE_LOST', `ExecutionAttempt '${attemptId}' lease is missing, expired, or owned by another executor`);
    this.name = 'ApplyLeaseLostError';
  }
}

export class ApplyNotReadyError extends ApplyRuntimeError {
  constructor(message: string) {
    super('NOT_READY', message);
    this.name = 'ApplyNotReadyError';
  }
}
