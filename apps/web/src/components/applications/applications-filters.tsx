import Link from 'next/link';
import { APPLICATION_STAGES } from '@job-harness/domain';
import type { JobSearchCampaign, ResumeUsageSummary } from '@job-harness/contracts';
import type { MessageCatalog } from '@/i18n';
import { one, type ApplicationsSearchParams } from './query';

export function ApplicationsFilters({
  params,
  campaigns,
  resumes,
  messages,
}: {
  params: ApplicationsSearchParams;
  campaigns: readonly JobSearchCampaign[];
  resumes: readonly ResumeUsageSummary[];
  messages: MessageCatalog;
}) {
  const copy = messages.applicationsWorkspace.filters;
  const view = one(params.view) === 'table' ? 'table' : 'board';
  return (
    <form className="applications-filter-bar" method="get">
      <input type="hidden" name="view" value={view} />
      <label className="filter-field filter-field-wide">
        <span>{copy.company}</span>
        <input name="company" defaultValue={one(params.company) ?? ''} />
      </label>
      <label className="filter-field">
        <span>{copy.stage}</span>
        <select name="stage" defaultValue={one(params.stage) ?? ''}>
          <option value="">{copy.any}</option>
          {APPLICATION_STAGES.map((stage) => (
            <option key={stage} value={stage}>{messages.jobsWorkspace.applicationStages[stage]}</option>
          ))}
        </select>
      </label>
      <label className="filter-field">
        <span>{copy.campaign}</span>
        <select name="campaign" defaultValue={one(params.campaign) ?? ''}>
          <option value="">{copy.any}</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
      </label>
      <label className="filter-field">
        <span>{copy.resume}</span>
        <select name="resume" defaultValue={one(params.resume) ?? ''}>
          <option value="">{copy.any}</option>
          {resumes.map(({ resume }) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}
        </select>
      </label>
      <label className="filter-field">
        <span>{copy.terminal}</span>
        <select name="terminal" defaultValue={one(params.terminal) ?? 'exclude'}>
          <option value="exclude">{copy.activeOnly}</option>
          <option value="include">{copy.includeTerminal}</option>
          <option value="only">{copy.terminalOnly}</option>
        </select>
      </label>
      <label className="filter-field applications-date-filter">
        <span>{copy.appliedFrom}</span>
        <input type="date" name="from" defaultValue={one(params.from) ?? ''} />
      </label>
      <label className="filter-field applications-date-filter">
        <span>{copy.appliedTo}</span>
        <input type="date" name="to" defaultValue={one(params.to) ?? ''} />
      </label>
      <div className="filter-actions">
        <button className="filter-submit" type="submit">{copy.apply}</button>
        <Link className="filter-reset" href={`/applications?view=${view}`}>{copy.reset}</Link>
      </div>
    </form>
  );
}
