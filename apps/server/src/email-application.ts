import { createHash, randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { ApplicantRuntimePorts } from '@job-harness/applicant-application';
import type { CareerRuntimePorts } from '@job-harness/application';
import {
  CareerApplicationError,
  CareerConflictError,
  CareerNotFoundError,
} from '@job-harness/application';
import {
  AuthorizeEmailApplicationSendInputSchema,
  ClaimEmailApplicationSendInputSchema,
  ClaimEmailApplicationSendOutputSchema,
  EmailSendAuthorizationSchema,
  ListEmailSendAuthorizationsInputSchema,
  ListEmailSendAuthorizationsOutputSchema,
  BeginEmailApplicationSendInputSchema,
  ConfirmEmailApplicationSendInputSchema,
  ConfirmEmailApplicationSendOutputSchema,
  EmailApplicationPackageDetailSchema,
  EmailApplicationPackageSchema,
  FailEmailApplicationSendInputSchema,
  JOB_HARNESS_REST_V1_ROUTES,
  PrepareEmailApplicationInputSchema,
  type AuthorizeEmailApplicationSendInput,
  type ClaimEmailApplicationSendInput,
  type ClaimEmailApplicationSendOutput,
  type EmailSendAuthorization,
  type BeginEmailApplicationSendInput,
  type ConfirmEmailApplicationSendInput,
  type ConfirmEmailApplicationSendOutput,
  type EmailApplicationPackage,
  type EmailApplicationPackageDetail,
  type FailEmailApplicationSendInput,
  type PrepareEmailApplicationInput,
  type SubmissionIntent,
} from '@job-harness/contracts';
import type { EmailApplicationPackageStorePort } from '@job-harness/persistence-sqlite';
import type { ResumeRuntimePorts } from '@job-harness/resume-application';
import type { JobResumePreparationService } from './job-resume';
import { registerRestV1Route } from './rest-route';
import { writeCommonRestError, writeInternalRestError, writeRestError } from './http-errors';

export class EmailApplicationNotFoundError extends Error {
  constructor(readonly packageId: string) {
    super(`EmailApplicationPackage '${packageId}' was not found`);
    this.name = 'EmailApplicationNotFoundError';
  }
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function localized(value: Record<string, string> | null | undefined): string {
  if (!value) return '';
  return value['zh-CN'] ?? value.en ?? Object.values(value)[0] ?? '';
}

function attachmentName(candidate: string | null | undefined, displayName: string, title: string): string {
  const raw = (candidate?.trim() || `${displayName}-${title}`).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return `${raw.replace(/\.pdf$/i, '') || 'resume'}.pdf`;
}

function metadataRecipient(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).contactEmail;
  if (typeof candidate !== 'string') return null;
  const parsed = z.email().safeParse(candidate.trim());
  return parsed.success ? parsed.data : null;
}

function buildEmailCopy(input: {
  readonly company: string;
  readonly title: string;
  readonly displayName: string;
  readonly school: string | null;
  readonly major: string | null;
  readonly targetRole: string;
  readonly signals: readonly string[];
  readonly email: string | null;
  readonly phone: string | null;
}): { subject: string; body: string } {
  const subject = `应聘${input.title} - ${input.displayName}`;
  const identity = [input.school, input.major].filter(Boolean).join(' · ');
  const lines = [
    `您好，我是${input.displayName}${identity ? `，来自${identity}` : ''}。`,
    '',
    `了解到贵司正在招聘「${input.title}」，我目前主要关注${input.targetRole || input.title}方向。`,
    input.signals.length ? `相关实践覆盖：${input.signals.slice(0, 4).join('、')}。` : '',
    `现附上个人简历，希望有机会进一步沟通${input.company ? `并了解${input.company}的岗位情况` : ''}。`,
    '',
    '感谢您的时间，期待回复。',
    '',
    input.displayName,
    input.email ? `邮箱：${input.email}` : '',
    input.phone ? `电话：${input.phone}` : '',
  ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== ''));
  return { subject, body: lines.join('\n').trim() };
}

