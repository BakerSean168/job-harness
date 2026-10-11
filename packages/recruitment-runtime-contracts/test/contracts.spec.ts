import { describe, expect, it } from 'vitest';
import {
  RecruitmentRuntimeDescriptorSchema,
  RecruitmentRuntimeTaskSchema,
  RecruitmentRuntimeEventSchema,
} from '../src';

describe('Recruitment Runtime contracts', () => {
  it('describes a coarse upstream-backed BOSS runtime without DOM primitives', () => {
    const descriptor = RecruitmentRuntimeDescriptorSchema.parse({
      runtimeId: 'boss-czc-good-job',
      runtimeVersion: 'e07bf4cb663d+jh',
      site: 'boss',
      implementation: 'upstream-direct',
      upstream: {
        project: 'czc-good-job',
        repository: 'https://github.com/czc6666/czc-good-job.git',
        commit: 'e07bf4cb663d9531864ca22eb6195b77e064c3b5',
        license: 'MIT',
      },
      capabilities: ['discovery', 'inspect-job', 'outreach-greeting', 'recruiter-inbox', 'resume-followup'],
      browserProfile: 'dedicated',
      controlGranularity: 'business-task',
    });
    expect(descriptor.controlGranularity).toBe('business-task');
    expect(descriptor.capabilities).not.toContain('click');
    expect(descriptor.capabilities).not.toContain('fill');
  });

  it('requires explicit business policy for external-effect tasks', () => {
    const base = {
      id: 'task-1',
      runtimeId: 'boss-czc-good-job',
      site: 'boss',
      kind: 'outreach-greeting',
      campaignId: 'campaign-1',
      jobId: null,
      listingId: null,
      resumeProfileId: null,
      resumeArtifactId: null,
      targetUrl: null,
      createdAt: '2026-09-20T06:00:00.000Z',
      expiresAt: null,
      idempotencyKey: 'boss-campaign-1-run-1',
    };
    expect(() => RecruitmentRuntimeTaskSchema.parse({
      ...base,
      policy: { collect: true, greeting: false, maxExternalEffects: 0 },
    })).toThrow(/greeting=true/);

    const task = RecruitmentRuntimeTaskSchema.parse({
      ...base,
      policy: { collect: true, greeting: true, recruiterInbox: true, resumeFollowup: true, maxExternalEffects: 20 },
    });
    expect(task.policy.finalSubmit).toBe(false);
    expect(task.policy.maxExternalEffects).toBe(20);
  });

  it('marks externally visible runtime events explicitly', () => {
    const event = RecruitmentRuntimeEventSchema.parse({
      eventId: 'event-1',
      taskId: 'task-1',
      runtimeId: 'boss-czc-good-job',
      site: 'boss',
      type: 'greeting-sent',
      occurredAt: '2026-09-20T06:01:00.000Z',
      jobId: 'job-1',
      listingId: 'listing-1',
      externalEffect: true,
      evidence: { sourceAction: 'greet_sent' },
    });
    expect(event.externalEffect).toBe(true);
  });
});
