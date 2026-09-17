import type { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  SaveApplicantProfileInputSchema,
  SaveApplicationAnswerSetInputSchema,
} from '@job-harness/applicant-contracts';
import {
  ApplicantConcurrencyError,
  ApplicantNotFoundError,
  type ApplicantRuntimePorts,
} from '@job-harness/applicant-application';
import { JOB_HARNESS_REST_V1_ROUTES } from '@job-harness/contracts';
import { registerRestV1Route } from './rest-route';

function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: error.issues } }); return;
  }
  if (error instanceof ApplicantConcurrencyError) {
    res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: error.message } }); return;
  }
  if (error instanceof ApplicantNotFoundError) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } }); return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
const route = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => { void handler(req, res).catch((error) => sendError(res, error)); };

export function registerApplicantApi(app: Express, applicant: ApplicantRuntimePorts, apiPrefix: string): void {
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.applicantProfile, route(async (_req, res) => {
    const result = await applicant.getDefaultProfile();
    if (!result) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Default ApplicantProfile was not found' } }); return; }
    res.json(result);
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.saveApplicantProfile, route(async (req, res) => {
    res.json(await applicant.saveProfile(SaveApplicantProfileInputSchema.parse(req.body)));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.applicationAnswerSet, route(async (_req, res) => {
    const result = await applicant.getDefaultAnswerSet();
    if (!result) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Default ApplicationAnswerSet was not found' } }); return; }
    res.json(result);
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.saveApplicationAnswerSet, route(async (req, res) => {
    res.json(await applicant.saveAnswerSet(SaveApplicationAnswerSetInputSchema.parse(req.body)));
  }));
}
