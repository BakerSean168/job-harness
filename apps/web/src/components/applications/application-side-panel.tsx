import Link from 'next/link';
import { X } from 'lucide-react';
import type { ApplicationWorkspaceDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { ApplicationDetailContent } from './application-detail-content';

export function ApplicationSidePanel({
  detail,
  closeHref,
  locale,
  messages,
}: {
  detail: ApplicationWorkspaceDetail;
  closeHref: string;
  locale: Locale;
  messages: MessageCatalog;
}) {
  return (
    <>
      <Link className="record-panel-backdrop" href={closeHref} scroll={false} aria-label={messages.applicationsWorkspace.detail.closePanel} />
      <aside className="record-panel" aria-label={`${detail.job.companyName} · ${detail.job.title}`}>
        <div className="record-panel-toolbar">
          <span>{messages.applicationsWorkspace.detail.summary}</span>
          <Link className="panel-close" href={closeHref} scroll={false} aria-label={messages.applicationsWorkspace.detail.closePanel}>
            <X aria-hidden="true" size={17} />
          </Link>
        </div>
        <div className="record-panel-scroll">
          <ApplicationDetailContent detail={detail} locale={locale} messages={messages} compact />
        </div>
      </aside>
    </>
  );
}
