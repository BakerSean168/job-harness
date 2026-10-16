import guideData from '../content/outreach-learning/guide.json';
import samplesData from '../content/outreach-learning/samples.json';

export interface OutreachSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
}

export interface OutreachExample {
  bad: string;
  good: string;
  why: string | null;
}

export interface OutreachSection {
  id: 'boss' | 'resume' | 'email';
  title: string;
  subtitle: string;
  facts: { label: string; text: string }[];
  donts: string[];
  examples: OutreachExample[];
  checklist: string[];
  /** Ids into OutreachGuide.sources. */
  sources: string[];
}

export interface OutreachGuide {
  version: string;
  scopeNote: string;
  sources: OutreachSource[];
  sections: OutreachSection[];
}

export interface OutreachSample {
  id: string;
  lane: string;
  kind: 'boss-greeting';
  /** Always 示例: Arlon's drafts are samples and may still change. */
  status: string;
  version: string;
  text: string;
}

export const outreachGuide = guideData as OutreachGuide;
export const outreachSamples = samplesData as OutreachSample[];

/** HR's BOSS message list only shows roughly the first 17–18 characters of a greeting. */
export const GREETING_PREVIEW_CHARS = 18;

/** Counts user-perceived characters (CJK and Latin alike count as one). */
export function charCount(text: string): number {
  return [...text].length;
}

/** Splits a greeting into the part visible in HR's message list and the rest. */
export function greetingPreview(text: string, limit = GREETING_PREVIEW_CHARS): { head: string; rest: string } {
  const chars = [...text];
  return { head: chars.slice(0, limit).join(''), rest: chars.slice(limit).join('') };
}
