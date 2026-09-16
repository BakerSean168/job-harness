import Link from 'next/link';
import type { MessageCatalog } from '@/i18n';
import { workspaceHref, type WorkspaceSearchParams } from './query';

export function JobsPagination({
  pathname,
  params,
  offset,
  limit,
  total,
  messages,
}: {
  pathname: string;
  params: WorkspaceSearchParams;
  offset: number;
  limit: number;
  total: number;
  messages: MessageCatalog;
}) {
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  return (
    <footer className="jobs-pagination">
      <span>{messages.jobsWorkspace.pagination.showing} {start}–{end} / {total}</span>
      <div className="pagination-actions">
        {offset > 0 ? (
          <Link href={workspaceHref(pathname, params, { offset: Math.max(0, offset - limit), job: null })}>
            {messages.jobsWorkspace.pagination.previous}
          </Link>
        ) : <span aria-disabled="true">{messages.jobsWorkspace.pagination.previous}</span>}
        {offset + limit < total ? (
          <Link href={workspaceHref(pathname, params, { offset: offset + limit, job: null })}>
            {messages.jobsWorkspace.pagination.next}
          </Link>
        ) : <span aria-disabled="true">{messages.jobsWorkspace.pagination.next}</span>}
      </div>
    </footer>
  );
}
