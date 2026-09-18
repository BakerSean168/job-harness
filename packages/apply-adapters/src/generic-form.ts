import {
  FillReportSchema,
  FormIRSchema,
  type FillPlan,
  type FormIR,
  type FormFieldType,
} from '@job-harness/apply-contracts';
import { inferFieldSensitivity, normalizeFieldText } from '@job-harness/apply-core';
import type { BrowserControlSnapshot, BrowserDriverPort } from '@job-harness/apply-browser';
import type { ApplicantDataProviderPort } from './applicant-data';
import type { ApplyFillAssets } from './site-adapter';

export interface GenericFormSnapshotInput {
  readonly url: string;
  readonly title?: string | null;
  readonly observedAt: string;
  readonly adapterId?: string;
  readonly adapterVersion?: string;
  readonly controls: readonly BrowserControlSnapshot[];
}

export function browserControlsToFormIr(input: GenericFormSnapshotInput): FormIR {
  const pageId = 'page-1';
  const sectionByLabel = new Map<string, { id: string; title: string; fieldIds: string[] }>();
  const fields = input.controls.map((control, index) => {
    const id = `field-${index + 1}-${shortHash(control.controlRef)}`;
    let sectionId: string | null = null;
    if (control.sectionLabel) {
      const normalized = normalizeFieldText(control.sectionLabel);
      const existing = sectionByLabel.get(normalized);
      const section = existing ?? { id: `section-${sectionByLabel.size + 1}-${shortHash(control.sectionLabel)}`, title: control.sectionLabel, fieldIds: [] };
      if (!existing) sectionByLabel.set(normalized, section);
      section.fieldIds.push(id);
      sectionId = section.id;
    }
    const raw = {
      id,
      pageId,
      sectionId,
      controlRef: control.controlRef,
      type: control.kind as FormFieldType,
      label: control.label,
      name: control.name,
      description: control.description,
      required: control.required,
      disabled: control.disabled,
      readOnly: control.readOnly,
      options: control.options,
      semanticHints: control.semanticHints,
      sensitivityHint: null,
      accept: control.accept,
      multiple: control.multiple,
    };
    const parsed = FormIRSchema.shape.fields.element.parse(raw);
    return { ...parsed, sensitivityHint: inferFieldSensitivity(parsed) };
  });
  const sections = [...sectionByLabel.values()].map((section) => ({ id: section.id, pageId, title: section.title, fieldIds: section.fieldIds }));
  const url = new URL(input.url);
  return FormIRSchema.parse({
    version: 1,
    observedAt: input.observedAt,
    source: { adapterId: input.adapterId ?? 'generic-form', adapterVersion: input.adapterVersion ?? '1.0.0', host: url.hostname },
    pages: [{ id: pageId, url: url.toString(), title: input.title ?? null, sectionIds: sections.map((section) => section.id), fieldIds: fields.map((field) => field.id) }],
    sections,
    fields,
  });
}

export async function inspectGenericForm(browser: BrowserDriverPort, input: Omit<GenericFormSnapshotInput, 'controls'>): Promise<FormIR> {
  return browserControlsToFormIr({ ...input, controls: await browser.scanControls() });
}

