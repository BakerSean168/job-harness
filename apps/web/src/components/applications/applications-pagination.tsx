import Link from 'next/link';
import type { MessageCatalog } from '@/i18n';
import { applicationsHref, type ApplicationsSearchParams } from './query';

export function ApplicationsPagination({
  params,
  offset,
  limit,
  total,
  messages,
}: {
  params: ApplicationsSearchParams;
  offset: number;
  limit: number;
  total: number;
  messages: MessageCatalog;
}) {
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(total, offset + limit);
  const previous = Math.max(0, offset - limit);
  const next = offset + limit;
  const copy = messages.jobsWorkspace.pagination;
  return (
    <div className="jobs-pagination">
      <span>{copy.showing} {start}–{end} / {total}</span>
      <div className="pagination-actions">
        {offset > 0
          ? <Link href={applicationsHref(params, { offset: previous, application: null })}>{copy.previous}</Link>
          : <span aria-disabled="true">{copy.previous}</span>}
        {next < total
          ? <Link href={applicationsHref(params, { offset: next, application: null })}>{copy.next}</Link>
          : <span aria-disabled="true">{copy.next}</span>}
      </div>
    </div>
  );
}
