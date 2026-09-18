import { createHash } from 'node:crypto';
import type {
  ClaimEmailApplicationSendOutput,
  EmailApplicationPackageDetail,
  EmailSendAuthorization,
} from '@job-harness/contracts';
import type { ResumeRevisionDetail } from '@job-harness/resume-contracts';

export interface EmailProviderSendInput {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly attachment: { readonly fileName: string; readonly mimeType: 'application/pdf'; readonly bytes: Uint8Array };
}

export interface EmailProviderSendResult {
  readonly messageId: string;
  readonly threadId?: string | null;
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
}

export interface EmailProviderPort {
  readonly providerEvidence: 'gmail' | 'outlook' | 'other';
  readonly from: string;
  verify(): Promise<void>;
  send(input: EmailProviderSendInput): Promise<EmailProviderSendResult>;
}

export interface EmailDeliveryClientPort {
  emailApplications: {
    listSendAuthorizations(limit?: number): Promise<{ items: EmailSendAuthorization[] }>;
    get(packageId: string): Promise<EmailApplicationPackageDetail | null>;
    claimSend(packageId: string, input: { authorizationId: string; draftHash: string; occurredAt: string }): Promise<ClaimEmailApplicationSendOutput>;
    confirm(packageId: string, input: { draftHash: string; provider: 'gmail' | 'outlook' | 'other'; messageId: string; threadId?: string | null; sentAt: string }): Promise<unknown>;
    fail(packageId: string, input: { draftHash: string; occurredAt: string; outcome: 'external_failed' | 'needs_manual_review'; error: string; provider?: 'gmail' | 'outlook' | 'other' | null; evidence?: Record<string, unknown> }): Promise<unknown>;
  };
  resume: {
    getRevision(revisionId: string): Promise<ResumeRevisionDetail | null>;
    downloadArtifact(artifactId: string): Promise<Uint8Array>;
  };
}

export interface EmailDeliveryWorkerOptions {
  readonly client: EmailDeliveryClientPort;
  readonly provider: EmailProviderPort;
  readonly batchLimit?: number;
  readonly now?: () => string;
  readonly logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface EmailDeliveryRunResult {
  readonly scanned: number;
  readonly sent: number;
  readonly failed: number;
  readonly manualReview: number;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 900) || 'unknown email delivery error';
}

function canonicalMailbox(value: string): string {
  return value.trim().toLowerCase();
}

export class EmailDeliveryWorker {
  private readonly client: EmailDeliveryClientPort;
  private readonly provider: EmailProviderPort;
  private readonly batchLimit: number;
  private readonly now: () => string;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(options: EmailDeliveryWorkerOptions) {
    this.client = options.client;
    this.provider = options.provider;
    this.batchLimit = Math.min(100, Math.max(1, options.batchLimit ?? 10));
    this.now = options.now ?? (() => new Date().toISOString());
    this.logger = options.logger ?? console;
  }

  async runOnce(): Promise<EmailDeliveryRunResult> {
    const authorizations = await this.client.emailApplications.listSendAuthorizations(this.batchLimit);
    let sent = 0;
    let failed = 0;
    let manualReview = 0;
    for (const authorization of authorizations.items) {
      const outcome = await this.processAuthorization(authorization).catch((error) => {
        this.logger.error('Email worker authorization processing failed before a send was claimed', safeError(error));
        return 'failed-pre-boundary' as const;
      });
      if (outcome === 'sent') sent += 1;
      else if (outcome === 'manual-review') manualReview += 1;
      else if (outcome === 'failed') failed += 1;
    }
    return { scanned: authorizations.items.length, sent, failed, manualReview };
  }

