'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MessageCatalog } from '@/i18n';
import { primaryNavigation, secondaryNavigation, type NavigationItem } from './navigation';

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationGroup({
  items,
  pathname,
  messages,
}: {
  items: readonly NavigationItem[];
  pathname: string;
  messages: MessageCatalog;
}) {
  return (
    <nav className="sidebar-nav" aria-label={messages.common.mainNavigation}>
      {items.map(({ href, labelKey, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="sidebar-link"
            data-active={active ? 'true' : 'false'}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{messages.nav[labelKey]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar({ messages }: { messages: MessageCatalog }) {
  const pathname = usePathname();
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true">JH</div>
        <div className="brand-copy">
          <strong>{messages.brand.name}</strong>
          <span>{messages.brand.subtitle}</span>
        </div>
      </div>
      <div className="sidebar-scroll">
        <NavigationGroup items={primaryNavigation} pathname={pathname} messages={messages} />
      </div>
      <div className="sidebar-footer">
        <NavigationGroup items={secondaryNavigation} pathname={pathname} messages={messages} />
      </div>
    </aside>
  );
}
