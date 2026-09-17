import {
  FillPlanSchema,
  SemanticMappingViewSchema,
  type ApplicantFieldCatalog,
  type ApplicantFieldCatalogEntry,
  type FieldBinding,
  type FieldIR,
  type FillMethod,
  type FillPlan,
  type FormIR,
  type SemanticMappingProposal,
  type SemanticMappingView,
} from '@job-harness/apply-contracts';

const HIGH_RISK_FIELD_RE = /(?:sponsor|visa|work\s*authori[sz]ation|citizen|nationality|ethnicity|race|gender|sex|disabil|veteran|criminal|convict|身份证|护照|国籍|民族|性别|残疾|服兵役|工作许可|签证|犯罪|政审)/i;

export interface BuildFillPlanOptions {
  readonly explicitBindings?: readonly FieldBinding[];
  readonly semanticProposals?: readonly SemanticMappingProposal[];
  readonly semanticConfidenceThreshold?: number;
  readonly formVersion?: string;
}

export function normalizeFieldText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '')
    .trim();
}

export function inferFieldSensitivity(field: FieldIR): FieldIR['sensitivityHint'] {
  if (field.sensitivityHint) return field.sensitivityHint;
  const text = [field.label, field.name ?? '', field.description ?? '', ...field.semanticHints].join(' ');
  return HIGH_RISK_FIELD_RE.test(text) ? 'legal' : null;
}

export function buildSemanticMappingView(form: FormIR, catalog: ApplicantFieldCatalog): SemanticMappingView {
  return SemanticMappingViewSchema.parse({
    fields: form.fields.map((field) => ({
      id: field.id,
      type: field.type,
      label: field.label,
      name: field.name,
      description: field.description,
      required: field.required,
      options: field.options,
      semanticHints: field.semanticHints,
      sensitivityHint: inferFieldSensitivity(field),
    })),
    catalog: catalog.entries.map((entry) => ({
      key: entry.key,
      label: entry.label,
      valueType: entry.valueType,
      sensitivity: entry.sensitivity,
      aliases: entry.aliases,
      allowAiMapping: entry.allowAiMapping,
    })),
  });
}

export function buildFillPlan(form: FormIR, catalog: ApplicantFieldCatalog, options: BuildFillPlanOptions = {}): FillPlan {
  const threshold = Math.max(0, Math.min(1, options.semanticConfidenceThreshold ?? 0.93));
  const entries = new Map(catalog.entries.map((entry) => [entry.key, entry]));
  const fields = new Map(form.fields.map((field) => [field.id, field]));
  const bindings = new Map<string, FieldBinding>();
  const prohibited = new Map<string, string>();

  for (const raw of options.explicitBindings ?? []) {
    const field = fields.get(raw.fieldId);
    const entry = entries.get(raw.applicantKey);
    if (!field || !entry) continue;
    if (!isCompatible(field, entry)) continue;
    bindings.set(field.id, { ...raw, confidence: Math.max(0, Math.min(1, raw.confidence)) });
  }

  for (const field of form.fields) {
    if (bindings.has(field.id)) continue;
    if (field.disabled || field.readOnly) {
      prohibited.set(field.id, field.disabled ? 'control_disabled' : 'control_read_only');
      continue;
    }
    const deterministic = bestDeterministicBinding(field, catalog.entries);
    if (deterministic) bindings.set(field.id, deterministic);
  }

  for (const proposal of options.semanticProposals ?? []) {
    if (bindings.has(proposal.fieldId) || prohibited.has(proposal.fieldId)) continue;
    if (proposal.confidence < threshold) continue;
    const field = fields.get(proposal.fieldId);
    const entry = entries.get(proposal.applicantKey);
    if (!field || !entry || !entry.allowAiMapping || !isCompatible(field, entry)) continue;
    const sensitivity = inferFieldSensitivity(field) ?? entry.sensitivity;
    if (sensitivity === 'legal' || sensitivity === 'protected') continue;
    bindings.set(field.id, {
      fieldId: field.id,
      applicantKey: entry.key,
      confidence: proposal.confidence,
      source: 'semantic',
      reason: proposal.reason,
    });
  }

  const instructions = [];
  const pending = [];
  for (const field of form.fields) {
    const binding = bindings.get(field.id);
    if (binding) {
      const entry = entries.get(binding.applicantKey)!;
      const method = fillMethod(field, entry);
      if (method === 'manual') {
        pending.push({ fieldId: field.id, required: field.required, reason: 'unsupported_control_or_value_type' });
      } else {
        instructions.push({ fieldId: field.id, applicantKey: binding.applicantKey, method, source: binding.source, confidence: binding.confidence });
      }
      continue;
    }
    if (prohibited.has(field.id)) continue;
    const sensitivity = inferFieldSensitivity(field);
    pending.push({
      fieldId: field.id,
      required: field.required,
      reason: sensitivity === 'legal' || sensitivity === 'protected'
        ? 'sensitive_field_requires_explicit_literal_binding'
        : field.required ? 'required_field_unmapped' : 'optional_field_unmapped',
    });
  }

  return FillPlanSchema.parse({
    version: 1,
    formVersion: options.formVersion ?? fingerprintForm(form),
    catalogVersion: catalog.version,
    bindings: [...bindings.values()],
    instructions,
    pending,
    prohibited: [...prohibited].map(([fieldId, reason]) => ({ fieldId, reason })),
  });
}

