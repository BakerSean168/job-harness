import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { JobSearchCampaign, UpsertJobCandidate } from '@job-harness/contracts';
import type { DiscoveryProviderPort, DiscoveryProviderResult } from './runtime';
import { matchesCampaignEducation, matchesCampaignExperience, titleLooksLikeEntryLevelDeveloper } from './qualification-policy';

const CITY_CODES: Readonly<Record<string, string>> = {
  北京: '010', 上海: '020', 天津: '030', 广州: '050020', 深圳: '050090',
  南京: '060020', 杭州: '070020', 合肥: '080020', 福州: '090020', 成都: '280020',
};

const LiepinJobSchema = z.object({
  jobId: z.union([z.string(), z.number()]).nullish(),
  jobKind: z.union([z.string(), z.number()]).nullish(),
  title: z.string().nullish(),
  refreshTime: z.string().nullish(),
  dq: z.string().nullish(),
  salary: z.string().nullish(),
  requireWorkYears: z.string().nullish(),
  requireEduLevel: z.string().nullish(),
  link: z.string().nullish(),
  labels: z.array(z.unknown()).nullish(),
}).passthrough();
const LiepinCompanySchema = z.object({
  compName: z.string().nullish(),
  compScale: z.string().nullish(),
  compStage: z.string().nullish(),
  compIndustry: z.string().nullish(),
}).passthrough();
const LiepinRecruiterSchema = z.object({
  recruiterTitle: z.string().nullish(),
  imShowText: z.string().nullish(),
  chatted: z.boolean().nullish(),
}).passthrough();
const LiepinCardSchema = z.object({
  job: LiepinJobSchema,
  comp: LiepinCompanySchema.nullish(),
  recruiter: LiepinRecruiterSchema.nullish(),
}).passthrough();
const LiepinSearchResponseSchema = z.object({
  flag: z.number(),
  data: z.object({
    data: z.object({ jobCardList: z.array(LiepinCardSchema).default([]) }).passthrough(),
  }).passthrough(),
}).passthrough();

type FetchLike = typeof fetch;

export interface LiepinDiscoveryProviderOptions {
  readonly fetch?: FetchLike;
  readonly pageSize?: number;
  readonly pagesPerQuery?: number;
  readonly queryDelayMs?: number;
  readonly maxTerms?: number;
  readonly maxAgeDays?: number;
  readonly detailEnrichment?: boolean;
  readonly detailDelayMs?: number;
  readonly maxDetailCandidates?: number;
  readonly userAgent?: string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => string;
  readonly traceIdFactory?: () => string;
}

interface MutableCandidate {
  candidate: UpsertJobCandidate;
  searchTerms: Set<string>;
  queryCities: Set<string>;
}

export class LiepinDiscoveryProvider implements DiscoveryProviderPort {
  readonly id = 'liepin-public-search-v2026';
  readonly sourceKind = 'liepin' as const;
  private readonly fetchImpl: FetchLike;
  private readonly pageSize: number;
  private readonly pagesPerQuery: number;
  private readonly queryDelayMs: number;
  private readonly maxTerms: number;
  private readonly maxAgeDays: number;
  private readonly detailEnrichment: boolean;
  private readonly detailDelayMs: number;
  private readonly maxDetailCandidates: number;
  private readonly userAgent: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => string;
  private readonly traceIdFactory: () => string;

