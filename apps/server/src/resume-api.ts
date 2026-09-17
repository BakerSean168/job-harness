import type { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { JOB_HARNESS_REST_V1_ROUTES } from '@job-harness/contracts';
import {
  ListResumeProfilesInputSchema,
  ResumePreviewInputSchema,
  ResumePreviewOutputSchema,
  SaveResumeLibraryInputSchema,
  SaveResumeProfileInputSchema,
  PublishResumeRevisionInputSchema,
  ResumeRevisionDiffQuerySchema,
  MaterializeResumeArtifactInputSchema,
} from '@job-harness/resume-contracts';
import {
  ResumeConcurrencyError,
  ResumeNotFoundError,
  ResumeReferenceValidationError,
  ResumeResolutionError,
  ResumeArtifactCapabilityError,
  ResumeArtifactIntegrityError,
  type ResumeArtifactRuntimePorts,
  type ResumePdfRendererPort,
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
  if (error instanceof ResumeConcurrencyError) {
    res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: error.message } });
    return;
  }
  if (error instanceof ResumeReferenceValidationError) {
    res.status(422).json({ error: { code: 'RESUME_REFERENCE_INVALID', message: error.message, issues: error.issues } });
    return;
  }
  if (error instanceof ResumeNotFoundError) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
    return;
  }
  if (error instanceof ResumeArtifactCapabilityError) {
    res.status(503).json({ error: { code: 'RESUME_ARTIFACT_UNAVAILABLE', message: error.message } });
    return;
  }
  if (error instanceof ResumeArtifactIntegrityError) {
    res.status(500).json({ error: { code: 'RESUME_ARTIFACT_INTEGRITY_FAILED', message: error.message } });
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

export function registerResumeApi(app: Express, resume: ResumeRuntimePorts, artifacts: ResumeArtifactRuntimePorts, pdfRenderer: ResumePdfRendererPort | null, apiPrefix: string): void {
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


  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.saveResumeProfile, route(async (req, res) => {
    const profileId = String(req.params.profileId ?? '').trim();
    const input = SaveResumeProfileInputSchema.parse(req.body);
    if (input.profile.id !== profileId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Profile route id must match payload id' } });
      return;
    }
    res.json(await resume.saveProfile(input));
  }));

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.saveResumeLibrary, route(async (req, res) => {
    const libraryId = String(req.params.libraryId ?? '').trim();
    const input = SaveResumeLibraryInputSchema.parse(req.body);
    if (input.library.id !== libraryId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Library route id must match payload id' } });
      return;
    }
    res.json(await resume.saveLibrary(input));
  }));

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.resumePreview, route(async (req, res) => {
    const input = ResumePreviewInputSchema.parse(req.body);
    const context = await resume.resolvePreview(input);
    const html = renderResumePreviewHtml(context.resolved, { variant: context.profile.id });
    res.json(ResumePreviewOutputSchema.parse({ resolved: context.resolved, html }));
  }));

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.resumePreviewPdf, route(async (req, res) => {
    if (!pdfRenderer) throw new ResumeArtifactCapabilityError('PDF renderer is not configured');
    const input = ResumePreviewInputSchema.parse(req.body);
    const context = await resume.resolvePreview(input);
    const html = renderResumePreviewHtml(context.resolved, { variant: context.profile.id });
    const bytes = await pdfRenderer.renderPdf(html);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-length', String(bytes.byteLength));
    res.setHeader('cache-control', 'private, no-store');
    res.status(200).end(Buffer.from(bytes));
  }));


  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.resumeRevisions, route(async (req, res) => {
    const profileId = String(req.params.profileId ?? '').trim();
    res.json(await resume.listRevisions(profileId));
  }));

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.publishResumeRevision, route(async (req, res) => {
    const profileId = String(req.params.profileId ?? '').trim();
    const input = PublishResumeRevisionInputSchema.parse({ ...req.body, profileId });
    res.json(await resume.publishRevision(input));
  }));

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.resumeRevisionDetail, route(async (req, res) => {
    const revisionId = String(req.params.revisionId ?? '').trim();
    const result = revisionId ? await resume.getRevisionDetail(revisionId) : null;
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `ResumeRevision '${revisionId}' was not found` } });
      return;
    }
    res.json(result);
  }));

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.resumeRevisionDiff, route(async (req, res) => {
    const revisionId = String(req.params.revisionId ?? '').trim();
    const query = ResumeRevisionDiffQuerySchema.parse({ ...(first(req.query.against) ? { against: first(req.query.against) } : {}) });
    const result = revisionId ? await resume.diffRevision(revisionId, query) : null;
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `ResumeRevision '${revisionId}' was not found` } });
      return;
    }
    res.json(result);
  }));


  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.materializeResumeArtifact, route(async (req, res) => {
    const revisionId = String(req.params.revisionId ?? '').trim();
    const input = MaterializeResumeArtifactInputSchema.parse({ ...req.body, revisionId });
    res.json(await artifacts.materialize(input));
  }));

  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.downloadResumeArtifact, route(async (req, res) => {
    const artifactId = String(req.params.artifactId ?? '').trim();
    const result = artifactId ? await artifacts.getContent(artifactId) : null;
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `ResumeArtifact '${artifactId}' was not found` } });
      return;
    }
    const extension = result.artifact.kind === 'html' ? 'html' : result.artifact.kind === 'pdf' ? 'pdf' : result.artifact.kind === 'json' ? 'json' : 'txt';
    res.setHeader('content-type', result.artifact.mimeType);
    res.setHeader('content-disposition', `attachment; filename="${result.artifact.id}.${extension}"`);
    res.setHeader('content-length', String(result.bytes.byteLength));
    res.setHeader('cache-control', 'private, no-store');
    res.status(200).end(Buffer.from(result.bytes));
  }));
}
