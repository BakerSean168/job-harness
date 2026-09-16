import Link from 'next/link';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDate } from '@/lib/format';
import type { ManagementSearchParams } from './campaigns-workspace';
import { CompanySidePanel } from './company-side-panel';

function one(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function numericOffset(value: string | undefined): number { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0; }
function companyHref(params: ManagementSearchParams, updates: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) for (const value of Array.isArray(raw) ? raw : raw == null ? [] : [raw]) query.append(key, value);
  for (const [key, value] of Object.entries(updates)) { query.delete(key); if (value !== null && value !== undefined && String(value) !== '') query.set(key, String(value)); }
  return `/companies${query.size ? `?${query}` : ''}`;
}

export async function CompaniesWorkspace({ searchParams }: { searchParams: ManagementSearchParams }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const client = getJobHarnessClient();
  const query = one(searchParams.q)?.trim() || undefined;
  const campaignId = one(searchParams.campaign)?.trim() || undefined;
  const offset = numericOffset(one(searchParams.offset));
  const selectedCompanyId = one(searchParams.company)?.trim() || undefined;
  const [page, campaigns, detail] = await Promise.all([
    client.workspace.listCompanies({ limit: 50, offset, ...(query ? { query } : {}), ...(campaignId ? { campaignId } : {}) }),
    client.campaigns.list({ limit: 200, offset: 0 }),
    selectedCompanyId ? client.workspace.getCompanyDetail(selectedCompanyId, campaignId) : Promise.resolve(null),
  ]);
  const copy = messages.companiesWorkspace;
  const closeHref = companyHref(searchParams, { company: null });

  return (
    <div className="workspace-page management-page">
      <WorkspaceHeader title={messages.pages.companies.title} description={messages.pages.companies.description} actions={<span className="workspace-result-count">{page.total}</span>} />
      <div className="management-content">
        <form className="management-filter-bar" method="get" action="/companies">
          <label className="filter-field filter-field-wide"><span>{copy.filters.query}</span><input name="q" defaultValue={query ?? ''} /></label>
          <label className="filter-field"><span>{copy.filters.campaign}</span><select name="campaign" defaultValue={campaignId ?? ''}><option value="">{copy.filters.all}</option>{campaigns.items.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          <button className="filter-submit" type="submit">{copy.filters.apply}</button><Link className="filter-reset" href="/companies">{copy.filters.reset}</Link>
        </form>
        <section className="management-panel">
          <div className="management-table-scroll"><table className="management-table company-table"><thead><tr>
            <th>{copy.table.company}</th><th>{copy.table.jobs}</th><th>{copy.table.shortlisted}</th><th>{copy.table.applications}</th><th>{copy.table.activePipeline}</th><th>{copy.table.cities}</th><th>{copy.table.sources}</th><th>{copy.table.lastSeen}</th>
          </tr></thead><tbody>{page.items.length ? page.items.map((item) => (
            <tr key={item.company.id} data-selected={selectedCompanyId === item.company.id ? 'true' : undefined}>
              <td><Link className="company-name-link" href={companyHref(searchParams, { company: item.company.id })} scroll={false}><strong>{item.company.name}</strong>{item.company.aliases.length ? <small>{item.company.aliases.slice(0, 2).join(' · ')}</small> : null}</Link></td>
              <td>{item.jobs}</td><td>{item.shortlisted}</td><td>{item.applications}</td><td>{item.activePipeline}</td>
              <td>{item.cities.slice(0, 3).join(' · ') || '—'}</td><td>{item.sourceKinds.slice(0, 3).map((source) => messages.jobsWorkspace.sourceKinds[source]).join(' · ') || '—'}</td><td>{item.lastSeenAt ? formatDate(locale, item.lastSeenAt) : '—'}</td>
            </tr>
          )) : <tr><td colSpan={8} className="table-empty">{copy.table.empty}</td></tr>}</tbody></table></div>
          <div className="jobs-pagination"><span>{page.total === 0 ? 0 : offset + 1}–{Math.min(page.total, offset + 50)} / {page.total}</span><div className="pagination-actions">{offset > 0 ? <Link href={companyHref(searchParams, { offset: Math.max(0, offset - 50), company: null })}>←</Link> : <span aria-disabled="true">←</span>}{offset + 50 < page.total ? <Link href={companyHref(searchParams, { offset: offset + 50, company: null })}>→</Link> : <span aria-disabled="true">→</span>}</div></div>
        </section>
      </div>
      {detail ? <CompanySidePanel detail={detail} closeHref={closeHref} locale={locale} messages={messages} /> : null}
    </div>
  );
}
