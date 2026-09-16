export type ApplicationsSearchParams = Record<string, string | string[] | undefined>;

export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function nonNegativeInteger(value: string | string[] | undefined, fallback: number): number {
  const parsed = Number(one(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function applicationsHref(
  current: ApplicationsSearchParams,
  updates: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(current)) {
    for (const value of Array.isArray(raw) ? raw : raw == null ? [] : [raw]) query.append(key, value);
  }
  for (const [key, value] of Object.entries(updates)) {
    query.delete(key);
    if (value !== null && value !== undefined && String(value) !== '') query.set(key, String(value));
  }
  const encoded = query.toString();
  return `/applications${encoded ? `?${encoded}` : ''}`;
}

export function dateStart(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : undefined;
}

export function dateEnd(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : undefined;
}
