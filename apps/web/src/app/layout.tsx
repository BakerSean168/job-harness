import type { Metadata } from 'next';
import './globals.css';
import './jobs.css';
import './applications.css';
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
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <AppShell locale={locale} messages={messages}>{children}</AppShell>
      </body>
    </html>
  );
}
