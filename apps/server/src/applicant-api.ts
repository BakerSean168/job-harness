import type { Express, Request, Response } from 'express';
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
import { writeCommonRestError, writeInternalRestError, writeRestError } from './http-errors';

function sendError(res: Response, error: unknown): void {
  if (writeCommonRestError(res, error)) return;
  if (error instanceof ApplicantConcurrencyError) { writeRestError(res, 409, 'VERSION_CONFLICT', error.message); return; }
  if (error instanceof ApplicantNotFoundError) { writeRestError(res, 404, 'NOT_FOUND', error.message); return; }
  writeInternalRestError(res);
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
