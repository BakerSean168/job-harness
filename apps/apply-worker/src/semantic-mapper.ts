import {
  SemanticMappingProposalSchema,
  type SemanticMappingProposal,
  type SemanticMappingView,
} from '@job-harness/apply-contracts';
import type { SemanticFieldMapperPort } from './form-fill-engine';

export interface OpenAiSemanticFieldMapperOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface OpenAiChatResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: unknown;
    };
  }[];
}

export class OpenAiSemanticFieldMapper implements SemanticFieldMapperPort {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiSemanticFieldMapperOptions) {
    this.baseUrl = normalizeOpenAiBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey.trim();
    this.model = options.model.trim();
    this.timeoutMs = Math.max(1_000, Math.min(60_000, options.timeoutMs ?? 20_000));
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!this.apiKey) throw new Error('Semantic field mapper requires an API key');
    if (!this.model) throw new Error('Semantic field mapper requires a model');
  }

  async propose(view: SemanticMappingView): Promise<readonly SemanticMappingProposal[]> {
    const safeView = {
      fields: view.fields.map((field) => ({
        id: field.id,
        type: field.type,
        label: field.label,
        name: field.name,
        description: field.description,
        required: field.required,
        options: field.options.map((option) => ({ label: option.label, disabled: option.disabled })),
        semanticHints: field.semanticHints,
        sensitivityHint: field.sensitivityHint,
      })),
      catalog: view.catalog
        .filter((entry) => entry.allowAiMapping && entry.sensitivity !== 'legal' && entry.sensitivity !== 'protected')
        .map((entry) => ({
          key: entry.key,
          label: entry.label,
          valueType: entry.valueType,
          sensitivity: entry.sensitivity,
          aliases: entry.aliases,
        })),
    };

    if (!safeView.fields.length || !safeView.catalog.length) return [];

    const response = await this.fetchImpl(this.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You map recruiting form field metadata to canonical applicant-data keys.',
              'The input contains no applicant values. Never invent a value or infer protected/legal facts.',
              'Return JSON only: {"mappings":[{"fieldId":"...","applicantKey":"...","confidence":0.0,"reason":"..."}]}.',
              'Use only field ids and applicant keys present in the input. Omit uncertain mappings.',
              'Prefer semantic meaning over visual order. Confidence must reflect exactness; use >=0.93 only for clear matches.',
              'One field may have at most one mapping.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify(safeView),
          },
        ],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error('Semantic mapper HTTP ' + response.status + ': ' + sanitizeProviderError(rawText));
    }
    const parsedResponse = parseJson(rawText, 'semantic mapper response') as OpenAiChatResponse;
    const content = parsedResponse.choices?.[0]?.message?.content;
    const payload = parseContent(content);
    const rawMappings = payload && typeof payload === 'object' && !Array.isArray(payload)
      && Array.isArray((payload as { mappings?: unknown }).mappings)
      ? (payload as { mappings: unknown[] }).mappings
      : [];

    const allowedFields = new Set(safeView.fields.map((field) => field.id));
    const allowedKeys = new Set(safeView.catalog.map((entry) => entry.key));
    const best = new Map<string, SemanticMappingProposal>();

    for (const raw of rawMappings) {
      const parsed = SemanticMappingProposalSchema.safeParse(raw);
      if (!parsed.success) continue;
      const proposal = parsed.data;
      if (!allowedFields.has(proposal.fieldId) || !allowedKeys.has(proposal.applicantKey)) continue;
      const existing = best.get(proposal.fieldId);
      if (!existing || proposal.confidence > existing.confidence) best.set(proposal.fieldId, proposal);
    }

    return [...best.values()].sort((left, right) => left.fieldId.localeCompare(right.fieldId));
  }
}

function normalizeOpenAiBaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Semantic mapper base URL must be http(s)');
  const normalized = url.toString().replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? normalized : normalized + '/v1';
}

function parseContent(value: unknown): unknown {
  if (typeof value === 'string') return parseJson(value, 'semantic mapper message content');
  if (Array.isArray(value)) {
    const text = value.flatMap((item) =>
      item && typeof item === 'object' && 'text' in item && typeof (item as { text?: unknown }).text === 'string'
        ? [(item as { text: string }).text]
        : [],
    ).join('');
    return parseJson(text, 'semantic mapper message content');
  }
  throw new Error('Semantic mapper returned no JSON message content');
}

function parseJson(raw: string, label: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(label + ' was empty');
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      try { return JSON.parse(fenced); } catch { /* fall through */ }
    }
    throw new Error(label + ' was not valid JSON');
  }
}

function sanitizeProviderError(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}
