import { createHash, randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import {
  CreateSiteResumeBindingInputSchema,
  JOB_HARNESS_REST_V1_ROUTES,
  ListSiteResumeBindingsInputSchema,
  ListSiteResumeBindingsOutputSchema,
  RevokeSiteResumeBindingInputSchema,
  SiteResumeBindingSchema,
  type CreateSiteResumeBindingInput,
  type ListSiteResumeBindingsInput,
  type ListSiteResumeBindingsOutput,
  type SiteResumeBinding,
} from '@job-harness/contracts';
import type { SiteResumeBindingStorePort } from '@job-harness/persistence-sqlite';
import type { ResumeRuntimePorts } from '@job-harness/resume-application';
import type { BrowserExtensionValidationRegistry } from './browser-extension-validation';
import { BrowserExtensionBridgeError } from './browser-extension-bridge';
import { registerRestV1Route } from './rest-route';
import { writeCommonRestError, writeInternalRestError, writeRestError } from './http-errors';

export class SiteResumeBindingError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_EVIDENCE', message: string) {
    super(message);
    this.name = 'SiteResumeBindingError';
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function normalized(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
function familyFromUrl(value: string): 'zhilian' | 'liepin' | null {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if ((host === 'zhaopin.com' || host === 'www.zhaopin.com') && /^\/jobdetail\/[^/]+\.htm$/i.test(url.pathname)) return 'zhilian';
  if ((host === 'liepin.com' || host === 'www.liepin.com') && /^\/job\/\d+\.shtml$/i.test(url.pathname)) return 'liepin';
  return null;
}

export interface SiteResumeBindingService {
  list(input: ListSiteResumeBindingsInput): Promise<ListSiteResumeBindingsOutput>;
  create(input: CreateSiteResumeBindingInput): Promise<SiteResumeBinding>;
  revoke(bindingId: string, input: { idempotencyKey: string }): Promise<SiteResumeBinding>;
}

export function createSiteResumeBindingService(
  resume: ResumeRuntimePorts,
  store: SiteResumeBindingStorePort,
  validation: Pick<BrowserExtensionValidationRegistry, 'get'> | null,
  options: { now?: () => string; idFactory?: () => string } = {},
): SiteResumeBindingService {
  const now = options.now ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? randomUUID;

  return {
    async list(raw) {
      const input = ListSiteResumeBindingsInputSchema.parse(raw);
      return ListSiteResumeBindingsOutputSchema.parse({ items: await store.list(input) });
    },

    async create(raw) {
      const input = CreateSiteResumeBindingInputSchema.parse(raw);
      if (!validation) throw new SiteResumeBindingError('INVALID_EVIDENCE', 'Browser Extension characterization is not configured on this Job Harness server');
      const run = validation.get(input.characterizationRunId);
      const isSiteReadonlyEvidence = run?.mode === 'site-readonly' || run?.mode === 'site-staged-readonly';
      if (!run || !isSiteReadonlyEvidence || !run.characterization || run.writeCount !== 0) {
        throw new SiteResumeBindingError('INVALID_EVIDENCE', `CharacterizationRun '${input.characterizationRunId}' is missing, expired, not a read-only site characterization, or has no completed site evidence`);
      }
      if (run.agentId !== input.browserAgentId) {
        throw new SiteResumeBindingError('INVALID_EVIDENCE', `CharacterizationRun '${run.id}' belongs to browser agent '${run.agentId}', not '${input.browserAgentId}'`);
      }
      const observedFamily = familyFromUrl(run.characterization.currentUrl);
      if (observedFamily !== input.siteFamily) {
        throw new SiteResumeBindingError('INVALID_EVIDENCE', `CharacterizationRun '${run.id}' observed '${observedFamily ?? 'unsupported'}', not '${input.siteFamily}'`);
      }
      const requestedLabel = normalized(input.externalResumeLabel);
      const observedLabels = new Set(run.characterization.controls.flatMap((control) => control.optionLabels.map(normalized)).filter(Boolean));
      if (!observedLabels.has(requestedLabel)) {
        throw new SiteResumeBindingError('INVALID_EVIDENCE', `Resume label '${requestedLabel}' was not observed in CharacterizationRun '${run.id}'`);
      }

      const profile = await resume.getProfileContext(input.profileId);
      if (!profile) throw new SiteResumeBindingError('NOT_FOUND', `ResumeProfile '${input.profileId}' was not found`);
      let selectedRevisionId: string;
      let selectedArtifactId: string;
      if (input.resumeRevisionId && input.resumeArtifactId) {
        const detail = await resume.getRevisionDetail(input.resumeRevisionId);
        if (!detail || detail.revision.profileId !== input.profileId) {
          throw new SiteResumeBindingError('CONFLICT', `ResumeRevision '${input.resumeRevisionId}' does not belong to ResumeProfile '${input.profileId}'`);
        }
        const pdf = detail.artifacts.find((artifact) => artifact.id === input.resumeArtifactId
          && artifact.revisionId === detail.revision.id
          && artifact.kind === 'pdf'
          && artifact.mimeType === 'application/pdf') ?? null;
        if (!pdf) {
          throw new SiteResumeBindingError('CONFLICT', `ResumeArtifact '${input.resumeArtifactId}' is not the requested immutable PDF for ResumeRevision '${input.resumeRevisionId}'`);
        }
        selectedRevisionId = detail.revision.id;
        selectedArtifactId = pdf.id;
      } else {
        const revisions = await resume.listRevisions(input.profileId);
        const latest = [...revisions.items].sort((left, right) => right.revisionNumber - left.revisionNumber)[0] ?? null;
        if (!latest) throw new SiteResumeBindingError('CONFLICT', `ResumeProfile '${input.profileId}' has no immutable Revision to bind`);
        const detail = await resume.getRevisionDetail(latest.id);
        const pdf = detail?.artifacts
          .filter((artifact) => artifact.kind === 'pdf' && artifact.mimeType === 'application/pdf')
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
        if (!pdf) throw new SiteResumeBindingError('CONFLICT', `ResumeRevision '${latest.id}' has no immutable PDF Artifact to bind`);
        selectedRevisionId = latest.id;
        selectedArtifactId = pdf.id;
      }

      const requestHash = hash({
        siteFamily: input.siteFamily,
        browserAgentId: input.browserAgentId,
        profileId: input.profileId,
        resumeRevisionId: selectedRevisionId,
        resumeArtifactId: selectedArtifactId,
        externalResumeLabel: requestedLabel,
        characterizationRunId: run.id,
        characterizationFormStateHash: run.characterization.formStateHash,
      });
      const existing = await store.findByIdempotencyKey(input.siteFamily, input.browserAgentId, input.idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new SiteResumeBindingError('CONFLICT', `Site resume binding idempotency key '${input.idempotencyKey}' was reused with different input`);
        return existing;
      }
      const createdAt = now();
      try {
        return SiteResumeBindingSchema.parse(await store.insert({
          id: `site-resume-binding-${idFactory()}`,
          siteFamily: input.siteFamily,
          browserAgentId: input.browserAgentId,
          profileId: input.profileId,
          resumeRevisionId: selectedRevisionId,
          resumeArtifactId: selectedArtifactId,
          externalResumeLabel: requestedLabel,
          assurance: 'user-confirmed-label',
          characterizationRunId: run.id,
          characterizationFormStateHash: run.characterization.formStateHash,
          characterizationObservedAt: run.characterization.observedAt,
          status: 'active',
          createdAt,
          updatedAt: createdAt,
          revokedAt: null,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          revokeIdempotencyKey: null,
          revokeRequestHash: null,
        }));
      } catch (error) {
        throw new SiteResumeBindingError('CONFLICT', error instanceof Error ? error.message : String(error));
      }
    },

    async revoke(bindingId, raw) {
      const input = RevokeSiteResumeBindingInputSchema.parse(raw);
      const current = await store.get(bindingId);
      if (!current) throw new SiteResumeBindingError('NOT_FOUND', `SiteResumeBinding '${bindingId}' was not found`);
      const requestHash = hash({ bindingId });
      try { return await store.revoke(bindingId, { now: now(), idempotencyKey: input.idempotencyKey, requestHash }); }
      catch (error) { throw new SiteResumeBindingError('CONFLICT', error instanceof Error ? error.message : String(error)); }
    },
  };
}

function sendError(res: Response, error: unknown): void {
  if (writeCommonRestError(res, error)) return;
  if (error instanceof SiteResumeBindingError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422;
    writeRestError(res, status, error.code, error.message);
    return;
  }
  if (error instanceof BrowserExtensionBridgeError) {
    writeRestError(res, error.status, error.code, error.message);
    return;
  }
  writeInternalRestError(res);
}
function route(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => { void handler(req, res).catch((error) => sendError(res, error)); };
}

export function registerSiteResumeBindingApi(app: Express, service: SiteResumeBindingService, apiPrefix: string): void {
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.siteResumeBindings, route(async (req, res) => {
    res.json(await service.list({
      ...(typeof req.query.siteFamily === 'string' ? { siteFamily: req.query.siteFamily } : {}),
      ...(typeof req.query.browserAgentId === 'string' ? { browserAgentId: req.query.browserAgentId } : {}),
      ...(typeof req.query.profileId === 'string' ? { profileId: req.query.profileId } : {}),
      includeRevoked: req.query.includeRevoked === 'true',
    } as ListSiteResumeBindingsInput));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.createSiteResumeBinding, route(async (req, res) => {
    res.status(201).json(await service.create(CreateSiteResumeBindingInputSchema.parse(req.body ?? {})));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.revokeSiteResumeBinding, route(async (req, res) => {
    res.json(await service.revoke(String(req.params.bindingId ?? '').trim(), RevokeSiteResumeBindingInputSchema.parse(req.body ?? {})));
  }));
}
