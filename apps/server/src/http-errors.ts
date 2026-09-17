import type { Response } from 'express';
import { ZodError } from 'zod';
import { RestErrorEnvelopeSchema } from '@job-harness/contracts';

export function writeRestError(
  res: Response,
  status: number,
  code: string,
  message: string,
  issues?: unknown,
): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  const body = RestErrorEnvelopeSchema.parse({
    error: {
      code,
      message,
      ...(issues !== undefined ? { issues } : {}),
    },
  });
  res.status(status).json(body);
}

export function writeCommonRestError(res: Response, error: unknown): boolean {
  if (res.headersSent) {
    res.end();
    return true;
  }
  if (error instanceof ZodError) {
    writeRestError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', error.issues);
    return true;
  }
  return false;
}

export function writeInternalRestError(res: Response): void {
  writeRestError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}
