import Link from 'next/link';
import { X } from 'lucide-react';
import type { JobDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { JobDetailContent } from './job-detail-content';

export function JobSidePanel({
  detail,
  closeHref,
  closeAfterMutation,
  locale,
  messages,
}: {
  detail: JobDetail;
  closeHref: string;
  closeAfterMutation: boolean;
  locale: Locale;
  messages: MessageCatalog;
}) {
  return (
    <>
      <Link className="record-panel-backdrop" href={closeHref} scroll={false} aria-label={messages.jobsWorkspace.detail.closePanel} />
      <aside className="record-panel" aria-label={`${detail.job.companyName} · ${detail.job.title}`}>
        <div className="record-panel-toolbar">
          <span>{messages.jobsWorkspace.detail.overview}</span>
          <Link className="panel-close" href={closeHref} scroll={false} aria-label={messages.jobsWorkspace.detail.closePanel}>
            <X aria-hidden="true" size={17} />
          </Link>
        </div>
        <div className="record-panel-scroll">
          <JobDetailContent
            detail={detail}
            locale={locale}
            messages={messages}
            compact
            closeHref={closeHref}
            closeAfterMutation={closeAfterMutation}
          />
        </div>
      </aside>
    </>
  );
}
