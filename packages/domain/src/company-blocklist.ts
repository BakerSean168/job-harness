import { normalizeIdentityText } from './identity';

export interface CompanyBlockMatcher {
  readonly pattern: string;
  readonly matchMode: 'exact' | 'prefix' | 'contains';
  readonly active: boolean;
}

/** Match only the legal/brand name of an employer, never a Job title or JD. */
export function companyNameMatchesRule(name: string, rule: CompanyBlockMatcher): boolean {
  if (!rule.active) return false;
  const value = normalizeIdentityText(name);
  const pattern = normalizeIdentityText(rule.pattern);
  if (pattern.length < 2) return false;
  if (rule.matchMode === 'exact') return value === pattern;
  if (rule.matchMode === 'prefix') return value.startsWith(pattern);
  return value.includes(pattern);
}

export function matchingCompanyBlockRule<T extends CompanyBlockMatcher>(
  companyNames: readonly string[], rules: readonly T[],
): T | null {
  return rules.find((rule) => companyNames.some((name) => companyNameMatchesRule(name, rule))) ?? null;
}
