import type { FillPlan, FillReport, FormIR } from '@job-harness/apply-contracts';
import type { BrowserDriverPort } from '@job-harness/apply-browser';
import { fillGenericForm, inspectGenericForm } from './generic-form';
import type { ApplicantDataProviderPort } from './applicant-data';
import type { ApplyFillAssets, ApplySiteAdapter, ApplyValidationIssue } from './site-adapter';

export class GenericAtsSiteAdapter implements ApplySiteAdapter {
  readonly descriptor = {
    id: 'generic-ats',
    version: '1.0.0',
    semantics: 'formal_application' as const,
    priority: 0,
    capabilities: { inspect: true, fill: true, validate: true, submit: false },
  };

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = url.protocol === 'https:' || url.protocol === 'http:';
      return { supported, score: supported ? 0.1 : 0, reason: supported ? 'generic-http-form-fallback' : 'unsupported-protocol' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }

  inspect(browser: BrowserDriverPort, input: { url: string; title?: string | null; observedAt: string }): Promise<FormIR> {
    return inspectGenericForm(browser, { ...input, adapterId: this.descriptor.id, adapterVersion: this.descriptor.version });
  }

  fill(browser: BrowserDriverPort, form: FormIR, plan: FillPlan, applicant: ApplicantDataProviderPort, assets?: ApplyFillAssets): Promise<FillReport> {
    return fillGenericForm(browser, form, plan, applicant, assets);
  }

  async validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null) {
    const issues: ApplyValidationIssue[] = [];
    const fields = new Map(form.fields.map((field) => [field.id, field]));
    for (const pending of plan.pending) {
      if (!pending.required) continue;
      issues.push({ code: 'required_field_pending', severity: 'blocking', fieldId: pending.fieldId, summary: pending.reason });
    }
    for (const result of fillReport?.results ?? []) {
      if (result.status === 'failed') {
        issues.push({ code: 'field_fill_failed', severity: fields.get(result.fieldId)?.required ? 'blocking' : 'warning', fieldId: result.fieldId, summary: result.detail ?? 'browser_write_failed' });
      } else if (result.status === 'manual' && fields.get(result.fieldId)?.required) {
        issues.push({ code: 'required_field_manual', severity: 'blocking', fieldId: result.fieldId, summary: result.detail ?? 'manual_review_required' });
      }
    }
    return { readyForReview: !issues.some((issue) => issue.severity === 'blocking'), issues };
  }
}
