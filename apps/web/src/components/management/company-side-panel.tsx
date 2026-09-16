import Link from 'next/link';
import { X } from 'lucide-react';
import type { CompanyDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { CompanyDetailContent } from './company-detail-content';

export function CompanySidePanel({ detail, closeHref, locale, messages }: { detail: CompanyDetail; closeHref: string; locale: Locale; messages: MessageCatalog }) {
  return (
    <>
      <Link className="record-panel-backdrop" href={closeHref} scroll={false} aria-label={messages.companiesWorkspace.detail.close} />
      <aside className="record-panel" aria-label={messages.companiesWorkspace.detail.title}>
        <div className="record-panel-toolbar"><span>{messages.companiesWorkspace.detail.title}</span><Link className="panel-close" href={closeHref} scroll={false} aria-label={messages.companiesWorkspace.detail.close}><X aria-hidden="true" size={17} /></Link></div>
        <div className="record-panel-scroll"><CompanyDetailContent detail={detail} locale={locale} messages={messages} compact /></div>
      </aside>
    </>
  );
}
