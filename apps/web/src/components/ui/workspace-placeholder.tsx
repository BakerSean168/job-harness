import { PanelsTopLeft } from 'lucide-react';
import type { MessageCatalog, PageKey } from '@/i18n';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { EmptyState } from './empty-state';

export function WorkspacePlaceholder({
  page,
  messages,
}: {
  page: PageKey;
  messages: MessageCatalog;
}) {
  const copy = messages.pages[page];
  return (
    <div className="workspace-page">
      <WorkspaceHeader title={copy.title} description={copy.description} />
      <div className="workspace-surface placeholder-surface">
        <EmptyState
          icon={PanelsTopLeft}
          title={copy.title}
          description={messages.common.comingSoon}
        />
      </div>
    </div>
  );
}