export interface EmailApplicationService {
  prepare(jobId: string, input: PrepareEmailApplicationInput): Promise<EmailApplicationPackageDetail>;
  get(packageId: string): Promise<EmailApplicationPackageDetail>;
  authorizeSend(packageId: string, input: AuthorizeEmailApplicationSendInput): Promise<EmailSendAuthorization>;
  listSendAuthorizations(limit?: number): Promise<{ items: EmailSendAuthorization[] }>;
  claimSend(packageId: string, input: ClaimEmailApplicationSendInput): Promise<ClaimEmailApplicationSendOutput>;
  beginSend(packageId: string, input: BeginEmailApplicationSendInput): Promise<SubmissionIntent>;
  confirm(packageId: string, input: ConfirmEmailApplicationSendInput): Promise<ConfirmEmailApplicationSendOutput>;
  fail(packageId: string, input: FailEmailApplicationSendInput): Promise<EmailApplicationPackageDetail>;
}

export function createEmailApplicationService(
  career: CareerRuntimePorts,
  resume: ResumeRuntimePorts,
  applicant: ApplicantRuntimePorts,
  jobResume: JobResumePreparationService,
  store: EmailApplicationPackageStorePort,
  options: { now?: () => string; idFactory?: () => string } = {},
): EmailApplicationService {
  const now = options.now ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? randomUUID;

  async function detail(value: EmailApplicationPackage): Promise<EmailApplicationPackageDetail> {
    const intent = await career.submissionIntents.get(value.intentId);
    if (!intent) throw new CareerNotFoundError('SubmissionIntent', value.intentId);
    return EmailApplicationPackageDetailSchema.parse({ package: value, intent });
  }

  async function load(packageId: string): Promise<EmailApplicationPackage> {
    const value = await store.get(packageId);
    if (!value) throw new EmailApplicationNotFoundError(packageId);
    return value;
  }

  function requireDraftHash(value: EmailApplicationPackage, draftHash: string): void {
    if (value.draftHash !== draftHash) {
      throw new CareerConflictError(`EmailApplicationPackage '${value.id}' draft hash no longer matches the authorized send request`);
    }
  }

  return {
    async prepare(jobId, raw) {
      const input = PrepareEmailApplicationInputSchema.parse(raw);
      const existing = await store.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return detail(existing);

      const job = await career.workspace.getJobDetail(jobId);
      if (!job) throw new CareerNotFoundError('Job', jobId);
      if (job.application) throw new CareerConflictError(`Job '${jobId}' already has an Application`);
      const listing = input.listingId
        ? job.job.listings.find((candidate) => candidate.id === input.listingId) ?? null
        : job.job.listings.find((candidate) => candidate.status === 'active' && candidate.sourceKind === 'email' && metadataRecipient(candidate.metadataSnapshot))
          ?? job.job.listings.find((candidate) => candidate.status === 'active' && metadataRecipient(candidate.metadataSnapshot))
          ?? job.primaryListing;
      if (!listing) throw new CareerConflictError(`Job '${jobId}' has no listing available for an email application`);
      const recipient = input.recipient ?? metadataRecipient(listing.metadataSnapshot);
      const validRecipient = z.email().safeParse(recipient);
      if (!validRecipient.success) throw new CareerConflictError(`JobListing '${listing.id}' has no valid recruiting contact email`);

      const prepared = await jobResume.prepare(jobId, {
        listingId: listing.id,
        preferredProfileId: input.preferredProfileId ?? null,
        channel: 'email',
        executor: 'chatgpt-web',
        idempotencyKey: `email-intent:${input.idempotencyKey}`,
        note: 'Prepared as an immutable email application package; external send requires a separate provider action.',
      });
      const applicantContext = await applicant.getDefaultProfile();
      if (!applicantContext) throw new CareerConflictError('Default Applicant Profile is required before preparing an email application');
      const profileContext = await resume.getProfileContext(prepared.selection.profileId);
      if (!profileContext) throw new CareerNotFoundError('ResumeProfile', prepared.selection.profileId);
      const revision = await resume.getRevisionDetail(prepared.intent.resumeRevisionId!);
      const artifact = revision?.artifacts.find((candidate) => candidate.id === prepared.intent.resumeArtifactId) ?? null;
      if (!artifact || artifact.kind !== 'pdf' || artifact.mimeType !== 'application/pdf') {
        throw new CareerConflictError('Email application requires the exact frozen PDF Resume Artifact');
      }
      const education = applicantContext.profile.education[0];
      const copy = buildEmailCopy({
        company: job.job.companyName,
        title: job.job.title,
        displayName: applicantContext.profile.displayName,
        school: education?.school ?? null,
        major: education?.major ?? null,
        targetRole: prepared.selection.targetRole,
        signals: prepared.selection.positiveSignals.map((item) => item.keyword),
        email: applicantContext.profile.email,
        phone: applicantContext.profile.phone,
      });
      const fileName = attachmentName(localized(profileContext.profile.output.pdfName), applicantContext.profile.displayName, job.job.title);
      const draftHash = sha256({
        recipient: validRecipient.data,
        subject: copy.subject,
        body: copy.body,
        resumeArtifactId: artifact.id,
        resumeArtifactSha256: artifact.sha256.toLowerCase(),
        attachmentFileName: fileName,
      });
      const value = EmailApplicationPackageSchema.parse({
        id: `email-package-${idFactory()}`,
        intentId: prepared.intent.id,
        jobId,
        listingId: listing.id,
        recipient: validRecipient.data,
        subject: copy.subject,
        body: copy.body,
        draftHash,
        resumeProfileId: prepared.selection.profileId,
        resumeRevisionId: prepared.intent.resumeRevisionId,
        resumeArtifactId: prepared.intent.resumeArtifactId,
        attachmentFileName: fileName,
        idempotencyKey: input.idempotencyKey,
        createdAt: now(),
      });
      try {
        return detail(await store.insert(value));
      } catch (error) {
        const raced = await store.findByIdempotencyKey(input.idempotencyKey);
        if (raced) return detail(raced);
        throw error;
      }
    },

    async get(packageId) { return detail(await load(packageId)); },

    async authorizeSend(packageId, raw) {
      const input = AuthorizeEmailApplicationSendInputSchema.parse(raw);
      const value = await load(packageId);
      requireDraftHash(value, input.draftHash);
      const intent = await career.submissionIntents.get(value.intentId);
      if (!intent) throw new CareerNotFoundError('SubmissionIntent', value.intentId);
      if (intent.status !== 'planned') throw new CareerConflictError(`Email SubmissionIntent '${intent.id}' is '${intent.status}', expected 'planned'`);
      const issuedAt = now();
      const requestHash = sha256({ packageId, draftHash: input.draftHash, expiresInSeconds: input.expiresInSeconds });
      try {
        return EmailSendAuthorizationSchema.parse(await store.issueAuthorization({
          id: `email-send-auth-${idFactory()}`,
          packageId,
          draftHash: value.draftHash,
          status: 'active',
          issuedAt,
          expiresAt: new Date(Date.parse(issuedAt) + input.expiresInSeconds * 1000).toISOString(),
          consumedAt: null,
          revokedAt: null,
          idempotencyKey: input.idempotencyKey,
          requestHash,
        }));
      } catch (error) {
        throw new CareerConflictError(error instanceof Error ? error.message : String(error));
      }
    },

    async listSendAuthorizations(limit = 20) {
      const parsed = ListEmailSendAuthorizationsInputSchema.parse({ limit });
      return ListEmailSendAuthorizationsOutputSchema.parse({ items: await store.listActiveAuthorizations(now(), parsed.limit) });
    },

    async claimSend(packageId, raw) {
      const input = ClaimEmailApplicationSendInputSchema.parse(raw);
      const value = await load(packageId);
      requireDraftHash(value, input.draftHash);
      const current = await career.submissionIntents.get(value.intentId);
      if (!current) throw new CareerNotFoundError('SubmissionIntent', value.intentId);
      if (current.status !== 'planned') throw new CareerConflictError(`Email SubmissionIntent '${current.id}' is '${current.status}', expected 'planned'`);
      let authorization: EmailSendAuthorization;
      try {
        authorization = await store.consumeAuthorization({ packageId, authorizationId: input.authorizationId, draftHash: input.draftHash, now: input.occurredAt });
      } catch (error) {
        throw new CareerConflictError(error instanceof Error ? error.message : String(error));
      }
      const intent = await career.submissionIntents.begin({ intentId: value.intentId, occurredAt: input.occurredAt });
      return ClaimEmailApplicationSendOutputSchema.parse({ authorization, intent });
    },

    async beginSend(packageId, raw) {
      const input = BeginEmailApplicationSendInputSchema.parse(raw);
      const value = await load(packageId);
      requireDraftHash(value, input.draftHash);
      return career.submissionIntents.begin({ intentId: value.intentId, occurredAt: input.occurredAt });
    },

    async confirm(packageId, raw) {
      const input = ConfirmEmailApplicationSendInputSchema.parse(raw);
      const value = await load(packageId);
      requireDraftHash(value, input.draftHash);
      const result = await career.submissionIntents.confirm({
        intentId: value.intentId,
        confirmedAt: input.sentAt,
        appliedAt: input.sentAt,
        externalReference: `${input.provider}:${input.messageId}`,
        externalEvidence: {
          channel: 'email',
          emailPackageId: value.id,
          draftHash: value.draftHash,
          provider: input.provider,
          messageId: input.messageId,
          threadId: input.threadId ?? null,
          recipient: value.recipient,
          resumeArtifactId: value.resumeArtifactId,
        },
      });
      return ConfirmEmailApplicationSendOutputSchema.parse({
        package: value,
        intent: result.intent,
        application: result.application,
        persistenceCommitted: result.persistenceCommitted,
      });
    },

    async fail(packageId, raw) {
      const input = FailEmailApplicationSendInputSchema.parse(raw);
      const value = await load(packageId);
      requireDraftHash(value, input.draftHash);
      await career.submissionIntents.fail({
        intentId: value.intentId,
        occurredAt: input.occurredAt,
        status: input.outcome,
        error: input.error,
        externalEvidence: {
          channel: 'email',
          emailPackageId: value.id,
          draftHash: value.draftHash,
          provider: input.provider ?? null,
          ...input.evidence,
        },
      });
      return detail(value);
    },
  };
}