  constructor(options: LiepinDiscoveryProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.pageSize = clampInt(options.pageSize ?? 40, 1, 40);
    this.pagesPerQuery = clampInt(options.pagesPerQuery ?? 1, 1, 2);
    this.queryDelayMs = clampInt(options.queryDelayMs ?? 2500, 0, 30_000);
    this.maxTerms = clampInt(options.maxTerms ?? 8, 1, 20);
    this.maxAgeDays = clampInt(options.maxAgeDays ?? 60, 1, 365);
    this.detailEnrichment = options.detailEnrichment ?? true;
    this.detailDelayMs = clampInt(options.detailDelayMs ?? 1200, 0, 30_000);
    this.maxDetailCandidates = clampInt(options.maxDetailCandidates ?? 24, 0, 100);
    this.userAgent = options.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => new Date().toISOString());
    this.traceIdFactory = options.traceIdFactory ?? randomUUID;
  }

  plan(campaign: JobSearchCampaign): Readonly<Record<string, unknown>> {
    const terms = searchTerms(campaign, this.maxTerms);
    return {
      cities: campaign.cities.length ? [...campaign.cities] : ['全国'],
      cityCodes: Object.fromEntries((campaign.cities.length ? campaign.cities : ['全国']).map((city) => [city, cityCode(city)])),
      terms,
      pageSize: this.pageSize,
      pagesPerQuery: this.pagesPerQuery,
      queryDelayMs: this.queryDelayMs,
      anonymous: true,
      detailFetch: this.detailEnrichment,
      detailDelayMs: this.detailDelayMs,
      maxDetailCandidates: this.maxDetailCandidates,
      maxAgeDays: this.maxAgeDays,
      filters: ['query-city-match', 'campaign-title-signal', 'refresh-time-window'],
    };
  }

  async discover(campaign: JobSearchCampaign): Promise<DiscoveryProviderResult> {
    const terms = searchTerms(campaign, this.maxTerms);
    const cities = campaign.cities.length ? [...campaign.cities] : ['全国'];
    const byIdentity = new Map<string, MutableCandidate>();
    let queryCount = 0;
    let failedQueryCount = 0;
    const failures: Array<{ city: string; term: string; page: number; error: string }> = [];
    let filteredCityCount = 0;
    let filteredIntentCount = 0;
    let filteredStaleCount = 0;
    let detailAttemptCount = 0;
    let detailSuccessCount = 0;
    let detailFailedCount = 0;
    const detailFailures: Array<{ url: string; error: string }> = [];

    for (const city of cities) {
      const code = cityCode(city);
      for (const term of terms) {
        for (let page = 0; page < this.pagesPerQuery; page += 1) {
          queryCount += 1;
          try {
            const cards = await this.fetchCards(term, code, page);
            for (const card of cards) {
              const observedAt = this.now();
              const mapped = mapCard(card, term, city, observedAt);
              if (!mapped || matchesExclusion(mapped, campaign.exclusions)) continue;
              if (!matchesQueryCity(mapped.city ?? null, city)) { filteredCityCount += 1; continue; }
              if (!matchesCampaignTitleIntent(mapped.title, campaign)) { filteredIntentCount += 1; continue; }
              if (!isFresh(card.job.refreshTime, observedAt, this.maxAgeDays)) { filteredStaleCount += 1; continue; }
              const identity = mapped.listings[0]!.externalId ?? mapped.listings[0]!.url!;
              const existing = byIdentity.get(identity);
              if (!existing) byIdentity.set(identity, { candidate: mapped, searchTerms: new Set([term]), queryCities: new Set([city]) });
              else { existing.searchTerms.add(term); existing.queryCities.add(city); }
            }
          } catch (error) {
            failedQueryCount += 1;
            failures.push({ city, term, page, error: sanitizeError(error) });
          }
          if (this.queryDelayMs > 0 && !(city === cities.at(-1) && term === terms.at(-1) && page === this.pagesPerQuery - 1)) {
            await this.sleep(this.queryDelayMs);
          }
        }
      }
    }

    if (this.detailEnrichment && this.maxDetailCandidates > 0) {
      const eligible = [...byIdentity.values()]
        .filter(({ candidate }) => shouldEnrichDetail(candidate, campaign))
        .sort(compareDetailPriority)
        .slice(0, this.maxDetailCandidates);
      for (let index = 0; index < eligible.length; index += 1) {
        const entry = eligible[index]!;
        const listing = entry.candidate.listings[0]!;
        if (!listing.url) continue;
        detailAttemptCount += 1;
        try {
          const detail = await this.fetchDetail(listing.url);
          if (detail.description) {
            entry.candidate = {
              ...entry.candidate,
              description: detail.description,
              listings: [{
                ...listing,
                metadataSnapshot: {
                  ...listing.metadataSnapshot,
                  detailEnriched: true,
                  detailDatePosted: detail.datePosted,
                },
              }],
            };
            detailSuccessCount += 1;
          } else {
            detailFailedCount += 1;
            detailFailures.push({ url: listing.url, error: 'JobPosting JSON-LD had no description' });
          }
        } catch (error) {
          detailFailedCount += 1;
          detailFailures.push({ url: listing.url, error: sanitizeError(error) });
        }
        if (this.detailDelayMs > 0 && index < eligible.length - 1) await this.sleep(this.detailDelayMs);
      }
    }

    const candidates = [...byIdentity.values()].map(({ candidate, searchTerms: hits, queryCities }) => {
      const listing = candidate.listings[0]!;
      return {
        ...candidate,
        listings: [{ ...listing, metadataSnapshot: { ...listing.metadataSnapshot, searchTerms: [...hits], queryCities: [...queryCities] } }],
      } satisfies UpsertJobCandidate;
    });
    return {
      candidates,
      queryCount,
      failedQueryCount,
      diagnostics: { cityCodes: Object.fromEntries(cities.map((city) => [city, cityCode(city)])), filteredCityCount, filteredIntentCount, filteredStaleCount, detailAttemptCount, detailSuccessCount, detailFailedCount, detailFailures: detailFailures.slice(0, 25), failures: failures.slice(0, 50) },
    };
  }

  private async fetchCards(term: string, city: string, page: number) {
    const response = await this.fetchImpl('https://api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        origin: 'https://www.liepin.com',
        referer: 'https://www.liepin.com/',
        'user-agent': this.userAgent,
        'x-client-type': 'web',
        'x-fscp-version': '1.1',
        'x-requested-with': 'XMLHttpRequest',
        'x-fscp-std-info': '{"client_id":"40108"}',
        'x-fscp-trace-id': this.traceIdFactory(),
      },
      body: JSON.stringify({
        data: {
          mainSearchPcConditionForm: {
            city, dq: city, pubTime: '', currentPage: page, pageSize: this.pageSize, key: term,
            suggestTag: '', workYearCode: '0', compId: '', compName: '', compTag: '', industry: '', salary: '',
            jobKind: '', compScale: '', compKind: '', compStage: '', eduLevel: '',
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`Liepin search '${term}' city=${city || '全国'} page=${page} returned HTTP ${response.status}`);
    const parsed = LiepinSearchResponseSchema.parse(await response.json());
    if (parsed.flag !== 1) throw new Error(`Liepin search '${term}' city=${city || '全国'} page=${page} returned flag ${parsed.flag}`);
    return parsed.data.data.jobCardList;
  }

  private async fetchDetail(url: string): Promise<{ description: string | null; datePosted: string | null }> {
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'text/html,application/xhtml+xml', referer: 'https://www.liepin.com/', 'user-agent': this.userAgent },
    });
    if (!response.ok) throw new Error(`Liepin detail '${new URL(url).pathname}' returned HTTP ${response.status}`);
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error(`Liepin detail '${new URL(url).pathname}' exceeded bounded HTML size`);
    return extractJobPostingJsonLd(html);
  }
}

