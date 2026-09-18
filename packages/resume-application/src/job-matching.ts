import type { ResumeProfile } from '@job-harness/resume-contracts';
import { LEGACY_COPILOT_SCORING } from './legacy-copilot-scoring';

export interface ResumeJobTarget {
  readonly title: string;
  readonly description?: string | null;
}

export interface KeywordMatch {
  readonly keyword: string;
  readonly score: number;
}

export interface ResumeJobMatch {
  readonly profileId: string;
  readonly profileName: string;
  readonly targetRole: string;
  readonly score: number;
  readonly decision: 'strong-match' | 'review' | 'low-match';
  readonly family: 'agent' | 'frontend' | 'fullstack' | 'generic';
  readonly titleScore: number;
  readonly detailScore: number;
  readonly supportScore: number;
  readonly comboScore: number;
  readonly titlePenaltyScore: number;
  readonly penaltyScore: number;
  readonly specializationScore: number;
  readonly matches: {
    readonly titleStrong: readonly KeywordMatch[];
    readonly titleMedium: readonly KeywordMatch[];
    readonly detailStrong: readonly KeywordMatch[];
    readonly detailSupport: readonly KeywordMatch[];
    readonly combos: readonly KeywordMatch[];
    readonly titleBlock: readonly KeywordMatch[];
    readonly detailNegative: readonly KeywordMatch[];
    readonly specialization: readonly KeywordMatch[];
  };
}

type ScoringConfig = {
  readonly titleBlockKeywords?: Readonly<Record<string, number>>;
  readonly titleStrongKeywords?: Readonly<Record<string, number>>;
  readonly titleMediumKeywords?: Readonly<Record<string, number>>;
  readonly detailStrongKeywords?: Readonly<Record<string, number>>;
  readonly detailSupportKeywords?: Readonly<Record<string, number>>;
  readonly detailNegativeKeywords?: Readonly<Record<string, number>>;
  readonly comboBonuses?: readonly { readonly keywords: readonly string[]; readonly score: number }[];
};

const SPECIALIZATION: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'ai-agent-forgeflow': {
    'Agent Harness': 16,
    Orchestration: 12,
    'Tool Calling': 10,
    'Tool Use': 8,
    MCP: 10,
    'Multi-Agent': 10,
    多Agent: 10,
    多智能体: 10,
    Supervisor: 9,
    Memory: 7,
    Planning: 7,
    Reflector: 7,
    'LLM-as-Judge': 7,
    自进化: 8,
    沙箱: 5,
  },
  'ai-agent-dongxu': {
    'Multi-Agent': 14,
    多Agent: 14,
    多智能体: 14,
    Supervisor: 12,
    LangGraph: 8,
    MCP: 8,
    Memory: 8,
    Reflector: 10,
    自进化: 8,
    gRPC: 5,
  },
};

function localized(value: ResumeProfile['name']): string {
  return value['zh-CN'] ?? value.en ?? Object.values(value)[0] ?? '';
}

function profileFamily(profileId: string): ResumeJobMatch['family'] {
  const value = profileId.toLowerCase();
  if (value.includes('frontend')) return 'frontend';
  if (value.includes('fullstack')) return 'fullstack';
  if (value.includes('agent')) return 'agent';
  return 'generic';
}

function configFor(profile: ResumeProfile): ScoringConfig | null {
  switch (profileFamily(profile.id)) {
    case 'agent': return LEGACY_COPILOT_SCORING['ai-agent-app'];
    case 'frontend': return LEGACY_COPILOT_SCORING['ai-frontend'];
    case 'fullstack': return LEGACY_COPILOT_SCORING['ai-fullstack'];
    case 'generic': return null;
  }
}

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeLoose(value: unknown): string {
  return normalize(value).replace(/[\s·•_—–-]+/g, '').replace(/[（）()【】\[\]]/g, '');
}

function containsKeyword(text: string, keyword: string): boolean {
  const source = normalize(text);
  const target = normalize(keyword);
  if (!source || !target) return false;
  if (/^[a-z0-9.+#/-]{1,3}$/i.test(target)) {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(source);
  }
  if (source.includes(target)) return true;
  return normalizeLoose(source).includes(normalizeLoose(target));
}

function findMatches(text: string, keywordScores: Readonly<Record<string, number>> = {}): KeywordMatch[] {
  return Object.entries(keywordScores)
    .filter(([keyword]) => containsKeyword(text, keyword))
    .map(([keyword, score]) => ({ keyword, score: Number(score) || 0 }))
    .sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword));
}

