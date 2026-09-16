import Link from 'next/link';
import { X } from 'lucide-react';
import type { DiscoveryRunDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { DiscoveryRunContent } from './discovery-run-content';

export function DiscoverySidePanel({ detail, closeHref, locale, messages }: { detail: DiscoveryRunDetail; closeHref: string; locale: Locale; messages: MessageCatalog }) {
  return (
    <>
      <Link className="record-panel-backdrop" href={closeHref} scroll={false} aria-label={messages.discoveryWorkspace.detail.close} />
      <aside className="record-panel" aria-label={messages.discoveryWorkspace.detail.title}>
        <div className="record-panel-toolbar">
          <span>{messages.discoveryWorkspace.detail.title}</span>
          <Link className="panel-close" href={closeHref} scroll={false} aria-label={messages.discoveryWorkspace.detail.close}><X aria-hidden="true" size={17} /></Link>
        </div>
        <div className="record-panel-scroll"><DiscoveryRunContent detail={detail} locale={locale} messages={messages} compact /></div>
      </aside>
    </>
  );
}
