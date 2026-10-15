import type { Locale } from '@/i18n';
import type { JobDeadline } from '@job-harness/contracts';

export function formatDeadline(locale: Locale, deadline: JobDeadline | null | undefined): string {
  if (!deadline) return '—';
  return deadline.precision === 'date' ? deadline.date : formatDateTime(locale, deadline.at);
}

export function formatDateTime(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDate(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
