import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { JobSearchCampaign, UpsertJobCandidate } from '@job-harness/contracts';
import type { DiscoveryProviderPort, DiscoveryProviderResult } from './runtime';

const CityResponseSchema = z.object({
  code: z.number(),
  data: z.object({ name: z.string(), code: z.union([z.string(), z.number()]) }).passthrough(),
}).passthrough();

const PositionSchema = z.object({
  jobId: z.union([z.string(), z.number()]).nullish(),
  number: z.string().nullish(),
  name: z.string().nullish(),
  companyName: z.string().nullish(),
  companyNumber: z.string().nullish(),
  workCity: z.string().nullish(),
  cityId: z.union([z.string(), z.number()]).nullish(),
  salary60: z.string().nullish(),
  workingExp: z.string().nullish(),
  education: z.string().nullish(),
  industryName: z.string().nullish(),
  publishTime: z.string().nullish(),
  firstPublishTime: z.string().nullish(),
  hasAppliedPosition: z.boolean().nullish(),
  positionURL: z.string().nullish(),
  positionUrl: z.string().nullish(),
  jobSummary: z.string().nullish(),
  jobSkillTags: z.array(z.unknown()).nullish(),
  welfareLabel: z.array(z.unknown()).nullish(),
  jobDetailData: z.object({
    position: z.object({
      desc: z.object({ description: z.string().nullish(), labels: z.array(z.string()).nullish() }).passthrough().nullish(),
      date: z.object({ positionPublishTime: z.string().nullish(), positionUpdateTime: z.string().nullish(), positionUpdateTimeText: z.string().nullish() }).passthrough().nullish(),
      base: z.object({ positionNumber: z.string().nullish() }).passthrough().nullish(),
    }).passthrough().nullish(),
  }).passthrough().nullish(),
}).passthrough();
const SearchResponseSchema = z.object({
  code: z.number(),
  data: z.object({ list: z.array(PositionSchema).default([]) }).passthrough(),
}).passthrough();

type FetchLike = typeof fetch;

export interface ZhilianDiscoveryProviderOptions {
  readonly fetch?: FetchLike;
  readonly pageSize?: number;
  readonly pagesPerQuery?: number;
  readonly queryDelayMs?: number;
  readonly maxTerms?: number;
  readonly clientId?: string;
  readonly userAgent?: string;
  readonly apiVersion?: string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => string;
}

interface MutableCandidate {
  candidate: UpsertJobCandidate;
  searchTerms: Set<string>;
  queryCities: Set<string>;
}

export class ZhilianDiscoveryProvider implements DiscoveryProviderPort {
  readonly id = 'zhilian-public-search-v2026';
  readonly sourceKind = 'zhilian' as const;
  private readonly fetchImpl: FetchLike;
  private readonly pageSize: number;
  private readonly pagesPerQuery: number;
  private readonly queryDelayMs: number;
  private readonly maxTerms: number;
  private readonly clientId: string;
  private readonly userAgent: string;
  private readonly apiVersion: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => string;