export async function fillGenericForm(
  browser: BrowserDriverPort,
  form: FormIR,
  plan: FillPlan,
  applicant: ApplicantDataProviderPort,
  assets: ApplyFillAssets = {},
) {
  const nonFileKeys = plan.instructions.filter((instruction) => instruction.method !== 'attach_file').map((instruction) => instruction.applicantKey);
  const values = nonFileKeys.length > 0
    ? await applicant.resolve(nonFileKeys)
    : { catalogVersion: plan.catalogVersion, values: [] };
  if (values.catalogVersion !== plan.catalogVersion) throw new Error(`Applicant catalog changed: plan=${plan.catalogVersion}, resolved=${values.catalogVersion}`);
  const byKey = new Map(values.values.map((value) => [value.key, value]));
  const fields = new Map(form.fields.map((field) => [field.id, field]));
  const results: Array<{ fieldId: string; applicantKey: string; status: 'filled'|'skipped'|'failed'|'manual'; method: FillPlan['instructions'][number]['method']; detail: string | null }> = [];

  for (const instruction of plan.instructions) {
    const field = fields.get(instruction.fieldId);
    if (!field) {
      results.push({ fieldId: instruction.fieldId, applicantKey: instruction.applicantKey, status: 'manual', method: instruction.method, detail: 'missing_form_field' });
      continue;
    }
    if (instruction.method === 'attach_file') {
      try {
        if (instruction.applicantKey !== 'documents.resume' || !assets.resumeFile) {
          results.push({ fieldId: field.id, applicantKey: instruction.applicantKey, status: 'manual', method: instruction.method, detail: 'immutable_artifact_grant_required' });
          continue;
        }
        await browser.upload(field.controlRef, assets.resumeFile);
        results.push({ fieldId: field.id, applicantKey: instruction.applicantKey, status: 'filled', method: instruction.method, detail: null });
      } catch {
        results.push({ fieldId: field.id, applicantKey: instruction.applicantKey, status: 'failed', method: instruction.method, detail: 'browser_upload_failed' });
      }
      continue;
    }
    const resolved = byKey.get(instruction.applicantKey);
    if (!resolved) {
      results.push({ fieldId: instruction.fieldId, applicantKey: instruction.applicantKey, status: 'manual', method: instruction.method, detail: 'missing_literal_value' });
      continue;
    }
    if (!resolved.literal) {
      results.push({ fieldId: field.id, applicantKey: resolved.key, status: 'manual', method: instruction.method, detail: 'non_literal_value_rejected' });
      continue;
    }
    try {
      if (instruction.method === 'set_checked') {
        if (typeof resolved.value !== 'boolean') {
          results.push({ fieldId: field.id, applicantKey: resolved.key, status: 'manual', method: instruction.method, detail: 'boolean_value_required' });
          continue;
        }
        await browser.setChecked(field.controlRef, resolved.value);
      } else if (instruction.method === 'select_option') {
        const target = chooseOption(field.options, resolved.value);
        if (target == null) {
          results.push({ fieldId: field.id, applicantKey: resolved.key, status: 'manual', method: instruction.method, detail: 'no_exact_option_match' });
          continue;
        }
        await browser.select(field.controlRef, target);
      } else if (instruction.method === 'set_text') {
        await browser.fill(field.controlRef, scalarText(resolved.value));
      } else {
        results.push({ fieldId: field.id, applicantKey: resolved.key, status: 'manual', method: instruction.method, detail: 'manual_instruction' });
        continue;
      }
      results.push({ fieldId: field.id, applicantKey: resolved.key, status: 'filled', method: instruction.method, detail: null });
    } catch {
      results.push({ fieldId: field.id, applicantKey: resolved.key, status: 'failed', method: instruction.method, detail: 'browser_write_failed' });
    }
  }

  return FillReportSchema.parse({
    results,
    filled: results.filter((result) => result.status === 'filled').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    failed: results.filter((result) => result.status === 'failed').length,
    manual: results.filter((result) => result.status === 'manual').length,
  });
}

function scalarText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.length === 1) return String(value[0]);
  throw new Error('Expected scalar applicant value');
}

function chooseOption(options: FormIR['fields'][number]['options'], value: unknown): string | null {
  const candidates = Array.isArray(value) ? value.map(String) : [String(value)];
  for (const raw of candidates) {
    const normalized = normalizeFieldText(raw);
    const exactValue = options.find((option) => !option.disabled && normalizeFieldText(option.value) === normalized);
    if (exactValue) return exactValue.value;
    const exactLabel = options.find((option) => !option.disabled && normalizeFieldText(option.label) === normalized);
    if (exactLabel) return exactLabel.value;
  }
  return null;
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
