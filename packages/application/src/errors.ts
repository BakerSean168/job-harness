export class CareerApplicationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class CareerNotFoundError extends CareerApplicationError {
  constructor(entity: string, id: string) {
    super(`${entity} '${id}' was not found`, 'NOT_FOUND');
  }
}

export class CareerConflictError extends CareerApplicationError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}

export class CareerInvalidTransitionError extends CareerApplicationError {
  constructor(entity: string, from: string, to: string) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`, 'INVALID_TRANSITION');
  }
}

export class CareerIdempotencyConflictError extends CareerApplicationError {
  constructor(scope: string, key: string) {
    super(`Idempotency key '${key}' was already used with different input in ${scope}`, 'IDEMPOTENCY_CONFLICT');
  }
}