function mapCard(card: z.infer<typeof LiepinCardSchema>, term: string, queryCity: string, observedAt: string): UpsertJobCandidate | null {
  const jobId = card.job.jobId == null ? '' : String(card.job.jobId).trim();
  const jobKind = card.job.jobKind == null ? '' : String(card.job.jobKind).trim();
  const title = clean(card.job.title);
  const companyName = clean(card.comp?.compName);
  const url = normalizeJobUrl(card.job.link ?? '', jobKind, jobId);
  if (!jobId || !title || !companyName || !url) return null;
  const city = clean(card.job.dq) || queryCity || null;
  const publishedAt = parseLiepinTimestamp(card.job.refreshTime);
  return {
    companyName,
    title,
    ...(city ? { city } : {}),
    description: null,
    observedAt,
    listings: [{
      sourceKind: 'liepin',
      label: '猎聘',
      url,
      externalNamespace: 'liepin',
      externalId: `${jobKind || 'unknown'}:${jobId}`,
      identityKind: 'external-id',
      status: 'active',
      ...(publishedAt ? { publishedAt } : {}),
      metadataSnapshot: {
        provider: 'liepin-public-search-v2026',
        searchTerm: term,
        queryCity,
        jobKind: jobKind || null,
        salary: clean(card.job.salary) || null,
        experience: clean(card.job.requireWorkYears) || null,
        education: clean(card.job.requireEduLevel) || null,
        companyScale: clean(card.comp?.compScale) || null,
        companyStage: clean(card.comp?.compStage) || null,
        industry: clean(card.comp?.compIndustry) || null,
        recruiterTitle: clean(card.recruiter?.recruiterTitle) || null,
        recruiterOnline: clean(card.recruiter?.imShowText) || null,
        recruiterChatted: card.recruiter?.chatted ?? null,
        labels: card.job.labels ?? [],
      },
    }],
  };
}

function normalizeJobUrl(value: string, jobKind: string, jobId: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host !== 'liepin.com' && host !== 'www.liepin.com') return null;
    if (!/^\/(?:job|a)\/\d+\.shtml$/i.test(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    if (!/^\d+$/.test(jobId)) return null;
    const prefix = jobKind === '1' ? 'a' : jobKind === '2' ? 'job' : null;
    return prefix ? `https://www.liepin.com/${prefix}/${jobId}.shtml` : null;
  }
}

function cityCode(city: string): string {
  if (city === '全国') return '';
  const code = CITY_CODES[city];
  if (!code) throw new Error(`Liepin city '${city}' has no verified code; add it only after a low-frequency real API verification`);
  return code;
}

