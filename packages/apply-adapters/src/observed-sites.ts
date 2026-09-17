import type { FillPlan, FillReport, FormIR } from '@job-harness/apply-contracts';
import type { BrowserDriverPort } from '@job-harness/apply-browser';
import { fillGenericForm, inspectGenericForm } from './generic-form';
import type { ApplicantDataProviderPort } from './applicant-data';
import { inspectApplyPagePreflight } from './page-preflight';
import { GenericAtsSiteAdapter } from './generic-site-adapter';
import type { ApplyFillAssets, ApplySiteAdapter } from './site-adapter';

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
    version: '2026-09-17.1',
    semantics: 'formal_application' as const,
    priority: 180,
    capabilities: { inspect: true, fill: true, validate: true, submit: false },
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
}

export class MokaSocialRecruitmentAtsSiteAdapter extends ObservedPublicAtsAdapter {
  readonly descriptor = {
    id: 'moka-social-recruitment',
    version: '2026-09-17.1',
    semantics: 'formal_application' as const,
    priority: 170,
    capabilities: { inspect: true, fill: true, validate: true, submit: false },
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
