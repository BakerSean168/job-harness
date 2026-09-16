'use client';

import { useEffect, useState } from 'react';
import { InlineError } from '@/components/ui/inline-error';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, messagesFor, type Locale } from '@/i18n';

function browserLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const value = document.cookie.split('; ').find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`))?.split('=')[1];
  const decoded = value ? decodeURIComponent(value) : undefined;
  return isLocale(decoded) ? decoded : DEFAULT_LOCALE;
}

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => setLocale(browserLocale()), []);
  const messages = messagesFor(locale);
  return (
    <InlineError
      message={messages.common.unexpectedError}
      retryLabel={messages.common.retry}
      onRetry={reset}
    />
  );
}
