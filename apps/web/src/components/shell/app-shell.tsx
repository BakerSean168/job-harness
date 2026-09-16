import { Search } from 'lucide-react';
import type { Locale, MessageCatalog } from '@/i18n';
import { AppSidebar } from './app-sidebar';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';

export function AppShell({
  children,
  locale,
  messages,
}: Readonly<{
  children: React.ReactNode;
  locale: Locale;
  messages: MessageCatalog;
}>) {
  return (
    <>
      <a className="skip-link" href="#main-content">{messages.common.skipToContent}</a>
      <div className="app-shell">
      <AppSidebar messages={messages} />
      <div className="app-workspace">
        <header className="global-topbar">
          <div className="command-search" aria-label={messages.topbar.searchHint}>
            <Search aria-hidden="true" size={16} />
            <span>{messages.topbar.search}</span>
          </div>
          <div className="topbar-actions">
            <LocaleSwitcher locale={locale} label={messages.topbar.language} />
            <ThemeToggle label={messages.topbar.theme} />
          </div>
        </header>
        <main id="main-content" className="workspace-main" tabIndex={-1}>{children}</main>
      </div>
    </div>
    </>
  );
}
