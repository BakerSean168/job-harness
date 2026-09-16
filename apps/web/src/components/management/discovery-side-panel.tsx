import type { DiscoveryRunDetail } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { RecordSidePanelDialog } from '@/components/ui/record-side-panel-dialog';
import { DiscoveryRunContent } from './discovery-run-content';

export function DiscoverySidePanel({ detail, closeHref, locale, messages }: { detail: DiscoveryRunDetail; closeHref: string; locale: Locale; messages: MessageCatalog }) {
  return (
    <RecordSidePanelDialog
      title={messages.discoveryWorkspace.detail.title}
      closeLabel={messages.common.close}
      closeHref={closeHref}
    >
      <DiscoveryRunContent detail={detail} locale={locale} messages={messages} compact />
    </RecordSidePanelDialog>
  );
}
