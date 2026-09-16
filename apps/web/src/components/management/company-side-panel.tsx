import type { CompanyDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { RecordSidePanelDialog } from '@/components/ui/record-side-panel-dialog';
import { CompanyDetailContent } from './company-detail-content';

export function CompanySidePanel({ detail, closeHref, locale, messages }: { detail: CompanyDetail; closeHref: string; locale: Locale; messages: MessageCatalog }) {
  return (
    <RecordSidePanelDialog
      title={`${messages.companiesWorkspace.detail.title}: ${detail.company.name}`}
      closeLabel={messages.common.close}
      closeHref={closeHref}
    >
      <CompanyDetailContent detail={detail} locale={locale} messages={messages} compact />
    </RecordSidePanelDialog>
  );
}
