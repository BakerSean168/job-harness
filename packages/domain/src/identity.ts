export interface JobListingIdentityInput {
  readonly sourceKind: string;
  readonly identityKind: 'external-id' | 'url' | 'scoped';
  readonly url?: string | null;
  readonly externalNamespace?: string | null;
  readonly externalId?: string | null;
}

export interface OpportunityCandidateIdentityInput {
  readonly companyName: string;
  readonly title: string;
  readonly city?: string | null;
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
 * Strong JobListing identity only. A scoped listing intentionally has no global
 * identity key because generic careers pages may legitimately be attached to
 * multiple opportunities.
 */
export function buildJobListingIdentityKey(input: JobListingIdentityInput): string | null {
  if (input.identityKind === 'external-id') {
    const namespace = normalizeIdentityText(input.externalNamespace ?? input.sourceKind);
    const externalId = normalizeIdentityText(input.externalId ?? '');
    if (!namespace || !externalId) throw new Error('external-id listing identity requires namespace and externalId');
    return `external:${namespace}:${externalId}`;
  }
  if (input.identityKind === 'url') {
    if (!input.url?.trim()) throw new Error('url listing identity requires url');
    return `url:${normalizeCanonicalUrl(input.url)}`;
  }
  return null;
}

/** Composite opportunity identity is only a candidate-match key, never a destructive merge key. */
export function buildOpportunityCandidateKey(input: OpportunityCandidateIdentityInput): string {
  return [
    'candidate',
    normalizeIdentityText(input.companyName),
    normalizeIdentityText(input.title),
    normalizeIdentityText(input.city ?? ''),
  ].join(':');
}
