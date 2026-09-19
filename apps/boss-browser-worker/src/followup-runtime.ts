import type { BossBridgeClient } from './bridge-client';
import type { BossInspectedConversation, BossOutreachExtensionClient } from './outreach-extension';
import { buildBossLegacyJobText } from './runtime';

export interface BossFollowupRunOptions {
  readonly bridge: BossBridgeClient;
  readonly outreach: Pick<BossOutreachExtensionClient, 'inspectUnreadChats' | 'inspectJobDetail' | 'sendResumeFollowup'>;
  readonly profileId: string;
  readonly threshold?: number;
  readonly maxContacts?: number;
  readonly logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

export interface BossFollowupRunResult {
  readonly inspected: number;
  readonly policyAuthorized: number;
  readonly resumesSent: number;
  readonly skipped: number;
  readonly items: readonly {
    readonly recruiter: string | null;
    readonly company: string | null;
    readonly jobUrl: string | null;
    readonly title: string | null;
    readonly score: number | null;
    readonly resumeIndex: number | null;
    readonly status: string;
    readonly reason: string | null;
  }[];
}

export async function runBossResumeFollowup(options: BossFollowupRunOptions): Promise<BossFollowupRunResult> {
  const logger = options.logger ?? console;
  const threshold = integer(options.threshold ?? 58, 0, 100, 'threshold');
  const maxContacts = integer(options.maxContacts ?? 30, 1, 100, 'maxContacts');
  const conversations = await options.outreach.inspectUnreadChats(maxContacts);
  const items: BossFollowupRunResult['items'][number][] = [];
  let policyAuthorized = 0;
  let resumesSent = 0;

  for (const conversation of conversations) {
    const base = baseItem(conversation);
    if (conversation.snapshot.latestRole !== 'user') {
      items.push({ ...base, title: conversation.snapshot.title, score: null, resumeIndex: null, status: 'skipped', reason: 'latest-not-recruiter' });
      continue;
    }
    if (conversation.snapshot.resumeSended) {
      items.push({ ...base, title: conversation.snapshot.title, score: null, resumeIndex: null, status: 'skipped', reason: 'already-sent' });
      continue;
    }
    const jobUrl = conversation.snapshot.jobUrl;
    if (!jobUrl) {
      items.push({ ...base, title: conversation.snapshot.title, score: null, resumeIndex: null, status: 'skipped', reason: 'missing-job-url' });
      continue;
    }

    try {
      const detail = await options.outreach.inspectJobDetail(jobUrl);
      const decision = await options.bridge.score(options.profileId, buildBossLegacyJobText(detail.title, detail.salary, detail.detail));
      const policy = await options.bridge.authorizeResumeFollowup(options.profileId, {
        msgs: conversation.snapshot.messages,
        needResume: conversation.snapshot.needResume,
        resumeSended: conversation.snapshot.resumeSended,
        title: detail.title,
        company: detail.company ?? conversation.contact.company,
        salary: detail.salary,
        score: decision.score,
        resumeIndex: decision.resumeIndex,
      });
      await options.bridge.logAction(options.profileId, {
        action: policy.need ? 'resume_followup_policy_authorized' : 'resume_followup_policy_denied',
        scene: 'browser-bridge-followup',
        jobUrl,
        title: detail.title,
        company: detail.company ?? conversation.contact.company,
        salary: detail.salary,
        score: decision.score,
        threshold,
        resumeIndex: decision.resumeIndex,
        profileId: decision.profileId,
        reason: policy.reason,
      });

      if (!policy.need) {
        items.push({ ...base, jobUrl, title: detail.title, score: decision.score, resumeIndex: decision.resumeIndex, status: 'skipped', reason: policy.reason });
        continue;
      }
      if (policy.reason !== 'explicit-request' && policy.reason !== 'qualified-followup') {
        throw new Error('BOSS bridge returned an invalid resume-followup authorization reason');
      }

      policyAuthorized += 1;
      const sent = await options.outreach.sendResumeFollowup({
        jobUrl,
        resumeIndex: decision.resumeIndex,
        score: decision.score,
        threshold,
        authorizationReason: policy.reason,
      });
      const success = sent.status === 'sent';
      if (success) resumesSent += 1;
      await options.bridge.logAction(options.profileId, {
        action: success ? 'resume_sent' : 'resume_followup_not_sent',
        scene: 'browser-bridge-followup',
        jobUrl,
        title: detail.title,
        company: detail.company ?? conversation.contact.company,
        salary: detail.salary,
        score: decision.score,
        resumeIndex: decision.resumeIndex,
        profileId: decision.profileId,
        sendStatus: sent.status,
        reason: 'reason' in sent ? sent.reason ?? null : null,
      });
      items.push({
        ...base,
        jobUrl,
        title: detail.title,
        score: decision.score,
        resumeIndex: decision.resumeIndex,
        status: sent.status,
        reason: 'reason' in sent ? sent.reason ?? null : null,
      });
    } catch (error) {
      const reason = sanitizeError(error);
      logger.warn('BOSS resume follow-up failed closed', reason);
      items.push({ ...base, jobUrl, title: conversation.snapshot.title, score: null, resumeIndex: null, status: 'failed', reason });
    }
  }

  return {
    inspected: conversations.length,
    policyAuthorized,
    resumesSent,
    skipped: items.filter((item) => item.status !== 'sent').length,
    items,
  };
}

function baseItem(conversation: BossInspectedConversation) {
  return {
    recruiter: conversation.snapshot.recruiter ?? conversation.contact.recruiter,
    company: conversation.snapshot.company ?? conversation.contact.company,
    jobUrl: conversation.snapshot.jobUrl,
  };
}

function integer(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(name + ' must be an integer between ' + min + ' and ' + max);
  return value;
}

function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}
