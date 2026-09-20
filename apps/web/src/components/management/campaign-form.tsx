'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { JobSearchCampaign, ResumeUsageSummary } from '@job-harness/contracts';
import { CAMPAIGN_STATUSES, JOB_SOURCE_KINDS } from '@job-harness/domain';
import type { MessageCatalog } from '@/i18n';
import { initialCampaignActionState, saveCampaignAction } from '@/app/campaigns/actions';

function joined(values: readonly (string | number)[]): string {
  return values.join(', ');
}

export function CampaignForm({
  campaignId,
  campaign,
  resumes,
  messages,
}: {
  campaignId: string;
  campaign: JobSearchCampaign | null;
  resumes: readonly ResumeUsageSummary[];
  messages: MessageCatalog;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveCampaignAction, initialCampaignActionState);
  const copy = messages.campaignsWorkspace;

  useEffect(() => {
    if (state.ok && state.id) router.replace(`/campaigns?campaign=${encodeURIComponent(state.id)}`);
  }, [router, state]);

  return (
    <form className="campaign-editor-form" action={action}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="management-panel-heading">
        <h2>{campaign ? copy.form.titleEdit : copy.form.titleNew}</h2>
        <span>{campaign ? copy.status[campaign.status] : copy.status.active}</span>
      </div>
      <div className="campaign-editor-fields">
        <label className="management-field">
          <span>{copy.form.name}</span>
          <input name="name" defaultValue={campaign?.name ?? ''} required />
        </label>
        <label className="management-field">
          <span>{copy.form.targetRoles}</span>
          <textarea name="targetRoles" rows={3} defaultValue={joined(campaign?.targetRoles ?? [])} required />
          <small>{copy.form.targetRolesHint}</small>
        </label>
        <div className="management-field-grid">
          <label className="management-field"><span>{copy.form.cities}</span><input name="cities" defaultValue={joined(campaign?.cities ?? [])} /></label>
          <label className="management-field"><span>{copy.form.graduationYears}</span><input name="graduationYears" defaultValue={joined(campaign?.graduationYears ?? [])} /></label>
        </div>
        <label className="management-field"><span>{copy.form.experience}</span><input name="experience" defaultValue={joined(campaign?.experience ?? [])} /></label>
        <label className="management-field"><span>{copy.form.education}</span><input name="education" defaultValue={joined(campaign?.education ?? [])} /></label>
        <label className="management-field"><span>{copy.form.keywords}</span><textarea name="keywords" rows={2} defaultValue={joined(campaign?.keywords ?? [])} /></label>
        <label className="management-field"><span>{copy.form.exclusions}</span><textarea name="exclusions" rows={2} defaultValue={joined(campaign?.exclusions ?? [])} /></label>

        <fieldset className="management-choice-group">
          <legend>{copy.form.sources}</legend>
          <div className="management-choice-grid">
            {JOB_SOURCE_KINDS.map((source) => (
              <label key={source}>
                <input type="checkbox" name="sources" value={source} defaultChecked={campaign?.sources.includes(source) ?? false} />
                <span>{messages.jobsWorkspace.sourceKinds[source]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="management-choice-group">
          <legend>{copy.form.resumes}</legend>
          {resumes.length ? (
            <div className="management-choice-grid management-choice-grid-resumes">
              {resumes.map(({ resume }) => (
                <label key={resume.id}>
                  <input type="checkbox" name="resumeProfileIds" value={resume.id} defaultChecked={campaign?.resumeProfileIds.includes(resume.id) ?? false} />
                  <span>{resume.name}</span>
                </label>
              ))}
            </div>
          ) : <p className="management-muted">{messages.resumesWorkspace.table.empty}</p>}
        </fieldset>

        <fieldset className="management-choice-group campaign-automation-group">
          <legend>{copy.form.automation}</legend>
          <p className="management-muted">{copy.form.automationHint}</p>
          <div className="management-choice-grid">
            <label>
              <input type="checkbox" name="automationCollectionEnabled" defaultChecked={campaign?.automation.collection.enabled ?? true} />
              <span>{copy.form.collectionEnabled}</span>
            </label>
          </div>
          <div className="management-field-grid">
            <div className="management-field">
              <strong>{copy.form.outreach}</strong>
              <label><input type="checkbox" name="automationOutreachEnabled" defaultChecked={campaign?.automation.outreach.enabled ?? true} /> <span>{copy.form.outreachEnabled}</span></label>
              <label><input type="checkbox" name="automationOutreachAutoStartEnabled" defaultChecked={campaign?.automation.outreach.autoStartEnabled ?? false} /> <span>{copy.form.outreachAutoStartEnabled}</span></label>
              <label><input type="checkbox" name="automationOutreachGreetingEnabled" defaultChecked={campaign?.automation.outreach.greetingEnabled ?? true} /> <span>{copy.form.outreachGreetingEnabled}</span></label>
              <label><input type="checkbox" name="automationOutreachRecruiterInboxEnabled" defaultChecked={campaign?.automation.outreach.recruiterInboxEnabled ?? true} /> <span>{copy.form.outreachRecruiterInboxEnabled}</span></label>
              <label><input type="checkbox" name="automationOutreachResumeFollowupEnabled" defaultChecked={campaign?.automation.outreach.resumeFollowupEnabled ?? true} /> <span>{copy.form.outreachResumeFollowupEnabled}</span></label>
              <span>{copy.form.outreachMaxExternalEffectsPerRun}</span>
              <input type="number" name="automationOutreachMaxExternalEffectsPerRun" min="0" max="500" defaultValue={campaign?.automation.outreach.maxExternalEffectsPerRun ?? 20} />
            </div>
            <div className="management-field">
              <strong>{copy.form.officialSite}</strong>
              <label><input type="checkbox" name="automationOfficialPrepareEnabled" defaultChecked={campaign?.automation.officialSite.prepareEnabled ?? true} /> <span>{copy.form.officialPrepareEnabled}</span></label>
              <label><input type="checkbox" name="automationOfficialFillEnabled" defaultChecked={campaign?.automation.officialSite.fillEnabled ?? true} /> <span>{copy.form.officialFillEnabled}</span></label>
              <label><input type="checkbox" name="automationOfficialSubmitEnabled" defaultChecked={campaign?.automation.officialSite.submitEnabled ?? false} /> <span>{copy.form.officialSubmitEnabled}</span></label>
              <span>{copy.form.preferredResume}</span>
              <select name="automationOfficialResumeProfileId" defaultValue={campaign?.automation.officialSite.preferredResumeProfileId ?? ''}>
                <option value="">{copy.form.recommendedResume}</option>
                {resumes.map(({ resume }) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}
              </select>
            </div>
            <div className="management-field">
              <strong>{copy.form.email}</strong>
              <label><input type="checkbox" name="automationEmailDraftEnabled" defaultChecked={campaign?.automation.email.draftEnabled ?? true} /> <span>{copy.form.emailDraftEnabled}</span></label>
              <label><input type="checkbox" name="automationEmailSendEnabled" defaultChecked={campaign?.automation.email.sendEnabled ?? false} /> <span>{copy.form.emailSendEnabled}</span></label>
              <span>{copy.form.preferredResume}</span>
              <select name="automationEmailResumeProfileId" defaultValue={campaign?.automation.email.preferredResumeProfileId ?? ''}>
                <option value="">{copy.form.recommendedResume}</option>
                {resumes.map(({ resume }) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}
              </select>
            </div>
          </div>
        </fieldset>

        <label className="management-field management-field-small">
          <span>{copy.form.status}</span>
          <select name="status" defaultValue={campaign?.status ?? 'active'}>
            {CAMPAIGN_STATUSES.map((status) => <option key={status} value={status}>{copy.status[status]}</option>)}
          </select>
        </label>
      </div>
      <div className="campaign-editor-footer">
        {state.ok ? <span className="management-success">{copy.form.saved}</span> : state.message ? <span className="management-error">{state.code === 'VALIDATION_ERROR' ? copy.form.required : copy.form.failed}: {state.message}</span> : <span />}
        <button className="filter-submit" type="submit" disabled={pending}>{pending ? copy.form.saving : copy.form.save}</button>
      </div>
    </form>
  );
}
