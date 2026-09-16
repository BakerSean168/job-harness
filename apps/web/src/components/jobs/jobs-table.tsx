import Link from 'next/link';
import type { JobListItem } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { formatDate } from '@/lib/format';
import { StatusBadge } from './status-badge';
import { workspaceHref, type WorkspaceSearchParams } from './query';

export function JobsTable({
  items,
  pathname,
  params,
  selectedJobId,
  locale,
  messages,
}: {
  items: JobListItem[];
  pathname: string;
  params: WorkspaceSearchParams;
  selectedJobId?: string;
  locale: Locale;
  messages: MessageCatalog;
}) {
  const copy = messages.jobsWorkspace;
  return (
    <div className="jobs-table-scroll">
      <table className="jobs-table">
        <thead>
          <tr>
            <th>{copy.table.opportunity}</th>
            <th>{copy.table.city}</th>
            <th>{copy.table.state}</th>
            <th>{copy.table.application}</th>
            <th>{copy.table.source}</th>
            <th>{copy.table.resume}</th>
            <th className="numeric-cell">{copy.table.listings}</th>
            <th>{copy.table.lastSeen}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td className="table-empty" colSpan={8}>{copy.table.noResults}</td></tr>
          ) : items.map((item) => {
            const href = workspaceHref(pathname, params, { job: item.jobId });
            return (
              <tr key={item.jobId} data-selected={selectedJobId === item.jobId ? 'true' : undefined}>
                <td className="opportunity-cell">
                  <Link href={href} scroll={false} className="opportunity-link">
                    <strong>{item.title}</strong>
                    <span>{item.companyName}</span>
                  </Link>
                </td>
                <td className="muted-cell">{item.city ?? '—'}</td>
                <td><StatusBadge value={item.state} label={copy.states[item.state]} /></td>
                <td>
                  {item.application
                    ? <StatusBadge value={item.application.currentStage} label={copy.applicationStages[item.application.currentStage]} />
                    : <span className="empty-value">—</span>}
                </td>
                <td>
                  {item.primaryListing
                    ? <span className="source-label">{copy.sourceKinds[item.primaryListing.sourceKind]}</span>
                    : <span className="empty-value">—</span>}
                </td>
                <td className="muted-cell resume-cell" title={item.resume?.name}>{item.resume?.name ?? '—'}</td>
                <td className="numeric-cell">{item.listingCount}</td>
                <td className="muted-cell nowrap-cell">{formatDate(locale, item.lastSeenAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