  constructor(options: ZhilianDiscoveryProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.pageSize = clampInt(options.pageSize ?? 20, 1, 50);
    this.pagesPerQuery = clampInt(options.pagesPerQuery ?? 1, 1, 3);
    this.queryDelayMs = clampInt(options.queryDelayMs ?? 1500, 0, 30_000);
    this.maxTerms = clampInt(options.maxTerms ?? 20, 1, 50);
    this.clientId = options.clientId ?? randomUUID();
    this.userAgent = options.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
    this.apiVersion = options.apiVersion ?? '0.43240637';
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  plan(campaign: JobSearchCampaign): Readonly<Record<string, unknown>> {
    const terms = searchTerms(campaign, this.maxTerms);
    return {
      cities: campaign.cities.length ? [...campaign.cities] : ['全国'],
      terms,
      pageSize: this.pageSize,
      pagesPerQuery: this.pagesPerQuery,
      queryDelayMs: this.queryDelayMs,
      anonymous: true,
    };
  }

  async discover(campaign: JobSearchCampaign): Promise<DiscoveryProviderResult> {
    const terms = searchTerms(campaign, this.maxTerms);
    const cities = campaign.cities.length ? [...campaign.cities] : ['全国'];
    const cityCodes = new Map<string, string>();
    for (const city of cities) cityCodes.set(city, city === '全国' ? '489' : await this.resolveCityCode(city));

    const byIdentity = new Map<string, MutableCandidate>();
    let queryCount = 0;
    let failedQueryCount = 0;
    const failures: Array<{ city: string; term: string; page: number; error: string }> = [];

    for (const city of cities) {
      const cityCode = cityCodes.get(city)!;
      for (const term of terms) {
        for (let page = 1; page <= this.pagesPerQuery; page += 1) {
          queryCount += 1;
          try {
            const positions = await this.fetchPositions(term, cityCode, page);
            for (const position of positions) {
              const mapped = mapPosition(position, term, city, this.now());
              if (!mapped) continue;
              if (matchesExclusion(mapped, campaign.exclusions)) continue;
              const identity = mapped.listings[0]!.externalId ?? mapped.listings[0]!.url!;
              const existing = byIdentity.get(identity);
              if (!existing) {
                byIdentity.set(identity, { candidate: mapped, searchTerms: new Set([term]), queryCities: new Set([city]) });
              } else {
                existing.searchTerms.add(term);
                existing.queryCities.add(city);
              }
            }
          } catch (error) {
            failedQueryCount += 1;
            failures.push({ city, term, page, error: sanitizeError(error) });
          }
          if (this.queryDelayMs > 0 && !(city === cities.at(-1) && term === terms.at(-1) && page === this.pagesPerQuery)) {
            await this.sleep(this.queryDelayMs);
          }
        }
      }
    }

    const candidates = [...byIdentity.values()].map(({ candidate, searchTerms: hits, queryCities }) => {
      const listing = candidate.listings[0]!;
      return {
        ...candidate,
        listings: [{
          ...listing,
          metadataSnapshot: {
            ...listing.metadataSnapshot,
            searchTerms: [...hits],
            queryCities: [...queryCities],
          },
        }],
      } satisfies UpsertJobCandidate;
    });
    return {
      candidates,
      queryCount,
      failedQueryCount,
      diagnostics: { cityCodes: Object.fromEntries(cityCodes), failures: failures.slice(0, 50) },
    };
  }

  private async resolveCityCode(city: string): Promise<string> {
    const url = new URL('https://fe-api.zhaopin.com/c/i/city-page/user-city');
    url.searchParams.set('ipCity', city);
    const response = await this.fetchImpl(url, { headers: { accept: 'application/json, text/plain, */*', 'user-agent': this.userAgent } });
    if (!response.ok) throw new Error(`Zhilian city lookup '${city}' returned HTTP ${response.status}`);
    const parsed = CityResponseSchema.parse(await response.json());
    if (parsed.code !== 200 || parsed.data.name !== city) throw new Error(`Zhilian city lookup '${city}' returned an unexpected payload`);
    return String(parsed.data.code);
  }

  private async fetchPositions(term: string, cityCode: string, page: number) {
    const url = new URL('https://fe-api.zhaopin.com/c/i/search/positions');
    url.searchParams.set('_v', this.apiVersion);
    url.searchParams.set('x-zp-page-request-id', `${Date.now()}-${Math.floor(Math.random() * 900000 + 100000)}`);
    url.searchParams.set('x-zp-client-id', this.clientId);
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json;charset=UTF-8',
        origin: 'https://www.zhaopin.com',
        referer: 'https://www.zhaopin.com/',
        'user-agent': this.userAgent,
        'x-zp-page-code': '4019',
        'x-zp-platform': '13',
        'x-zp-business-system': '1',
      },
      body: JSON.stringify({
        S_SOU_FULL_INDEX: term,
        S_SOU_WORK_CITY: cityCode,
        order: 4,
        pageIndex: page,
        pageSize: this.pageSize,
        anonymous: 1,
        eventScenario: 'pcSearchedSouSearch',
        platform: 13,
        version: '0.0.0',
      }),
    });
    if (!response.ok) throw new Error(`Zhilian search '${term}' city=${cityCode} page=${page} returned HTTP ${response.status}`);
    const parsed = SearchResponseSchema.parse(await response.json());
    if (parsed.code !== 200) throw new Error(`Zhilian search '${term}' city=${cityCode} page=${page} returned code ${parsed.code}`);
    return parsed.data.list;
  }
}

