'use client';

import { Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, type Locale } from '@/i18n';

export function LocaleSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const nextLocale: Locale = locale === 'zh-CN' ? 'en' : 'zh-CN';
  return (
    <button
      type="button"
      className="topbar-icon-button locale-button"
      aria-label={label}
      title={label}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      <Languages aria-hidden="true" size={16} />
      <span>{locale === 'zh-CN' ? '中' : 'EN'}</span>
    </button>
  );
}
