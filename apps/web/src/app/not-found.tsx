import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { getMessages } from '@/i18n/server';

export default async function NotFound() {
  const messages = await getMessages();
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <div className="empty-state-icon"><SearchX aria-hidden="true" size={20} /></div>
      <h1 id="not-found-title">{messages.common.notFoundTitle}</h1>
      <p>{messages.common.notFoundDescription}</p>
      <Link className="text-link" href="/">{messages.common.backOverview}</Link>
    </section>
  );
}
