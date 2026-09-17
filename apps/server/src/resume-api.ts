import type { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { JOB_HARNESS_REST_V1_ROUTES } from '@job-harness/contracts';
import {
  ListResumeProfilesInputSchema,
  ResumePreviewInputSchema,
  ResumePreviewOutputSchema,
} from '@job-harness/resume-contracts';
import {
  ResumeNotFoundError,
  ResumeResolutionError,
  type ResumeRuntimePorts,
} from '@job-harness/resume-application';
import { renderResumePreviewHtml } from '@job-harness/resume-renderer';
import { registerRestV1Route } from './rest-route';

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.length ? String(value[0]) : undefined;
  return typeof value === 'string' ? value : undefined;
}

function boolean(value: unknown): boolean | undefined | string {
  const raw = first(value)?.toLowerCase();
  if (raw == null) return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return raw;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: error.issues } });
    return;
  }
  if (error instanceof ResumeNotFoundError) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
    return;
  }
  if (error instanceof ResumeResolutionError) {
    res.status(422).json({ error: { code: 'RESUME_RESOLUTION_FAILED', message: error.message, issues: error.issues } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}

function route(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => { void handler(req, res).catch((error) => sendError(res, error)); };
}

export function registerResumeApi(app: Express, resume: ResumeRuntimePorts, apiPrefix: string): void {
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.resumeProfiles, route(async (req, res) => {
    const input = ListResumeProfilesInputSchema.parse({
      ...(first(req.query.libraryId) ? { libraryId: first(req.query.libraryId) } : {}),
      ...(boolean(req.query.includeArchived) !== undefined ? { includeArchived: boolean(req.query.includeArchived) } : {}),
    });
    res.json(await resume.listProfiles(input));
  }));

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.resumeProfileDetail, route(async (req, res) => {
    const profileId = String(req.params.profileId ?? '').trim();
    const result = profileId ? await resume.getProfileContext(profileId) : null;
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `ResumeProfile '${profileId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.resumePreview, route(async (req, res) => {
    const input = ResumePreviewInputSchema.parse(req.body);
    const context = await resume.resolvePreview(input);
    const html = renderResumePreviewHtml(context.resolved, { variant: context.profile.id });
    res.json(ResumePreviewOutputSchema.parse({ resolved: context.resolved, html }));
  }));
}
