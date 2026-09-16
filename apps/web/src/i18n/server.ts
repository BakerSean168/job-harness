import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, messagesFor, type Locale } from './index';

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const candidate = store.get(LOCALE_COOKIE)?.value;
  return isLocale(candidate) ? candidate : DEFAULT_LOCALE;
}

export async function getMessages() {
  return messagesFor(await getLocale());
}
