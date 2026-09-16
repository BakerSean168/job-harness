export type WorkspaceSearchParams = Record<string, string | string[] | undefined>;

export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function positiveInteger(value: string | string[] | undefined, fallback: number): number {
  const parsed = Number(one(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function workspaceHref(
  pathname: string,
  current: WorkspaceSearchParams,
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
  return `${pathname}${encoded ? `?${encoded}` : ''}`;
}
