import Link from 'next/link';
import { DiscoveryExecutorSchema, type ListDiscoveryRunsInput } from '@job-harness/contracts';
import { DISCOVERY_EXECUTORS } from '@job-harness/domain';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDateTime } from '@/lib/format';
import type { ManagementSearchParams } from './campaigns-workspace';
import { DiscoverySidePanel } from './discovery-side-panel';

function one(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function offset(value: string | undefined): number { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0; }
function href(params: ManagementSearchParams, updates: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) for (const value of Array.isArray(raw) ? raw : raw == null ? [] : [raw]) query.append(key, value);
  for (const [key, value] of Object.entries(updates)) { query.delete(key); if (value !== null && value !== undefined && String(value) !== '') query.set(key, String(value)); }
  return `/discovery${query.size ? `?${query}` : ''}`;
}

export async function DiscoveryWorkspace({ searchParams }: { searchParams: ManagementSearchParams }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const client = getJobHarnessClient();
  const campaignId = one(searchParams.campaign)?.trim() || undefined;
  const executorRaw = one(searchParams.executor)?.trim();
  const executor = executorRaw ? DiscoveryExecutorSchema.safeParse(executorRaw) : null;
  const currentOffset = offset(one(searchParams.offset));
  const selectedRunId = one(searchParams.run)?.trim() || undefined;
  const input: ListDiscoveryRunsInput = {
    limit: 50,
    offset: currentOffset,
    ...(campaignId ? { campaignId } : {}),
    ...(executor?.success ? { executor: executor.data } : {}),
  };
  const [page, campaignPage, detail] = await Promise.all([
    client.workspace.listDiscoveryRuns(input),
    client.campaigns.list({ limit: 200, offset: 0 }),
    selectedRunId ? client.workspace.getDiscoveryRunDetail(selectedRunId) : Promise.resolve(null),
  ]);
  const copy = messages.discoveryWorkspace;
  const closeHref = href(searchParams, { run: null });

  return (
    <div className="workspace-page management-page">
      <WorkspaceHeader title={messages.pages.discovery.title} description={messages.pages.discovery.description} actions={<span className="workspace-result-count">{page.total} {copy.list.runs}</span>} />
      <div className="management-content">
        <form className="management-filter-bar" method="get" action="/discovery">
          <label className="filter-field"><span>{copy.filters.campaign}</span><select name="campaign" defaultValue={campaignId ?? ''}><option value="">{copy.filters.all}</option>{campaignPage.items.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          <label className="filter-field"><span>{copy.filters.executor}</span><select name="executor" defaultValue={executor?.success ? executor.data : ''}><option value="">{copy.filters.all}</option>{DISCOVERY_EXECUTORS.map((value) => <option key={value} value={value}>{copy.executors[value]}</option>)}</select></label>
          <button className="filter-submit" type="submit">{copy.filters.apply}</button>
          <Link className="filter-reset" href="/discovery">{copy.filters.reset}</Link>
        </form>

        <section className="management-panel discovery-run-table-panel">
          <div className="management-table-scroll">
            <table className="management-table discovery-run-table">
              <thead><tr><th>{copy.list.started}</th><th>{copy.list.campaign}</th><th>{copy.list.executor}</th><th>{copy.list.candidates}</th><th>{copy.list.inserted}</th><th>{copy.list.duplicates}</th><th>{copy.list.rejected}</th><th /></tr></thead>
              <tbody>{page.items.length ? page.items.map(({ run, campaign }) => (
                <tr key={run.id} data-selected={selectedRunId === run.id ? 'true' : undefined}>
                  <td><Link className="discovery-run-link" href={href(searchParams, { run: run.id })} scroll={false}><strong>{formatDateTime(locale, run.startedAt)}</strong><span>{run.completedAt ? copy.list.completed : copy.list.running}</span></Link></td>
                  <td>{campaign?.name ?? copy.detail.noCampaign}</td>
                  <td>{copy.executors[run.executor]}</td>
                  <td>{run.candidateCount}</td><td>{run.insertedCount}</td><td>{run.duplicateCount}</td><td>{run.rejectedCount}</td>
                  <td><Link className="text-link nowrap-cell" href={`/discovery/${encodeURIComponent(run.id)}`}>{copy.detail.full}</Link></td>
                </tr>
              )) : <tr><td colSpan={8} className="table-empty">{copy.list.empty}</td></tr>}</tbody>
            </table>
          </div>
          <div className="jobs-pagination"><span>{page.total === 0 ? 0 : currentOffset + 1}–{Math.min(page.total, currentOffset + 50)} / {page.total}</span><div className="pagination-actions">{currentOffset > 0 ? <Link href={href(searchParams, { offset: Math.max(0, currentOffset - 50), run: null })}>←</Link> : <span aria-disabled="true">←</span>}{currentOffset + 50 < page.total ? <Link href={href(searchParams, { offset: currentOffset + 50, run: null })}>→</Link> : <span aria-disabled="true">→</span>}</div></div>
        </section>
      </div>
      {detail ? <DiscoverySidePanel detail={detail} closeHref={closeHref} locale={locale} messages={messages} /> : null}
    </div>
  );
}