function findComboMatches(text: string, combos: ScoringConfig['comboBonuses'] = []): KeywordMatch[] {
  return (combos ?? [])
    .filter((combo) => combo.keywords.length > 1 && combo.keywords.every((keyword) => containsKeyword(text, keyword)))
    .map((combo) => ({ keyword: combo.keywords.join(' + '), score: Number(combo.score) || 0 }));
}

function sum(matches: readonly KeywordMatch[]): number {
  return matches.reduce((total, item) => total + item.score, 0);
}

function max(matches: readonly KeywordMatch[]): number {
  return matches.reduce((value, item) => Math.max(value, item.score), 0);
}

function clamp(value: number, min: number, maxValue: number): number {
  return Math.max(min, Math.min(maxValue, value));
}

function genericProfileScore(jobText: string, profile: ResumeProfile): number {
  const role = `${localized(profile.targetRole)} ${localized(profile.positioning)}`;
  const tokens = normalizeLoose(role).split(/[\s/,|]+/).filter((token) => token.length >= 2);
  const matched = tokens.filter((token) => containsKeyword(jobText, token));
  if (!tokens.length) return 0;
  return clamp(Math.round((matched.length / tokens.length) * 65), 0, 65);
}

export function scoreResumeProfileForJob(target: ResumeJobTarget, profile: ResumeProfile): ResumeJobMatch {
  const title = normalize(target.title);
  const detail = normalize(target.description);
  const combined = `${title}\n${detail}`;
  const config = configFor(profile);
  const family = profileFamily(profile.id);

  if (!config) {
    const score = genericProfileScore(combined, profile);
    return {
      profileId: profile.id,
      profileName: localized(profile.name),
      targetRole: localized(profile.targetRole),
      score,
      decision: score >= 72 ? 'strong-match' : score >= 52 ? 'review' : 'low-match',
      family,
      titleScore: 0,
      detailScore: score,
      supportScore: 0,
      comboScore: 0,
      titlePenaltyScore: 0,
      penaltyScore: 0,
      specializationScore: 0,
      matches: { titleStrong: [], titleMedium: [], detailStrong: [], detailSupport: [], combos: [], titleBlock: [], detailNegative: [], specialization: [] },
    };
  }

  const titleBlock = findMatches(title, config.titleBlockKeywords);
  const titleStrong = findMatches(title, config.titleStrongKeywords);
  const titleMedium = findMatches(title, config.titleMediumKeywords);
  const detailStrong = findMatches(detail, config.detailStrongKeywords);
  const detailSupport = findMatches(detail, config.detailSupportKeywords);
  const detailNegative = findMatches(detail, config.detailNegativeKeywords);
  const combos = findComboMatches(combined, config.comboBonuses);
  const specialization = findMatches(combined, SPECIALIZATION[profile.id] ?? {});

  const titleScore = Math.max(max(titleStrong), max(titleMedium));
  const detailScore = Math.min(sum(detailStrong), 48);
  const supportScore = Math.min(sum(detailSupport), 20);
  const comboScore = Math.min(sum(combos), 20);
  const titlePenaltyScore = Math.min(sum(titleBlock), 80);
  const penaltyScore = Math.min(sum(detailNegative), 45);
  const specializationCap = profile.id === 'ai-agent-forgeflow' ? 28 : profile.id === 'ai-agent-dongxu' ? 20 : 18;
  const specializationScore = Math.min(sum(specialization), specializationCap);
  let score = titleScore + detailScore + supportScore + comboScore + specializationScore - titlePenaltyScore - penaltyScore;
  if (titleBlock.length) score = Math.min(score, 45);
  score = clamp(Math.round(score), 0, 100);

  return {
    profileId: profile.id,
    profileName: localized(profile.name),
    targetRole: localized(profile.targetRole),
    score,
    decision: score >= 72 ? 'strong-match' : score >= 52 ? 'review' : 'low-match',
    family,
    titleScore,
    detailScore,
    supportScore,
    comboScore,
    titlePenaltyScore,
    penaltyScore,
    specializationScore,
    matches: { titleStrong, titleMedium, detailStrong, detailSupport, combos, titleBlock, detailNegative, specialization },
  };
}

export function rankResumeProfilesForJob(target: ResumeJobTarget, profiles: readonly ResumeProfile[]): ResumeJobMatch[] {
  return profiles
    .filter((profile) => profile.archivedAt == null)
    .map((profile) => scoreResumeProfileForJob(target, profile))
    .sort((left, right) => right.score - left.score || left.profileId.localeCompare(right.profileId));
}
