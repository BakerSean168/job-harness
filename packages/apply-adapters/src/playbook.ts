import { z } from 'zod';
import type { FieldBinding, FillPlan, FillReport, FormIR } from '@job-harness/apply-contracts';
import { buildFillPlan, normalizeFieldText } from '@job-harness/apply-core';
import type { BrowserDriverPort } from '@job-harness/apply-browser';
import { fillGenericForm, inspectGenericForm } from './generic-form';
import type { ApplicantDataProviderPort } from './applicant-data';
import type { ApplyFillAssets, ApplySiteAdapter, ApplyValidationIssue } from './site-adapter';
import { inspectApplyPagePreflight } from './page-preflight';

export const AtsPlaybookSchema = z.object({
  id: z.string().trim().min(1).max(200),
  version: z.string().trim().min(1).max(100),
  hosts: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
  pathPrefixes: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
  fieldRules: z.array(z.object({
    applicantKey: z.string().trim().min(1).max(240),
    labelEquals: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
    nameEquals: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  }).strict()).max(1000).default([]),
}).strict();
export type AtsPlaybook = z.infer<typeof AtsPlaybookSchema>;

export class PlaybookAtsSiteAdapter implements ApplySiteAdapter {
  readonly descriptor;
  private readonly playbook: AtsPlaybook;

  constructor(raw: AtsPlaybook) {
    this.playbook = AtsPlaybookSchema.parse(raw);
    this.descriptor = {
      id: `playbook:${this.playbook.id}`,
      version: this.playbook.version,
      semantics: 'formal_application' as const,
      priority: 100,
      capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
    };
  }

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const hostMatched = this.playbook.hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
      const pathMatched = !this.playbook.pathPrefixes.length || this.playbook.pathPrefixes.some((prefix) => url.pathname.startsWith(prefix));
      return { supported: hostMatched && pathMatched, score: hostMatched && pathMatched ? 0.98 : 0, reason: hostMatched && pathMatched ? 'declarative-playbook-match' : 'playbook-mismatch' };
    } catch { return { supported: false, score: 0, reason: 'invalid-url' }; }
  }

  preflight(browser: BrowserDriverPort) {
    return inspectApplyPagePreflight(browser);
  }

  inspect(browser: BrowserDriverPort, input: { url: string; title?: string | null; observedAt: string }) {
    return inspectGenericForm(browser, { ...input, adapterId: this.descriptor.id, adapterVersion: this.descriptor.version });
  }

  explicitBindings(form: FormIR): readonly FieldBinding[] {
    const bindings: FieldBinding[] = [];
    for (const field of form.fields) {
      const label = normalizeFieldText(field.label);
      const name = normalizeFieldText(field.name ?? '');
      const matches = this.playbook.fieldRules.filter((rule) =>
        rule.labelEquals.some((candidate) => normalizeFieldText(candidate) === label)
        || (name && rule.nameEquals.some((candidate) => normalizeFieldText(candidate) === name)));
      if (matches.length !== 1) continue;
      bindings.push({ fieldId: field.id, applicantKey: matches[0]!.applicantKey, confidence: 1, source: 'playbook', reason: `playbook:${this.playbook.id}` });
    }
    return bindings;
  }

  async fill(browser: BrowserDriverPort, form: FormIR, plan: FillPlan, applicant: ApplicantDataProviderPort, assets?: ApplyFillAssets): Promise<FillReport> {
    return fillGenericForm(browser, form, plan, applicant, assets);
  }

  async validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null) {
    const issues: ApplyValidationIssue[] = [];
    const required = new Set(form.fields.filter((field) => field.required).map((field) => field.id));
    for (const pending of plan.pending) if (pending.required) issues.push({ code: 'required_field_pending', severity: 'blocking', fieldId: pending.fieldId, summary: pending.reason });
    for (const result of fillReport?.results ?? []) {
      if (result.status === 'failed') issues.push({ code: 'field_fill_failed', severity: required.has(result.fieldId) ? 'blocking' : 'warning', fieldId: result.fieldId, summary: result.detail ?? 'browser_write_failed' });
      if (result.status === 'manual' && required.has(result.fieldId)) issues.push({ code: 'required_field_manual', severity: 'blocking', fieldId: result.fieldId, summary: result.detail ?? 'manual_review_required' });
    }
    return {
      readyForReview: !issues.some((issue) => issue.severity === 'blocking'),
      // Declarative playbooks currently describe field mapping only. They do
      // not define an irreversible submit action or success-evidence contract.
      readyForSubmit: false,
      issues,
    };
  }

  buildPlan(form: FormIR, catalog: Parameters<typeof buildFillPlan>[1]): FillPlan {
    return buildFillPlan(form, catalog, { explicitBindings: this.explicitBindings(form) });
  }
}

export const BOSS_OUTREACH_DESCRIPTOR = {
  id: 'boss-outreach',
  version: '2026-09-18.1',
  semantics: 'outreach' as const,
  priority: 200,
  capabilities: { inspect: true, enter: false, fill: false, validate: false, submit: false },
} as const;

export class BossOutreachSiteAdapter implements ApplySiteAdapter {
  readonly descriptor = BOSS_OUTREACH_DESCRIPTOR;

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = (url.hostname === 'www.zhipin.com' || url.hostname === 'zhipin.com')
        && (/^\/job_detail\//i.test(url.pathname) || /^\/companys\//i.test(url.pathname));
      return { supported, score: supported ? 0.995 : 0, reason: supported ? 'boss-outreach-family' : 'boss-mismatch' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }

  inspect(browser: BrowserDriverPort, input: { url: string; title?: string | null; observedAt: string }) {
    return inspectGenericForm(browser, { ...input, adapterId: this.descriptor.id, adapterVersion: this.descriptor.version });
  }

  async validate(): Promise<{ readyForReview: boolean; readyForSubmit: boolean; issues: readonly ApplyValidationIssue[] }> {
    return {
      readyForReview: false,
      readyForSubmit: false,
      issues: [{
        code: 'outreach_requires_dedicated_runtime',
        severity: 'blocking',
        fieldId: null,
        summary: 'BOSS immediate-contact actions are outreach, not formal application submit, and require a dedicated outreach execution contract.',
      }],
    };
  }
}
