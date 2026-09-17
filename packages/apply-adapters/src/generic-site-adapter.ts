import { FillReportSchema, type FillPlan, type FillReport, type FormIR } from '@job-harness/apply-contracts';
import type { BrowserDriverPort } from '@job-harness/apply-browser';
import { fillGenericForm, inspectGenericForm } from './generic-form';
import type { ApplicantDataProviderPort } from './applicant-data';
import type { ApplyFillAssets, ApplySiteAdapter, ApplyValidationIssue } from './site-adapter';
import { inspectApplyPagePreflight } from './page-preflight';

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

  preflight(browser: BrowserDriverPort) {
    return inspectApplyPagePreflight(browser);
  }

  inspect(browser: BrowserDriverPort, input: { url: string; title?: string | null; observedAt: string }): Promise<FormIR> {
    return inspectGenericForm(browser, { ...input, adapterId: this.descriptor.id, adapterVersion: this.descriptor.version });
  }

  fill(browser: BrowserDriverPort, form: FormIR, plan: FillPlan, applicant: ApplicantDataProviderPort, assets?: ApplyFillAssets): Promise<FillReport> {
    if (isAuthenticationSurface(form)) {
      const results = plan.instructions.map((instruction) => ({
        fieldId: instruction.fieldId,
        applicantKey: instruction.applicantKey,
        status: 'manual' as const,
        method: instruction.method,
        detail: 'authentication_surface_detected',
      }));
      return Promise.resolve(FillReportSchema.parse({
        results,
        filled: 0,
        skipped: 0,
        failed: 0,
        manual: results.length,
      }));
    }
    return fillGenericForm(browser, form, plan, applicant, assets);
  }

  async validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null) {
    const issues: ApplyValidationIssue[] = [];
    if (isAuthenticationSurface(form)) {
      issues.push({
        code: 'authentication_surface_detected',
        severity: 'blocking',
        fieldId: null,
        summary: 'Generic form automation refuses login, registration, password, OTP or verification-code surfaces.',
      });
    } else if (!looksLikeApplicationForm(form)) {
      issues.push({
        code: 'application_form_not_detected',
        severity: 'blocking',
        fieldId: null,
        summary: 'The generic fallback did not detect enough application-form evidence on the current page.',
      });
    }
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
    return {
      readyForReview: !issues.some((issue) => issue.severity === 'blocking'),
      // The generic fallback can inspect/fill arbitrary forms, but it has no
      // site-specific submit semantics or confirmation proof. Human review is
      // allowed; submit authorization must remain impossible.
      readyForSubmit: false,
      issues,
    };
  }
}


function fieldEvidence(form: FormIR): string {
  return form.fields.map((field) => [field.label, field.name ?? '', field.description ?? '', ...field.semanticHints].join(' ')).join(' ').toLowerCase();
}

function isAuthenticationSurface(form: FormIR): boolean {
  const evidence = fieldEvidence(form);
  return /验证码|短信码|密码|登录|注册|verification\s*code|one[- ]?time|\botp\b|password|sign\s*in|log\s*in|register|sign\s*up/i.test(evidence);
}

function looksLikeApplicationForm(form: FormIR): boolean {
  if (form.fields.length >= 2) return true;
  if (form.fields.some((field) => field.type === 'email' || field.type === 'tel' || field.type === 'file' || field.type === 'textarea')) return true;
  const evidence = fieldEvidence(form);
  return /姓名|邮箱|电子邮件|手机|电话|简历|学校|院校|学历|专业|工作经历|项目经历|github|作品集|候选人|candidate|full\s*name|e-?mail|phone|mobile|resume|curriculum\s+vitae|\bcv\b|university|school|degree|major|experience|portfolio/.test(evidence);
}
