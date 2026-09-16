import Link from 'next/link';
import type { AnalyticsSnapshot } from '@job-harness/contracts';
import type { MessageCatalog } from '@/i18n';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDate, formatDateTime } from '@/lib/format';
import type { ManagementSearchParams } from './campaigns-workspace';

function one(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function scoped(path: string, campaignId: string | undefined, params: Record<string,string> = {}) { const q=new URLSearchParams(params); if(campaignId) q.set('campaign',campaignId); return `${path}${q.size?`?${q}`:''}`; }

function StateGrid({ snapshot, campaignId, messages }: { snapshot: AnalyticsSnapshot; campaignId?: string; messages: MessageCatalog }) {
  const jobs = messages.analyticsWorkspace.jobs;
  const applications = messages.analyticsWorkspace.applications;
  const jobStates = [
    ['discovered', jobs.discovered], ['shortlisted', jobs.shortlisted], ['ignored', jobs.ignored], ['closed', jobs.closed], ['archived', jobs.archived],
  ] as const;
  const appStages = [
    ['applied', applications.applied], ['screening', applications.screening], ['assessment', applications.assessment], ['interview', applications.interview], ['offer', applications.offer], ['rejected', applications.rejected], ['withdrawn', applications.withdrawn],
  ] as const;
  return (
    <div className="analytics-state-pair">
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><h2>{jobs.title}</h2></div><div className="analytics-state-grid">{jobStates.map(([state,label]) => <Link key={state} href={scoped('/jobs',campaignId,{state})}><strong>{snapshot.pipeline.jobsByState[state]}</strong><span>{label}</span></Link>)}</div></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><h2>{applications.title}</h2></div><div className="analytics-state-grid analytics-stage-grid">{appStages.map(([stage,label]) => <Link key={stage} href={scoped('/applications',campaignId,{stage,terminal: stage==='rejected'||stage==='withdrawn'?'include':'exclude'})}><strong>{snapshot.pipeline.applicationsByStage[stage]}</strong><span>{label}</span></Link>)}</div></section>
    </div>
  );
}

export async function AnalyticsWorkspace({ searchParams }: { searchParams: ManagementSearchParams }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const client = getJobHarnessClient();
  const requested = one(searchParams.campaign)?.trim() || undefined;
  const campaigns = await client.campaigns.list({ limit: 200, offset: 0 });
  const selected = requested ? campaigns.items.find((campaign) => campaign.id === requested) ?? null : null;
  const campaignId = selected?.id;
  const snapshot = await client.workspace.getAnalyticsSnapshot({ ...(campaignId ? { campaignId } : {}) });
  const copy = messages.analyticsWorkspace;
  const activeJobs = snapshot.pipeline.jobsByState.discovered + snapshot.pipeline.jobsByState.shortlisted;
  const activePipeline = snapshot.pipeline.applicationsByStage.applied + snapshot.pipeline.applicationsByStage.screening + snapshot.pipeline.applicationsByStage.assessment + snapshot.pipeline.applicationsByStage.interview;

  return (
    <div className="workspace-page analytics-page">
      <WorkspaceHeader title={messages.pages.analytics.title} description={messages.pages.analytics.description} actions={<span className="workspace-result-count">{copy.generatedAt} {formatDateTime(locale,snapshot.generatedAt)}</span>} />
      <div className="dashboard-content">
        <form className="management-filter-bar analytics-filter-bar" method="get" action="/analytics">
          <label className="filter-field"><span>{copy.filters.campaign}</span><select name="campaign" defaultValue={campaignId ?? ''}><option value="">{copy.filters.all}</option>{campaigns.items.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          <button className="filter-submit" type="submit">{copy.filters.apply}</button><Link className="filter-reset" href="/analytics">{copy.filters.reset}</Link>
        </form>
        <section className="management-kpi-grid management-kpi-grid-four">
          <div><strong>{snapshot.pipeline.knownJobs}</strong><span>{copy.summary.knownJobs}</span></div>
          <div><strong>{snapshot.pipeline.applications}</strong><span>{copy.summary.applications}</span></div>
          <div><strong>{activeJobs}</strong><span>{copy.summary.activeJobs}</span></div>
          <div><strong>{activePipeline}</strong><span>{copy.summary.activePipeline}</span></div>
        </section>
        <StateGrid snapshot={snapshot} messages={messages} {...(campaignId ? { campaignId } : {})} />

        <div className="dashboard-two-column analytics-comparison-grid">
          <section className="dashboard-panel"><div className="dashboard-panel-heading"><h2>{copy.companies.title}</h2></div>{snapshot.companyPerformance.length ? <div className="dashboard-compact-table-wrap"><table className="dashboard-compact-table"><thead><tr><th>{copy.companies.company}</th><th>{copy.companies.jobs}</th><th>{copy.companies.applications}</th><th>{copy.companies.screening}</th><th>{copy.companies.interview}</th><th>{copy.companies.offer}</th></tr></thead><tbody>{snapshot.companyPerformance.slice(0,15).map((item)=><tr key={item.companyId}><td><Link className="text-link" href={scoped('/companies',campaignId,{company:item.companyId})}>{item.companyName}</Link></td><td>{item.jobs}</td><td>{item.applications}</td><td>{item.applicationsByStage.screening}</td><td>{item.applicationsByStage.interview}</td><td>{item.applicationsByStage.offer}</td></tr>)}</tbody></table></div>:<p className="dashboard-empty-copy">{copy.companies.empty}</p>}</section>
          <section className="dashboard-panel"><div className="dashboard-panel-heading"><h2>{copy.campaigns.title}</h2></div>{snapshot.campaignPerformance.length ? <div className="dashboard-compact-table-wrap"><table className="dashboard-compact-table"><thead><tr><th>{copy.campaigns.campaign}</th><th>{copy.campaigns.jobs}</th><th>{copy.campaigns.applications}</th><th>{copy.campaigns.screening}</th><th>{copy.campaigns.interview}</th><th>{copy.campaigns.offer}</th></tr></thead><tbody>{snapshot.campaignPerformance.map((item)=><tr key={item.campaign.id}><td><Link className="text-link" href={`/analytics?campaign=${encodeURIComponent(item.campaign.id)}`}>{item.campaign.name}</Link></td><td>{item.jobs}</td><td>{item.applications}</td><td>{item.applicationsByStage.screening}</td><td>{item.applicationsByStage.interview}</td><td>{item.applicationsByStage.offer}</td></tr>)}</tbody></table></div>:<p className="dashboard-empty-copy">{copy.campaigns.empty}</p>}</section>
        </div>

        <div className="dashboard-two-column analytics-comparison-grid">
          <section className="dashboard-panel"><div className="dashboard-panel-heading"><h2>{copy.sources.title}</h2></div>{snapshot.sourcePerformance.length ? <div className="dashboard-compact-table-wrap"><table className="dashboard-compact-table"><thead><tr><th>{copy.sources.source}</th><th>{copy.sources.jobs}</th><th>{copy.sources.applications}</th><th>{copy.sources.screening}</th><th>{copy.sources.interview}</th></tr></thead><tbody>{snapshot.sourcePerformance.map((item)=><tr key={item.sourceKind}><td><Link className="text-link" href={scoped('/jobs',campaignId,{source:item.sourceKind})}>{messages.jobsWorkspace.sourceKinds[item.sourceKind]}</Link></td><td>{item.opportunities}</td><td>{item.applications}</td><td>{item.applicationsByStage.screening}</td><td>{item.applicationsByStage.interview}</td></tr>)}</tbody></table></div>:<p className="dashboard-empty-copy">{copy.sources.empty}</p>}<p className="dashboard-note">{copy.sources.note}</p></section>
          <section className="dashboard-panel"><div className="dashboard-panel-heading"><h2>{copy.resumes.title}</h2></div>{snapshot.resumeUsage.length ? <div className="dashboard-compact-table-wrap"><table className="dashboard-compact-table"><thead><tr><th>{copy.resumes.resume}</th><th>{copy.resumes.applications}</th><th>{copy.resumes.screening}</th><th>{copy.resumes.assessment}</th><th>{copy.resumes.interview}</th><th>{copy.resumes.offer}</th></tr></thead><tbody>{[...snapshot.resumeUsage].sort((a,b)=>b.applications-a.applications).map((item)=><tr key={item.resume.id}><td><Link className="text-link" href={scoped('/resumes',campaignId,{resume:item.resume.id})}>{item.resume.name}</Link></td><td>{item.applications}</td><td>{item.applicationsByStage.screening}</td><td>{item.applicationsByStage.assessment}</td><td>{item.applicationsByStage.interview}</td><td>{item.applicationsByStage.offer}</td></tr>)}</tbody></table></div>:<p className="dashboard-empty-copy">{copy.resumes.empty}</p>}<p className="dashboard-note">{copy.resumes.note}</p></section>
        </div>
      </div>
    </div>
  );
}
