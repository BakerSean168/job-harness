import type { ApplicationWorkspaceDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { RecordSidePanelDialog } from '@/components/ui/record-side-panel-dialog';
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
    <RecordSidePanelDialog
      title={`${detail.job.companyName} · ${detail.job.title}`}
      closeLabel={messages.common.close}
      closeHref={closeHref}
    >
      <ApplicationDetailContent detail={detail} locale={locale} messages={messages} compact />
    </RecordSidePanelDialog>
  );
}
