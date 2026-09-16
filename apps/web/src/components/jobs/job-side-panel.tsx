import type { JobDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { RecordSidePanelDialog } from '@/components/ui/record-side-panel-dialog';
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
    <RecordSidePanelDialog
      title={`${detail.job.companyName} · ${detail.job.title}`}
      closeLabel={messages.common.close}
      closeHref={closeHref}
    >
      <JobDetailContent
        detail={detail}
        locale={locale}
        messages={messages}
        compact
        closeHref={closeHref}
        closeAfterMutation={closeAfterMutation}
      />
    </RecordSidePanelDialog>
  );
}