  private async processAuthorization(authorization: EmailSendAuthorization): Promise<'sent' | 'failed' | 'manual-review' | 'failed-pre-boundary'> {
    const detail = await this.client.emailApplications.get(authorization.packageId);
    if (!detail) throw new Error(`EmailApplicationPackage '${authorization.packageId}' disappeared before delivery`);
    const pkg = detail.package;
    if (detail.intent.status !== 'planned') throw new Error(`Email SubmissionIntent '${detail.intent.id}' is '${detail.intent.status}', expected 'planned'`);
    if (pkg.draftHash !== authorization.draftHash) throw new Error('Active email send authorization no longer matches the immutable draft hash');

    const revision = await this.client.resume.getRevision(pkg.resumeRevisionId);
    if (!revision) throw new Error(`ResumeRevision '${pkg.resumeRevisionId}' was not found`);
    const artifact = revision.artifacts.find((candidate) => candidate.id === pkg.resumeArtifactId) ?? null;
    if (!artifact || artifact.kind !== 'pdf' || artifact.mimeType !== 'application/pdf') throw new Error('Email package no longer points to an immutable PDF Resume Artifact');
    const bytes = await this.client.resume.downloadArtifact(pkg.resumeArtifactId);
    if (bytes.byteLength !== artifact.byteSize) throw new Error('Resume Artifact byte-size mismatch before email send');
    if (digest(bytes) !== artifact.sha256.toLowerCase()) throw new Error('Resume Artifact SHA-256 mismatch before email send');

    // Provider connectivity/auth and immutable payload verification happen before
    // the authorization is consumed. Failures here cannot cause an external send.
    await this.provider.verify();
    const occurredAt = this.now();
    await this.client.emailApplications.claimSend(pkg.id, {
      authorizationId: authorization.id,
      draftHash: pkg.draftHash,
      occurredAt,
    });

    // From here onward the external-effect boundary is crossed. Never call send()
    // a second time for this authorization, regardless of provider/network errors.
    let providerResult: EmailProviderSendResult;
    try {
      providerResult = await this.provider.send({
        from: this.provider.from,
        to: pkg.recipient,
        subject: pkg.subject,
        text: pkg.body,
        attachment: { fileName: pkg.attachmentFileName, mimeType: 'application/pdf', bytes },
      });
    } catch (error) {
      const summary = safeError(error);
      await this.client.emailApplications.fail(pkg.id, {
        draftHash: pkg.draftHash,
        occurredAt: this.now(),
        outcome: 'needs_manual_review',
        error: `SMTP result uncertain after send boundary: ${summary}`,
        provider: this.provider.providerEvidence,
        evidence: { phase: 'provider-send', authorizationId: authorization.id },
      }).catch((reportError) => this.logger.error('Email worker could not persist uncertain send result', safeError(reportError)));
      return 'manual-review';
    }

    const accepted = providerResult.accepted.map(canonicalMailbox);
    const recipient = canonicalMailbox(pkg.recipient);
    if (!providerResult.messageId || !accepted.includes(recipient)) {
      await this.client.emailApplications.fail(pkg.id, {
        draftHash: pkg.draftHash,
        occurredAt: this.now(),
        outcome: 'external_failed',
        error: `SMTP provider explicitly did not accept recipient '${pkg.recipient}'`,
        provider: this.provider.providerEvidence,
        evidence: { phase: 'provider-response', authorizationId: authorization.id, rejected: [...providerResult.rejected] },
      });
      return 'failed';
    }

    const sentAt = this.now();
    let confirmationError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.client.emailApplications.confirm(pkg.id, {
          draftHash: pkg.draftHash,
          provider: this.provider.providerEvidence,
          messageId: providerResult.messageId,
          ...(providerResult.threadId !== undefined ? { threadId: providerResult.threadId } : {}),
          sentAt,
        });
        return 'sent';
      } catch (error) {
        confirmationError = error;
      }
    }
    this.logger.error('Email was accepted by provider but Job Harness confirmation failed; will not resend', safeError(confirmationError));
    await this.client.emailApplications.fail(pkg.id, {
      draftHash: pkg.draftHash,
      occurredAt: this.now(),
      outcome: 'needs_manual_review',
      error: `Provider accepted email (${providerResult.messageId}) but durable confirmation failed: ${safeError(confirmationError)}`,
      provider: this.provider.providerEvidence,
      evidence: { phase: 'post-send-confirmation', authorizationId: authorization.id, messageId: providerResult.messageId },
    }).catch(() => undefined);
    return 'manual-review';
  }
}