function parseLiepinTimestamp(value: unknown): string | null {
  const raw = clean(value);
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function searchTerms(campaign: JobSearchCampaign, maxTerms: number): string[] {
  const values = [...campaign.targetRoles.flatMap((value) => value.split(/[\/|｜]/g)), ...campaign.keywords];
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
  return exclusions.some((value) => { const needle = value.trim().toLowerCase(); return needle.length > 0 && haystack.includes(needle); });
}
function clean(value: unknown): string { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }
function sanitizeError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500); }
function clampInt(value: number, min: number, max: number): number { const n = Math.trunc(Number(value)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min; }


function matchesQueryCity(candidateCity: string | null, queryCity: string): boolean {
  if (queryCity === '全国') return true;
  const normalized = clean(candidateCity).replace(/[—–]/g, '-');
  return normalized === queryCity || normalized.startsWith(`${queryCity}-`);
}

function matchesCampaignTitleIntent(title: string, campaign: JobSearchCampaign): boolean {
  const normalizedTitle = title.toLowerCase();
  const signals = new Set<string>();
  for (const raw of campaign.targetRoles) {
    for (const part of raw.split(/[\/|｜]/g)) {
      const phrase = part.replace(/\s+/g, ' ').trim();
      if (!phrase) continue;
      signals.add(phrase);
      for (const token of phrase.split(/[\s+,&，、()（）-]+/g)) if (token.trim().length >= 2) signals.add(token.trim());
    }
  }
  for (const keyword of campaign.keywords) {
    const signal = keyword.replace(/\s+/g, ' ').trim();
    if (signal.length >= 2) signals.add(signal);
  }
  return [...signals].some((signal) => containsSignal(normalizedTitle, signal.toLowerCase()));
}

function containsSignal(title: string, signal: string): boolean {
  if (!signal) return false;
  if (/^[a-z0-9.+#\s-]+$/i.test(signal)) {
    const escaped = signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(title);
  }
  return title.includes(signal);
}

function isFresh(value: unknown, observedAt: string, maxAgeDays: number): boolean {
  const publishedAt = parseLiepinTimestamp(value);
  if (!publishedAt) return true;
  const observedMs = Date.parse(observedAt);
  const publishedMs = Date.parse(publishedAt);
  if (Number.isNaN(observedMs) || Number.isNaN(publishedMs)) return true;
  return observedMs - publishedMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}


function shouldEnrichDetail(candidate: UpsertJobCandidate, campaign: JobSearchCampaign): boolean {
  const listing = candidate.listings[0];
  if (!listing?.url || !titleLooksLikeEntryLevelDeveloper(candidate.title)) return false;
  const metadata = listing.metadataSnapshot ?? {};
  if (!matchesCampaignExperience(metadata.experience, campaign.experience)) return false;
  if (!matchesCampaignEducation(metadata.education, campaign.education)) return false;
  return true;
}

function extractJobPostingJsonLd(html: string): { description: string | null; datePosted: string | null } {
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { continue; }
    const job = findJobPosting(parsed);
    if (!job) continue;
    const description = typeof job.description === 'string' ? htmlToText(job.description).slice(0, 50_000) : '';
    const datePosted = typeof job.datePosted === 'string' && job.datePosted.trim() ? job.datePosted.trim().slice(0, 100) : null;
    return { description: description || null, datePosted };
  }
  return { description: null, datePosted: null };
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  const queue: unknown[] = Array.isArray(value) ? [...value] : [value];
  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== 'object') continue;
    if (Array.isArray(candidate)) { queue.push(...candidate); continue; }
    const record = candidate as Record<string, unknown>;
    const type = record['@type'];
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return record;
    if (record['@graph']) queue.push(record['@graph']);
  }
  return null;
}

function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}


function compareDetailPriority(left: MutableCandidate, right: MutableCandidate): number {
  const leftListing = left.candidate.listings[0];
  const rightListing = right.candidate.listings[0];
  const leftDirect = isLiepinDirectHireUrl(leftListing?.url ?? '') ? 1 : 0;
  const rightDirect = isLiepinDirectHireUrl(rightListing?.url ?? '') ? 1 : 0;
  if (leftDirect !== rightDirect) return rightDirect - leftDirect;
  const leftPublished = Date.parse(leftListing?.publishedAt ?? '') || 0;
  const rightPublished = Date.parse(rightListing?.publishedAt ?? '') || 0;
  if (leftPublished !== rightPublished) return rightPublished - leftPublished;
  return (leftListing?.url ?? '').localeCompare(rightListing?.url ?? '');
}

function isLiepinDirectHireUrl(value: string): boolean {
  try { return new URL(value).hostname === 'www.liepin.com' && /^\/job\/\d+\.shtml$/i.test(new URL(value).pathname); }
  catch { return false; }
}