function sendError(res: Response, error: unknown): void {
  if (writeCommonRestError(res, error)) return;
  if (error instanceof EmailApplicationNotFoundError || error instanceof CareerNotFoundError) {
    writeRestError(res, 404, 'NOT_FOUND', error.message); return;
  }
  if (error instanceof CareerConflictError) {
    writeRestError(res, 409, 'CONFLICT', error.message); return;
  }
  if (error instanceof CareerApplicationError) {
    writeRestError(res, 400, error.code, error.message); return;
  }
  writeInternalRestError(res);
}

function route(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => { void handler(req, res).catch((error) => sendError(res, error)); };
}

export function registerEmailApplicationApi(app: Express, service: EmailApplicationService, apiPrefix: string): void {
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.prepareEmailApplication, route(async (req, res) => {
    res.status(201).json(await service.prepare(String(req.params.jobId ?? '').trim(), PrepareEmailApplicationInputSchema.parse(req.body ?? {})));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.getEmailApplication, route(async (req, res) => {
    res.json(await service.get(String(req.params.packageId ?? '').trim()));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.authorizeEmailApplicationSend, route(async (req, res) => {
    res.status(201).json(await service.authorizeSend(String(req.params.packageId ?? '').trim(), AuthorizeEmailApplicationSendInputSchema.parse(req.body ?? {})));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.listEmailSendAuthorizations, route(async (req, res) => {
    const input = ListEmailSendAuthorizationsInputSchema.parse({ limit: Number(req.query.limit ?? 20) });
    res.json(await service.listSendAuthorizations(input.limit));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.claimEmailApplicationSend, route(async (req, res) => {
    res.json(await service.claimSend(String(req.params.packageId ?? '').trim(), ClaimEmailApplicationSendInputSchema.parse(req.body ?? {})));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.beginEmailApplicationSend, route(async (req, res) => {
    res.json(await service.beginSend(String(req.params.packageId ?? '').trim(), BeginEmailApplicationSendInputSchema.parse(req.body ?? {})));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.confirmEmailApplicationSend, route(async (req, res) => {
    res.json(await service.confirm(String(req.params.packageId ?? '').trim(), ConfirmEmailApplicationSendInputSchema.parse(req.body ?? {})));
  }));
  registerRestV1Route(app, apiPrefix, JOB_HARNESS_REST_V1_ROUTES.failEmailApplicationSend, route(async (req, res) => {
    res.json(await service.fail(String(req.params.packageId ?? '').trim(), FailEmailApplicationSendInputSchema.parse(req.body ?? {})));
  }));
}
