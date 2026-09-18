import type { FieldBinding, FillPlan, FillReport, FormIR } from '@job-harness/apply-contracts';
import type { BrowserDriverPort } from '@job-harness/apply-browser';
import { fillGenericForm, inspectGenericForm } from './generic-form';
import type { ApplicantDataProviderPort } from './applicant-data';
import { inspectApplyPagePreflight } from './page-preflight';
import { GenericAtsSiteAdapter } from './generic-site-adapter';
import type { ApplyApplicationEntryResult, ApplyFillAssets, ApplySiteAdapter, ApplySiteSubmitResult } from './site-adapter';

abstract class ObservedPublicAtsAdapter implements ApplySiteAdapter {
  abstract readonly descriptor: ApplySiteAdapter['descriptor'];
  private readonly generic = new GenericAtsSiteAdapter();

  abstract probe(input: { url: string }): ReturnType<ApplySiteAdapter['probe']>;

  preflight(browser: BrowserDriverPort) {
    return inspectApplyPagePreflight(browser);
  }

  inspect(browser: BrowserDriverPort, input: { url: string; title?: string | null; observedAt: string }): Promise<FormIR> {
    return inspectGenericForm(browser, { ...input, adapterId: this.descriptor.id, adapterVersion: this.descriptor.version });
  }

  fill(browser: BrowserDriverPort, form: FormIR, plan: FillPlan, applicant: ApplicantDataProviderPort, assets?: ApplyFillAssets): Promise<FillReport> {
    return fillGenericForm(browser, form, plan, applicant, assets);
  }

  async validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null) {
    const validation = await this.generic.validate(form, plan, fillReport);
    return { ...validation, readyForSubmit: false };
  }
}

export class NowcoderAtsSiteAdapter extends ObservedPublicAtsAdapter {
  readonly descriptor = {
    id: 'nowcoder-ats',
    version: '2026-09-18.4',
    semantics: 'formal_application' as const,
    priority: 180,
    capabilities: { inspect: true, enter: true, fill: true, validate: true, submit: true },
  };

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = (url.hostname === 'www.nowcoder.com' || url.hostname === 'nowcoder.com')
        && /^\/jobs\/detail\//.test(url.pathname);
      return { supported, score: supported ? 0.99 : 0, reason: supported ? 'nowcoder-job-detail-family' : 'nowcoder-mismatch' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }

  async enterApplication(browser: BrowserDriverPort, preflight: Awaited<ReturnType<typeof inspectApplyPagePreflight>>): Promise<ApplyApplicationEntryResult> {
    if (preflight.state !== 'job_detail') throw new Error(`Nowcoder application entry requires job_detail preflight, got '${preflight.state}'`);
    const actions = (await browser.scanActions())
      .filter((action) => !action.disabled && !action.ariaDisabled && action.text.replace(/\s+/g, ' ').trim() === '立即申请');
    if (actions.length !== 1) throw new Error(`Nowcoder application entry requires exactly one enabled '立即申请' action, found ${actions.length}`);
    const action = actions[0]!;
    await browser.click(action.actionRef, { expectedText: '立即申请' });
    await browser.wait(1200);
    let after = await inspectApplyPagePreflight(browser);
    if (!after.canInspectForm && after.state === 'job_detail') {
      const controls = await browser.scanControls();
      const resumeControls = controls.filter((control) => isNowcoderResumeControl(control));
      if (resumeControls.length === 1) {
        after = {
          ...after,
          state: 'application_form',
          canInspectForm: true,
          reasonCode: 'application_form_detected',
          summary: 'Nowcoder application modal with one resume document input was detected after the characterized entry action.',
          evidence: {
            ...after.evidence,
            controlCount: controls.length,
            controlKinds: [...new Set(controls.map((control) => control.kind))].sort(),
          },
        };
      }
    }
    return {
      action: { text: '立即申请', tag: action.tag, href: action.href },
      beforeState: preflight.state,
      after,
      navigationActionCount: 1,
    };
  }

  explicitBindings(form: FormIR): readonly FieldBinding[] {
    const primaryResumeFields = form.fields.filter((field) => isNowcoderPrimaryResumeField(field));
    const resumeFields = form.fields.filter((field) => isNowcoderResumeField(field));
    const target = primaryResumeFields.length === 1
      ? primaryResumeFields[0]
      : resumeFields.length === 1 ? resumeFields[0] : null;
    if (!target) return [];
    return [{
      fieldId: target.id,
      applicantKey: 'documents.resume',
      confidence: 1,
      source: 'playbook',
      reason: primaryResumeFields.length === 1
        ? 'nowcoder-primary-resume-upload-slot'
        : 'nowcoder-application-modal-single-resume-document-input',
    }];
  }

  async validate(form: FormIR, plan: FillPlan, fillReport?: FillReport | null) {
    const validation = await super.validate(form, plan, fillReport);
    const explicit = this.explicitBindings(form);
    const resumeBinding = plan.bindings.filter((binding) => binding.applicantKey === 'documents.resume');
    const resumeResult = fillReport?.results.find((result) => result.applicantKey === 'documents.resume') ?? null;
    const exactResumeAttached = explicit.length === 1
      && resumeBinding.length === 1
      && resumeBinding[0]!.fieldId === explicit[0]!.fieldId
      && resumeResult?.fieldId === explicit[0]!.fieldId
      && resumeResult.status === 'filled';
    return { ...validation, readyForSubmit: validation.readyForReview && exactResumeAttached };
  }

