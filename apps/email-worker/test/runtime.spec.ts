import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { EmailApplicationPackageDetail, EmailSendAuthorization } from '@job-harness/contracts';
import type { ResumeRevisionDetail } from '@job-harness/resume-contracts';
import { EmailDeliveryWorker, type EmailDeliveryClientPort, type EmailProviderPort } from '../src/runtime';

const at = '2026-09-18T08:00:00.000Z';
const bytes = new TextEncoder().encode('%PDF-1.4\nfixture');
const sha = createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const authorization: EmailSendAuthorization = {
    id: 'email-auth-1', packageId: 'email-package-1', draftHash: 'd'.repeat(64), status: 'active',
    issuedAt: at, expiresAt: '2026-09-18T08:05:00.000Z', consumedAt: null, revokedAt: null,
    idempotencyKey: 'auth-1', requestHash: 'e'.repeat(64),
  };
  const detail = {
    package: {
      id: 'email-package-1', intentId: 'intent-1', jobId: 'job-1', listingId: 'listing-1', recipient: 'jobs@example.test',
      subject: '应聘 Agent 工程师', body: '您好，附上简历。', draftHash: authorization.draftHash,
      resumeProfileId: 'ai-agent-forgeflow', resumeRevisionId: 'resume-rev-1', resumeArtifactId: 'resume-artifact-1',
      attachmentFileName: 'candidate.pdf', idempotencyKey: 'package-1', createdAt: at,
    },
    intent: {
      id: 'intent-1', jobId: 'job-1', listingId: 'listing-1', channel: 'email', resumeProfileId: 'ai-agent-forgeflow', resumeRevisionId: 'resume-rev-1', resumeArtifactId: 'resume-artifact-1',
      executor: 'chatgpt-web', executorSessionId: null, externalTargetUrl: null, status: 'planned', externalStartedAt: null, externalConfirmedAt: null,
      appliedAt: null, externalReference: null, externalEvidence: {}, applicationId: null, submissionId: null, retryCount: 0, lastError: null,
      idempotencyKey: 'intent-1', note: null, createdAt: at, updatedAt: at,
    },
  } as unknown as EmailApplicationPackageDetail;
  const revision = {
    artifacts: [{
      id: 'resume-artifact-1', revisionId: 'resume-rev-1', kind: 'pdf', mimeType: 'application/pdf', storageUri: 'memory://resume-artifact-1',
      sha256: sha, byteSize: bytes.byteLength, rendererId: 'fixture', rendererVersion: '1', createdAt: at,
    }],
  } as unknown as ResumeRevisionDetail;
  return { authorization, detail, revision };
}

function harness(options: { sendError?: Error; reject?: boolean; confirmError?: Error } = {}) {
  const f = fixture();
  const events: string[] = [];
  let active = true;
  let sendCalls = 0;
  let confirmCalls = 0;
  const client: EmailDeliveryClientPort = {
    emailApplications: {
      async listSendAuthorizations() { events.push('list'); return { items: active ? [f.authorization] : [] }; },
      async get() { events.push('get'); return f.detail; },
      async claimSend() {
        events.push('claim'); active = false;
        return { authorization: { ...f.authorization, status: 'consumed', consumedAt: at }, intent: { ...f.detail.intent, status: 'external_in_progress', externalStartedAt: at } } as any;
      },
      async confirm() { events.push('confirm'); confirmCalls += 1; if (options.confirmError) throw options.confirmError; return {}; },
      async fail(_packageId, input) { events.push(`fail:${input.outcome}`); return {}; },
    },
    resume: {
      async getRevision() { events.push('revision'); return f.revision; },
      async downloadArtifact() { events.push('download'); return bytes; },
    },
  };
  const provider: EmailProviderPort = {
    providerEvidence: 'gmail',
    from: 'Candidate <candidate@example.test>',
    async verify() { events.push('verify'); },
    async send() {
      events.push('send'); sendCalls += 1;
      if (options.sendError) throw options.sendError;
      return options.reject
        ? { messageId: '<rejected@example.test>', accepted: [], rejected: ['jobs@example.test'] }
        : { messageId: '<sent@example.test>', accepted: ['jobs@example.test'], rejected: [] };
    },
  };
  let tick = 0;
  const worker = new EmailDeliveryWorker({ client, provider, now: () => `2026-09-18T08:00:0${tick++}.000Z`, logger: { info() {}, warn() {}, error() {} } });
  return { worker, events, get sendCalls() { return sendCalls; }, get confirmCalls() { return confirmCalls; } };
}

describe('EmailDeliveryWorker external-effect ordering', () => {
  it('verifies immutable PDF and provider before claim, then sends once and confirms Message-ID', async () => {
    const h = harness();
    await expect(h.worker.runOnce()).resolves.toEqual({ scanned: 1, sent: 1, failed: 0, manualReview: 0 });
    expect(h.events).toEqual(['list','get','revision','download','verify','claim','send','confirm']);
    expect(h.sendCalls).toBe(1);
    await expect(h.worker.runOnce()).resolves.toEqual({ scanned: 0, sent: 0, failed: 0, manualReview: 0 });
    expect(h.sendCalls).toBe(1);
  });

  it('never retries provider send after the boundary when the SMTP result is uncertain', async () => {
    const h = harness({ sendError: new Error('socket closed after DATA') });
    await expect(h.worker.runOnce()).resolves.toEqual({ scanned: 1, sent: 0, failed: 0, manualReview: 1 });
    expect(h.events).toEqual(['list','get','revision','download','verify','claim','send','fail:needs_manual_review']);
    expect(h.sendCalls).toBe(1);
  });

  it('records explicit recipient rejection as external_failed without a resend', async () => {
    const h = harness({ reject: true });
    await expect(h.worker.runOnce()).resolves.toEqual({ scanned: 1, sent: 0, failed: 1, manualReview: 0 });
    expect(h.events).toEqual(['list','get','revision','download','verify','claim','send','fail:external_failed']);
    expect(h.sendCalls).toBe(1);
  });

  it('retries only durable confirmation after provider acceptance and never calls send twice', async () => {
    const h = harness({ confirmError: new Error('Job Harness unavailable') });
    await expect(h.worker.runOnce()).resolves.toEqual({ scanned: 1, sent: 0, failed: 0, manualReview: 1 });
    expect(h.sendCalls).toBe(1);
    expect(h.confirmCalls).toBe(3);
    expect(h.events.filter((event) => event === 'send')).toHaveLength(1);
    expect(h.events.at(-1)).toBe('fail:needs_manual_review');
  });
});
