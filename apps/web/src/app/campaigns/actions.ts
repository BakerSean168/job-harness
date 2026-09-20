'use server';

import { revalidatePath } from 'next/cache';
import { UpsertCampaignInputSchema } from '@job-harness/contracts';
import { JobHarnessRestError } from '@job-harness/client';
import { getJobHarnessClient } from '../../lib/job-harness-client';

export interface CampaignActionState {
  ok: boolean;
  id?: string;
  code?: string;
  message?: string;
}

const initialCampaignActionState: CampaignActionState = { ok: false };
export { initialCampaignActionState };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function list(value: string): string[] {
  return [...new Set(value.split(/[\n,，;；]+/).map((item) => item.trim()).filter(Boolean))];
}

export async function saveCampaignAction(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const graduationYears = list(text(formData, 'graduationYears'))
    .map(Number)
    .filter((value) => Number.isInteger(value));
  const candidate = {
    id: text(formData, 'campaignId'),
    name: text(formData, 'name'),
    targetRoles: list(text(formData, 'targetRoles')),
    cities: list(text(formData, 'cities')),
    graduationYears,
    experience: list(text(formData, 'experience')),
    education: list(text(formData, 'education')),
    keywords: list(text(formData, 'keywords')),
    exclusions: list(text(formData, 'exclusions')),
    sources: formData.getAll('sources').filter((value): value is string => typeof value === 'string'),
    resumeProfileIds: formData.getAll('resumeProfileIds').filter((value): value is string => typeof value === 'string'),
    automation: {
      collection: { enabled: formData.get('automationCollectionEnabled') === 'on' },
      outreach: {
        enabled: formData.get('automationOutreachEnabled') === 'on',
        autoStartEnabled: formData.get('automationOutreachAutoStartEnabled') === 'on',
        greetingEnabled: formData.get('automationOutreachGreetingEnabled') === 'on',
        recruiterInboxEnabled: formData.get('automationOutreachRecruiterInboxEnabled') === 'on',
        resumeFollowupEnabled: formData.get('automationOutreachResumeFollowupEnabled') === 'on',
        maxExternalEffectsPerRun: Math.max(0, Math.min(500, Number.parseInt(text(formData, 'automationOutreachMaxExternalEffectsPerRun') || '20', 10) || 0)),
      },
      officialSite: {
        prepareEnabled: formData.get('automationOfficialPrepareEnabled') === 'on',
        fillEnabled: formData.get('automationOfficialFillEnabled') === 'on',
        submitEnabled: formData.get('automationOfficialSubmitEnabled') === 'on',
        preferredResumeProfileId: text(formData, 'automationOfficialResumeProfileId') || null,
      },
      email: {
        draftEnabled: formData.get('automationEmailDraftEnabled') === 'on',
        sendEnabled: formData.get('automationEmailSendEnabled') === 'on',
        preferredResumeProfileId: text(formData, 'automationEmailResumeProfileId') || null,
      },
    },
    status: text(formData, 'status'),
  };
  const parsed = UpsertCampaignInputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message ?? 'Request validation failed',
    };
  }

  try {
    const saved = await getJobHarnessClient().campaigns.upsert(parsed.data);
    revalidatePath('/campaigns');
    revalidatePath('/');
    revalidatePath('/jobs');
    revalidatePath('/applications');
    revalidatePath('/resumes');
    revalidatePath('/discovery');
    return { ok: true, id: saved.id };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof JobHarnessRestError ? error.payload.code : 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