  async submit(browser: BrowserDriverPort): Promise<ApplySiteSubmitResult> {
    const actions = (await browser.scanActions())
      .filter((action) => !action.disabled && !action.ariaDisabled && action.text.replace(/\s+/g, ' ').trim() === '投递简历');
    if (actions.length !== 1) throw new Error(`Nowcoder submit requires exactly one enabled '投递简历' action, found ${actions.length}`);

    const appliedAt = new Date().toISOString();
    await browser.click(actions[0]!.actionRef, { expectedText: '投递简历' });
    let lastPreflight = await inspectApplyPagePreflight(browser);
    let confirmationAction: string | null = null;
    for (const delay of [1000, 1500, 2500]) {
      if (lastPreflight.state === 'submitted_state') break;
      await browser.wait(delay);
      lastPreflight = await inspectApplyPagePreflight(browser);
    }
    if (lastPreflight.state === 'submitted_state') {
      const postActions = await browser.scanActions();
      confirmationAction = postActions
        .map((action) => action.text.replace(/\s+/g, ' ').trim())
        .find((text) => text === '继续沟通' || text === '已投递' || text === '已申请') ?? null;
    }
    const confirmedAt = new Date().toISOString();
    const liveUrl = await browser.refreshCurrentUrl();
    const path = new URL(liveUrl).pathname.slice(0, 1000);
    if (lastPreflight.state === 'submitted_state' && confirmationAction) {
      return {
        outcome: 'success',
        appliedAt,
        confirmedAt,
        externalReference: null,
        evidence: {
          site: 'nowcoder',
          siteAdapterId: this.descriptor.id,
          siteAdapterVersion: this.descriptor.version,
          confirmationAction,
          observedPath: path,
          postSubmitState: lastPreflight.state,
        },
        error: null,
      };
    }
    return {
      outcome: 'uncertain',
      appliedAt,
      confirmedAt,
      externalReference: null,
      evidence: {
        site: 'nowcoder',
        siteAdapterId: this.descriptor.id,
        siteAdapterVersion: this.descriptor.version,
        confirmationAction,
        observedPath: path,
        postSubmitState: lastPreflight.state,
        preflightReasonCode: lastPreflight.reasonCode,
      },
      error: 'Nowcoder submit click completed but the characterized existing-application confirmation state was not observed',
    };
  }
}

function isNowcoderResumeControl(control: { kind: string; label: string; name: string | null; semanticHints: readonly string[]; accept: string | null }): boolean {
  if (control.kind !== 'file') return false;
  const evidence = [control.label, control.name ?? '', ...control.semanticHints, control.accept ?? ''].join(' ');
  return /pdf|docx?|resume|cv|upload|file|简历|附件/i.test(evidence);
}

function isNowcoderPrimaryResumeField(field: FormIR['fields'][number]): boolean {
  if (field.type !== 'file') return false;
  return field.semanticHints.some((hint) => /^jsAttachUpload1_/i.test(hint));
}

function isNowcoderResumeField(field: FormIR['fields'][number]): boolean {
  if (field.type !== 'file') return false;
  const evidence = [field.label, field.name ?? '', ...field.semanticHints, field.accept ?? ''].join(' ');
  return /pdf|docx?|resume|cv|upload|file|简历|附件/i.test(evidence);
}

export class ZhilianAtsSiteAdapter extends ObservedPublicAtsAdapter {
  readonly descriptor = {
    id: 'zhilian-ats',
    version: '2026-09-18.2',
    semantics: 'formal_application' as const,
    priority: 195,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = (url.hostname === 'www.zhaopin.com' || url.hostname === 'zhaopin.com')
        && /^\/jobdetail\/[^/]+\.htm$/i.test(url.pathname);
      return { supported, score: supported ? 0.995 : 0, reason: supported ? 'zhilian-job-detail-family' : 'zhilian-mismatch' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }
}

export class LiepinAtsSiteAdapter extends ObservedPublicAtsAdapter {
  readonly descriptor = {
    id: 'liepin-ats',
    version: '2026-09-18.1',
    semantics: 'formal_application' as const,
    priority: 190,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = (url.hostname === 'www.liepin.com' || url.hostname === 'liepin.com')
        && /^\/job\/\d+\.shtml$/i.test(url.pathname);
      return { supported, score: supported ? 0.994 : 0, reason: supported ? 'liepin-job-detail-family' : 'liepin-mismatch' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }
}

export class MokaSocialRecruitmentAtsSiteAdapter extends ObservedPublicAtsAdapter {
  readonly descriptor = {
    id: 'moka-social-recruitment',
    version: '2026-09-17.1',
    semantics: 'formal_application' as const,
    priority: 170,
    capabilities: { inspect: true, enter: false, fill: true, validate: true, submit: false },
  };

  probe(input: { url: string }) {
    try {
      const url = new URL(input.url);
      const supported = url.hostname === 'app.mokahr.com'
        && url.pathname.startsWith('/social-recruitment/')
        && (/^#\/job\//.test(url.hash) || /^#\/jobs(?:$|[/?])/.test(url.hash));
      return { supported, score: supported ? 0.98 : 0, reason: supported ? 'moka-social-recruitment-family' : 'moka-mismatch' };
    } catch {
      return { supported: false, score: 0, reason: 'invalid-url' };
    }
  }
}