function mapPosition(position: z.infer<typeof PositionSchema>, term: string, queryCity: string, observedAt: string): UpsertJobCandidate | null {
  const title = clean(position.name);
  const companyName = clean(position.companyName);
  const number = clean(position.number) || clean(position.jobDetailData?.position?.base?.positionNumber);
  const jobId = position.jobId == null ? '' : String(position.jobId);
  const externalId = number || jobId;
  if (!title || !companyName || !externalId) return null;
  const city = clean(position.workCity) || queryCity || null;
  const description = htmlToText(position.jobDetailData?.position?.desc?.description ?? position.jobSummary ?? '') || null;
  const canonicalNumber = number || (clean(position.companyNumber) && jobId ? `${clean(position.companyNumber)}J${jobId}` : '');
  const url = canonicalNumber
    ? `https://www.zhaopin.com/jobdetail/${encodeURIComponent(canonicalNumber)}.htm`
    : normalizePositionUrl(position.positionURL ?? position.positionUrl ?? '');
  if (!url) return null;
  const publishedAt = clean(position.jobDetailData?.position?.date?.positionPublishTime) || clean(position.publishTime) || clean(position.firstPublishTime) || null;
  return {
    companyName,
    title,
    ...(city ? { city } : {}),
    description,
    observedAt,
    listings: [{
      sourceKind: 'zhilian',
      label: '智联招聘',
      url,
      externalNamespace: 'zhilian',
      externalId,
      identityKind: 'external-id',
      status: 'active',
      ...(publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? { publishedAt: new Date(publishedAt).toISOString() } : {}),
      metadataSnapshot: {
        provider: 'zhilian-public-search-v2026',
        searchTerm: term,
        queryCity,
        salary: clean(position.salary60) || null,
        experience: clean(position.workingExp) || null,
        education: clean(position.education) || null,
        industry: clean(position.industryName) || null,
        hasAppliedPosition: position.hasAppliedPosition ?? null,
        labels: position.jobDetailData?.position?.desc?.labels ?? [],
      },
    }],
  };
}

function searchTerms(campaign: JobSearchCampaign, maxTerms: number): string[] {
  const values = [
    ...campaign.targetRoles.flatMap((value) => value.split(/[\/|｜]/g)),
    ...campaign.keywords,
  ];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const term = value.replace(/\s+/g, ' ').trim();
    const key = term.toLowerCase();
    if (term.length < 2 || seen.has(key)) continue;
    seen.add(key);
    result.push(term);
    if (result.length >= maxTerms) break;
  }
  return result;
}

function matchesExclusion(candidate: UpsertJobCandidate, exclusions: readonly string[]): boolean {
  if (!exclusions.length) return false;
  const haystack = `${candidate.title}\n${candidate.companyName}\n${candidate.description ?? ''}`.toLowerCase();
  return exclusions.some((value) => {
    const needle = value.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

function normalizePositionUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.replace(/^http:/i, 'https:'));
    if (!/zhaopin\.com$/i.test(url.hostname) && !/\.zhaopin\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, 50_000);
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}
function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.trunc(Number(value));
  if (!Number.isFinite(rounded)) return min;
  return Math.max(min, Math.min(max, rounded));
}