function bestDeterministicBinding(field: FieldIR, catalog: readonly ApplicantFieldCatalogEntry[]): FieldBinding | null {
  const sensitivity = inferFieldSensitivity(field);
  const candidates = catalog
    .filter((entry) => isCompatible(field, entry))
    .map((entry) => ({ entry, score: scoreEntry(field, entry) }))
    .filter((candidate) => candidate.score >= 0.86)
    .sort((left, right) => right.score - left.score || left.entry.key.localeCompare(right.entry.key));
  if (!candidates.length) return null;
  if (candidates[1] && Math.abs(candidates[0]!.score - candidates[1].score) < 0.03) return null;
  const winner = candidates[0]!;
  if ((sensitivity === 'legal' || sensitivity === 'protected' || winner.entry.sensitivity === 'legal' || winner.entry.sensitivity === 'protected') && winner.score < 0.999) {
    return null;
  }
  return {
    fieldId: field.id,
    applicantKey: winner.entry.key,
    confidence: winner.score,
    source: 'rule',
    reason: winner.score >= 0.999 ? 'exact-normalized-label-or-hint' : 'conservative-alias-match',
  };
}

function scoreEntry(field: FieldIR, entry: ApplicantFieldCatalogEntry): number {
  const signals = [field.label, field.name ?? '', ...field.semanticHints]
    .map(normalizeFieldText)
    .filter(Boolean);
  const keyTail = entry.key.split('.').at(-1)?.replace(/\[\d+\]/g, '') ?? entry.key;
  const aliases = [entry.label, ...entry.aliases, keyTail]
    .map(normalizeFieldText)
    .filter(Boolean);
  let score = 0;
  for (const signal of signals) {
    for (const alias of aliases) {
      if (signal === alias) score = Math.max(score, 1);
      else {
        const cjk = /[\u3400-\u9fff]/u.test(alias);
        const boundaryMin = cjk ? 2 : 5;
        const containsMin = cjk ? 2 : 6;
        if (alias.length >= boundaryMin && (signal.startsWith(alias) || signal.endsWith(alias))) score = Math.max(score, 0.94);
        else if (alias.length >= containsMin && signal.includes(alias)) score = Math.max(score, 0.88);
      }
    }
  }
  return score;
}

function isCompatible(field: FieldIR, entry: ApplicantFieldCatalogEntry): boolean {
  if (field.type === 'file') return entry.valueType === 'file';
  if (field.type === 'checkbox') return entry.valueType === 'boolean' || entry.valueType === 'multi_choice';
  if (field.type === 'radio' || field.type === 'select') return ['choice','multi_choice','boolean','text'].includes(entry.valueType);
  if (field.type === 'email') return entry.valueType === 'email' || entry.valueType === 'text';
  if (field.type === 'tel') return entry.valueType === 'phone' || entry.valueType === 'text';
  if (field.type === 'url') return entry.valueType === 'url' || entry.valueType === 'text';
  if (field.type === 'number') return entry.valueType === 'number' || entry.valueType === 'text';
  if (field.type === 'date') return entry.valueType === 'date' || entry.valueType === 'text';
  if (field.type === 'textarea') return entry.valueType === 'multiline' || entry.valueType === 'text';
  return entry.valueType !== 'file';
}

function fillMethod(field: FieldIR, entry: ApplicantFieldCatalogEntry): FillMethod {
  if (!isCompatible(field, entry)) return 'manual';
  if (field.type === 'file') return 'attach_file';
  if (field.type === 'select' || field.type === 'radio') return 'select_option';
  if (field.type === 'checkbox') return 'set_checked';
  if (field.type === 'unknown') return 'manual';
  return 'set_text';
}

function fingerprintForm(form: FormIR): string {
  const stable = form.fields.map((field) => [field.id, field.type, field.label, field.name, field.required, field.options.map((option) => option.label)]);
  let hash = 2166136261;
  const text = JSON.stringify(stable);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `form-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
