import type { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  AuthorizeResumeArtifactInputSchema,
  CancelExecutionAttemptInputSchema,
  ClaimExecutionAttemptInputSchema,
  CompleteExecutionAttemptInputSchema,
  DispatchExecutionAttemptInputSchema,
  ExecutorHeartbeatInputSchema,
  FailExecutionAttemptInputSchema,
  HeartbeatExecutionAttemptInputSchema,
  ListExecutionAttemptsInputSchema,
  ListExecutorsInputSchema,
  MarkExecutionAttemptWaitingInputSchema,
  RegisterExecutorInputSchema,
  ResumeArtifactGrantOutputSchema,
  ResumeExecutionAttemptInputSchema,
  StartExecutionAttemptInputSchema,
} from '@job-harness/apply-contracts';
import { ApplyRuntimeError, type ApplyControlPlanePort } from '@job-harness/apply-runtime';
import { JOB_HARNESS_REST_V1_ROUTES } from '@job-harness/contracts';
import type { ResumeArtifactRuntimePorts } from '@job-harness/resume-application';
import { registerRestV1Route } from './rest-route';

const API_PREFIX = '/api/v1';
type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.length ? String(value[0]) : undefined;
  return typeof value === 'string' ? value : undefined;
}
function list(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? [value] : [];
  const result = values.flatMap((item) => item.split(',')).map((item) => item.trim()).filter(Boolean);
  return result.length ? result : undefined;
}
function integer(value: unknown): number | undefined {
  const raw = first(value);
  if (raw == null || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}
function pageQuery(query: Request['query']) {
  return {
    ...(integer(query.limit) !== undefined ? { limit: integer(query.limit) } : {}),
    ...(integer(query.offset) !== undefined ? { offset: integer(query.offset) } : {}),
  };
}
function runtimeStatus(error: ApplyRuntimeError): number {
  switch (error.code) {
    case 'NOT_FOUND': return 404;
    case 'CONFLICT': return 409;
    case 'INVALID_TRANSITION': return 422;
    case 'LEASE_LOST': return 409;
    case 'NOT_READY': return 503;
  }
}
function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: error.issues } });
    return;
  }
  if (error instanceof ApplyRuntimeError) {
    res.status(runtimeStatus(error)).json({ error: { code: error.code, message: error.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
function route(handler: AsyncHandler) {
  return (req: Request, res: Response) => { void handler(req, res).catch((error) => sendError(res, error)); };
}
function pathId(value: unknown): string {
  const id = first(value)?.trim();
  if (!id || id.length > 200) throw new ZodError([]);
  return id;
}

export function registerApplyApi(app: Express, apply: ApplyControlPlanePort, artifacts: ResumeArtifactRuntimePorts): void {
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.executors, route(async (req, res) => {
    const input = ListExecutorsInputSchema.parse({
      ...pageQuery(req.query),
      ...(list(req.query.statuses) ? { statuses: list(req.query.statuses) } : {}),
    });
    res.json(await apply.executors.list(input));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.executorDetail, route(async (req, res) => {
    const id = pathId(req.params.executorId);
    const result = await apply.executors.get(id);
    if (!result) { res.status(404).json({ error: { code: 'NOT_FOUND', message: `ExecutorRegistration '${id}' was not found` } }); return; }
    res.json(result);
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.registerExecutor, route(async (req, res) => {
    res.json(await apply.executors.register(RegisterExecutorInputSchema.parse(req.body)));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.heartbeatExecutor, route(async (req, res) => {
    const input = ExecutorHeartbeatInputSchema.parse({ ...req.body, executorId: pathId(req.params.executorId) });
    res.json(await apply.executors.heartbeat(input));
  }));

  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.executionAttempts, route(async (req, res) => {
    const input = ListExecutionAttemptsInputSchema.parse({
      ...pageQuery(req.query),
      ...(list(req.query.states) ? { states: list(req.query.states) } : {}),
      ...(first(req.query.intentId) ? { intentId: first(req.query.intentId) } : {}),
      ...(first(req.query.executorId) ? { executorId: first(req.query.executorId) } : {}),
      ...(list(req.query.externalEffectStates) ? { externalEffectStates: list(req.query.externalEffectStates) } : {}),
    });
    res.json(await apply.attempts.list(input));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.executionAttemptDetail, route(async (req, res) => {
    const id = pathId(req.params.attemptId);
    const result = await apply.attempts.get(id);
    if (!result) { res.status(404).json({ error: { code: 'NOT_FOUND', message: `ExecutionAttempt '${id}' was not found` } }); return; }
    res.json(result);
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.dispatchExecutionAttempt, route(async (req, res) => {
    res.status(201).json(await apply.attempts.dispatch(DispatchExecutionAttemptInputSchema.parse(req.body)));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.claimExecutionAttempt, route(async (req, res) => {
    res.json(await apply.attempts.claim(ClaimExecutionAttemptInputSchema.parse(req.body)));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.heartbeatExecutionAttempt, route(async (req, res) => {
    res.json(await apply.attempts.heartbeat(HeartbeatExecutionAttemptInputSchema.parse({ ...req.body, attemptId: pathId(req.params.attemptId) })));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.startExecutionAttempt, route(async (req, res) => {
    res.json(await apply.attempts.start(StartExecutionAttemptInputSchema.parse({ ...req.body, attemptId: pathId(req.params.attemptId) })));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.waitExecutionAttempt, route(async (req, res) => {
    res.json(await apply.attempts.waiting(MarkExecutionAttemptWaitingInputSchema.parse({ ...req.body, attemptId: pathId(req.params.attemptId) })));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.resumeExecutionAttempt, route(async (req, res) => {
    res.json(await apply.attempts.resume(ResumeExecutionAttemptInputSchema.parse({ ...req.body, attemptId: pathId(req.params.attemptId) })));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.completeExecutionAttempt, route(async (req, res) => {
    res.json(await apply.attempts.complete(CompleteExecutionAttemptInputSchema.parse({ ...req.body, attemptId: pathId(req.params.attemptId) })));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.failExecutionAttempt, route(async (req, res) => {
    res.json(await apply.attempts.fail(FailExecutionAttemptInputSchema.parse({ ...req.body, attemptId: pathId(req.params.attemptId) })));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.cancelExecutionAttempt, route(async (req, res) => {
    res.json(await apply.attempts.cancel(CancelExecutionAttemptInputSchema.parse({ ...req.body, attemptId: pathId(req.params.attemptId) })));
  }));
  registerRestV1Route(app, API_PREFIX, JOB_HARNESS_REST_V1_ROUTES.executionAttemptResumeArtifact, route(async (req, res) => {
    const authorization = await apply.attempts.authorizeResumeArtifact(AuthorizeResumeArtifactInputSchema.parse({
      ...req.body,
      attemptId: pathId(req.params.attemptId),
    }));
    const content = await artifacts.getContent(authorization.artifactId);
    if (!content) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `ResumeArtifact '${authorization.artifactId}' was not found` } });
      return;
    }
    if (
      content.artifact.revisionId !== authorization.revisionId
      || content.artifact.sha256.toLowerCase() !== authorization.sha256
      || content.artifact.byteSize !== authorization.byteSize
      || content.artifact.mimeType !== authorization.mimeType
    ) {
      throw new ApplyRuntimeError('CONFLICT', `Frozen Resume Artifact evidence for attempt '${pathId(req.params.attemptId)}' no longer matches durable artifact metadata`);
    }
    res.json(ResumeArtifactGrantOutputSchema.parse({
      artifactId: content.artifact.id,
      revisionId: content.artifact.revisionId,
      fileName: `${content.artifact.id}.pdf`,
      mimeType: content.artifact.mimeType,
      sha256: content.artifact.sha256.toLowerCase(),
      byteSize: content.artifact.byteSize,
      bytesBase64: Buffer.from(content.bytes).toString('base64'),
    }));
  }));
}
