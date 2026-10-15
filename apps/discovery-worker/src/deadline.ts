import type { JobDeadline } from '@job-harness/contracts';

/**
 * Only parse explicit structured source fields (e.g. schema.org validThrough).
 * Never infer a deadline from an old publishedAt, a lastSeenAt or a search TTL.
 */
export function parseDeclaredDeadline(raw: unknown, sourceUrl: string, observedAt: string): JobDeadline | null {
  if (typeof raw !== 'string') return null;
  const sourceText = raw.trim();
  if (!sourceText || sourceText.length > 1000) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(sourceText)) {
    const parsed = new Date(sourceText + 'T00:00:00.000Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== sourceText) return null;
    return {
      precision: 'date',
      date: sourceText,
      timeZone: 'Asia/Shanghai',
      sourceText,
      sourceUrl,
      observedAt,
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(sourceText)) {
    return null;
  }
  const at = new Date(sourceText);
  if (Number.isNaN(at.getTime())) return null;
  return { precision: 'datetime', at: at.toISOString(), sourceText, sourceUrl, observedAt };
}
