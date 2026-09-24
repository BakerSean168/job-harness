import type { BossBridgeClient } from './bridge-client';
import type { BossInspectedConversation, BossOutreachExtensionClient } from './outreach-extension';
import { buildBossLegacyJobText } from './runtime';

export interface BossFollowupRunOptions {
  readonly bridge: BossBridgeClient;
  readonly outreach: Pick<BossOutreachExtensionClient, 'inspectUnreadChats' | 'inspectJobDetail' | 'sendResumeFollowup'>;
  readonly profileId: string;
  readonly threshold?: number;
  readonly maxContacts?: number;
  readonly sendEnabled?: boolean;
  readonly includeReadChats?: boolean;
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
  const sendEnabled = options.sendEnabled === true;
  const includeReadChats = options.includeReadChats === true;
  const conversations = await options.outreach.inspectUnreadChats(maxContacts, includeReadChats);
  const items: BossFollowupRunResult['items'][number][] = [];
  let policyAuthorized = 0;
  let resumesSent = 0;

  for (const conversation of conversations) {
    const base = baseItem(conversation);
    if (conversation.snapshot.latestRole !== 'user') {
      items.push({ ...base, title: conversation.snapshot.title, score: null, resumeIndex: null, status: 'skipped', reason: 'latest-not-recruiter' });
      continue;
    }
    const jobUrl = conversation.snapshot.jobUrl;
    if (!jobUrl) {
      items.push({ ...base, title: conversation.snapshot.title, score: null, resumeIndex: null, status: 'skipped', reason: 'missing-job-url' });
      continue;
    }

    try {
      const detail = await options.outreach.inspectJobDetail(jobUrl);
      const decision = await options.bridge.resolveFollowupContext(options.profileId, {
        job: buildBossLegacyJobText(detail.title, detail.salary, detail.detail),
        company: detail.company ?? conversation.contact.company,
        city: detail.city,
        jobUrl,
      });
      const recruiterMessage = latestRecruiterText(conversation.snapshot.messages);
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
        action: 'recruiter_replied',
        scene: 'browser-bridge-followup',
        jobUrl,
        jobId: decision.jobId,
        listingId: decision.listingId,
        title: detail.title,
        company: detail.company ?? conversation.contact.company,
        city: detail.city,
        salary: detail.salary,
        score: decision.score,
        resumeIndex: decision.resumeIndex,
        message: recruiterMessage,
        intent: policy.intent,
        reason: policy.reason,
        resumeBindingSource: decision.resumeBindingSource,
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
        jobId: decision.jobId,
        listingId: decision.listingId,
        profileId: decision.profileId,
        reason: policy.reason,
        intent: policy.intent,
        resumeBindingSource: decision.resumeBindingSource,
      });

      if (!policy.need) {
        items.push({ ...base, jobUrl, title: detail.title, score: decision.score, resumeIndex: decision.resumeIndex, status: 'skipped', reason: policy.reason });
        continue;
      }
      if (policy.reason !== 'explicit-request' || policy.intent !== 'explicit-resume-request') {
        throw new Error('BOSS bridge returned an invalid unattended resume-followup authorization');
      }

      policyAuthorized += 1;
      if (!sendEnabled) {
        await options.bridge.logAction(options.profileId, {
          action: 'resume_followup_send_disabled',
          scene: 'browser-bridge-followup',
          jobUrl,
          jobId: decision.jobId,
          listingId: decision.listingId,
          title: detail.title,
          company: detail.company ?? conversation.contact.company,
          salary: detail.salary,
          score: decision.score,
          resumeIndex: decision.resumeIndex,
          profileId: decision.profileId,
          intent: policy.intent,
          reason: policy.reason,
          resumeBindingSource: decision.resumeBindingSource,
        });
        items.push({ ...base, jobUrl, title: detail.title, score: decision.score, resumeIndex: decision.resumeIndex, status: 'send-disabled', reason: 'send-disabled' });
        continue;
      }
      const sent = await options.outreach.sendResumeFollowup({
        jobUrl,
        resumeLabel: decision.profileLabel,
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
        jobId: decision.jobId,
        listingId: decision.listingId,
        profileId: decision.profileId,
        sendStatus: sent.status,
        intent: policy.intent,
        resumeBindingSource: decision.resumeBindingSource,
        reason: 'reason' in sent ? sent.reason ?? policy.reason : policy.reason,
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

function latestRecruiterText(messages: readonly { role: 'user' | 'assistant'; content: string }[]): string {
  const parts: string[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'user') break;
    const content = message.content.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (content) parts.unshift(content);
  }
  return parts.join(' ').slice(0, 4000);
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
