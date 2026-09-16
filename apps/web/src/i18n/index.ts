import { en } from './messages/en';
import { zhCN } from './messages/zh-CN';
import type { MessageCatalog } from './messages/types';

export const locales = ['zh-CN', 'en'] as const;
export type Locale = (typeof locales)[number];
export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const LOCALE_COOKIE = 'job-harness-locale';

const catalogs: Record<Locale, MessageCatalog> = {
  'zh-CN': zhCN,
  en,
};

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export function messagesFor(locale: Locale): MessageCatalog {
  return catalogs[locale];
}

export type { MessageCatalog, PageKey } from './messages/types';
