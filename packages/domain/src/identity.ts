export interface JobIdentityInput {
  readonly companyName: string;
  readonly title: string;
  readonly city?: string | null;
  readonly canonicalUrl?: string | null;
  readonly externalIdentity?: {
    readonly source: string;
    readonly externalId: string;
  } | null;
}

export function normalizeIdentityText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeCanonicalUrl(value: string): string {
  const url = new URL(value);
  const semanticHash = /^#\/?(?:job|position)\//i.test(url.hash);
  if (!semanticHash) url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

/**
 * Stable dedupe preference:
 * 1. source + external job id
 * 2. canonical job URL
 * 3. normalized company + title + city
 */
export function buildJobIdentityKey(input: JobIdentityInput): string {
  if (input.externalIdentity?.source.trim() && input.externalIdentity.externalId.trim()) {
    return `external:${normalizeIdentityText(input.externalIdentity.source)}:${normalizeIdentityText(input.externalIdentity.externalId)}`;
  }
  if (input.canonicalUrl?.trim()) {
    return `url:${normalizeCanonicalUrl(input.canonicalUrl)}`;
  }
  return [
    'composite',
    normalizeIdentityText(input.companyName),
    normalizeIdentityText(input.title),
    normalizeIdentityText(input.city ?? ''),
  ].join(':');
}
