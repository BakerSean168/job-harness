import samplesData from '../content/resume-learning/samples.json';
import guideData from '../content/resume-learning/guide.json';

export type SampleQuality = 'good' | 'mixed' | 'bad-example';

export interface ResumeSampleExcerpt {
  section: string;
  text: string;
}

export interface ResumeSample {
  id: string;
  title: string;
  source_url: string;
  source_type: string;
  /** YYYY or YYYY-MM; null when the source gives no usable date. */
  resume_date: string | null;
  /** How the date was inferred, verbatim from the collector. */
  date_note: string | null;
  target_role: string;
  role_tags: string[];
  level: string;
  level_tags: string[];
  graduation_year: number | null;
  language: 'zh' | 'en';
  outcome: string | null;
  tags: string[];
  sections: string[];
  excerpts: ResumeSampleExcerpt[];
  why_good: string;
  quality: SampleQuality;
  license_note: string | null;
}

export type RuleStrength = 'must' | 'should' | 'avoid';
export type RuleConsensus = 'multi' | 'single' | 'conflict';

export interface WritingRule {
  id: string;
  section: string;
  rule: string;
  strength: RuleStrength;
  consensus: RuleConsensus;
  sources: string[];
}

export interface WritingGuideSection {
  id: string;
  title: string;
  templates: string[];
  examples: { bad: string; good: string; why: string | null }[];
}

export interface WritingGuide {
  version: string;
  evidenceNote: string;
  sources: { id: string; title: string; url: string; date: string; type: string }[];
  skillLevels: { word: string; meaning: string; depth: string }[];
  verbs: { group: string; words: string }[];
  sections: WritingGuideSection[];
  rules: WritingRule[];
}

export const resumeSamples = samplesData as ResumeSample[];
export const writingGuide = guideData as WritingGuide;

/** Rule sections that render inside a broader guide section. */
const RULE_SECTION_ALIASES: Record<string, string> = { header: 'education', awards: 'education' };

export function rulesForSection(guide: WritingGuide, sectionId: string): WritingRule[] {
  return guide.rules.filter((rule) => (RULE_SECTION_ALIASES[rule.section] ?? rule.section) === sectionId);
}

export interface SampleFilter {
  role?: string | undefined;
  year?: string | undefined;
  level?: string | undefined;
  language?: string | undefined;
  quality?: string | undefined;
  q?: string | undefined;
}

export function sampleYear(sample: ResumeSample): string | null {
  return sample.resume_date ? sample.resume_date.slice(0, 4) : null;
}

export function filterSamples(samples: readonly ResumeSample[], filter: SampleFilter): ResumeSample[] {
  const q = filter.q?.trim().toLowerCase();
  return samples
    .filter((s) => !filter.role || s.role_tags.includes(filter.role))
    .filter((s) => !filter.year || sampleYear(s) === filter.year)
    .filter((s) => !filter.level || s.level_tags.includes(filter.level))
    .filter((s) => !filter.language || s.language === filter.language)
    .filter((s) => !filter.quality || s.quality === filter.quality)
    .filter((s) => {
      if (!q) return true;
      const haystack = [s.title, s.target_role, s.level, s.why_good, ...s.tags, ...s.excerpts.map((e) => e.text)].join('\n').toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => (b.resume_date ?? '').localeCompare(a.resume_date ?? '') || a.id.localeCompare(b.id));
}

export function facetValues(samples: readonly ResumeSample[]) {
  const uniq = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))];
  return {
    roles: uniq(samples.flatMap((s) => s.role_tags)),
    years: uniq(samples.map(sampleYear)).sort().reverse(),
    levels: uniq(samples.flatMap((s) => s.level_tags)),
  };
}
