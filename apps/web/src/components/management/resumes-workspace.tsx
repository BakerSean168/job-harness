import Link from 'next/link';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDate, formatDateTime } from '@/lib/format';
import type { ManagementSearchParams } from './campaigns-workspace';

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function ResumesWorkspace({ searchParams }: { searchParams: ManagementSearchParams }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const client = getJobHarnessClient();
  const campaignId = one(searchParams.campaign)?.trim() || undefined;
  const [campaignPage, usage] = await Promise.all([
    client.campaigns.list({ limit: 200, offset: 0 }),
    client.workspace.listResumeUsage({ limit: 200, offset: 0, ...(campaignId ? { campaignId } : {}) }),
  ]);
  const copy = messages.resumesWorkspace;
  const used = usage.items.filter((item) => item.applications > 0).length;
  const applications = usage.items.reduce((sum, item) => sum + item.applications, 0);
  const missing = usage.items.filter((item) => !item.resume.artifactUri).length;

  return (
    <div className="workspace-page management-page">
      <WorkspaceHeader title={messages.pages.resumes.title} description={messages.pages.resumes.description} />
      <div className="management-content">
        <form className="management-filter-bar" method="get" action="/resumes">
          <label className="filter-field">
            <span>{copy.filters.campaign}</span>
            <select name="campaign" defaultValue={campaignId ?? ''}>
              <option value="">{copy.filters.all}</option>
              {campaignPage.items.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          <button className="filter-submit" type="submit">{copy.filters.apply}</button>
          <Link className="filter-reset" href="/resumes">{copy.filters.reset}</Link>
        </form>

        <section className="management-kpi-grid management-kpi-grid-four">
          <div><strong>{usage.total}</strong><span>{copy.summary.registry}</span></div>
          <div><strong>{used}</strong><span>{copy.summary.used}</span></div>
          <div><strong>{applications}</strong><span>{copy.summary.applications}</span></div>
          <div><strong>{missing}</strong><span>{copy.summary.missingArtifact}</span></div>
        </section>

        <section className="management-panel">
          <div className="management-table-scroll">
            <table className="management-table resume-registry-table">
              <thead><tr>
                <th>{copy.table.resume}</th><th>{copy.table.targetRole}</th><th>{copy.table.version}</th><th>{copy.table.applications}</th>
                <th>{copy.table.screening}</th><th>{copy.table.assessment}</th><th>{copy.table.interview}</th><th>{copy.table.offer}</th>
                <th>{copy.table.lastUsed}</th><th>{copy.table.artifact}</th><th>{copy.table.updated}</th><th />
              </tr></thead>
              <tbody>
                {usage.items.length ? usage.items.map((item) => (
                  <tr key={item.resume.id}>
                    <td><strong>{item.resume.name}</strong><small>{item.resume.source}</small></td>
                    <td>{item.resume.targetRole ?? '—'}</td>
                    <td>{item.resume.version ?? '—'}</td>
                    <td>{item.applications}</td>
                    <td>{item.applicationsByStage.screening}</td>
                    <td>{item.applicationsByStage.assessment}</td>
                    <td>{item.applicationsByStage.interview}</td>
                    <td>{item.applicationsByStage.offer}</td>
                    <td>{item.lastUsedAt ? formatDate(locale, item.lastUsedAt) : '—'}</td>
                    <td><span className="artifact-state" data-state={item.resume.artifactUri ? 'linked' : 'missing'}>{item.resume.artifactUri ? copy.table.linked : copy.table.missing}</span></td>
                    <td>{formatDateTime(locale, item.resume.updatedAt)}</td>
                    <td><Link className="text-link nowrap-cell" href={`/applications?resume=${encodeURIComponent(item.resume.id)}${campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : ''}`}>{copy.table.viewApplications}</Link></td>
                  </tr>
                )) : <tr><td className="table-empty" colSpan={12}>{copy.table.empty}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="management-note">{copy.note}</p>
        </section>
      </div>
    </div>
  );
}
