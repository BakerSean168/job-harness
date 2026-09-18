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
