import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import './jobs.css';
import './applications.css';
import './dashboard.css';
import './management.css';
import './auth.css';
import './saved-views.css';
import { AppShell } from '@/components/shell/app-shell';
import { getLocale, getMessages } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const messages = await getMessages();
  return {
    title: { default: messages.brand.name, template: `%s · ${messages.brand.name}` },
    description: messages.meta.description,
  };
}


export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages, requestHeaders] = await Promise.all([getLocale(), getMessages(), headers()]);
  const publicShell = requestHeaders.get('x-job-harness-public-shell') === 'login';
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        {publicShell ? children : <AppShell locale={locale} messages={messages}>{children}</AppShell>}
      </body>
    </html>
  );
}
