import type { ExecutionAttempt } from '@job-harness/apply-contracts';
import type { BrowserDriverPort } from '@job-harness/apply-browser';
import type { ApplySiteAdapterRegistry, ApplySiteSubmitResult } from '@job-harness/apply-adapters';

export interface SubmitExecutionEngineOptions {
  readonly siteAdapters: ApplySiteAdapterRegistry;
}

export class SubmitExecutionEngine {
  private readonly siteAdapters: ApplySiteAdapterRegistry;

  constructor(options: SubmitExecutionEngineOptions) {
    this.siteAdapters = options.siteAdapters;
  }

  async execute(input: { readonly attempt: ExecutionAttempt; readonly browser: BrowserDriverPort; readonly expectedFormStateHash: string }): Promise<ApplySiteSubmitResult> {
    const targetUrl = input.attempt.bundle.listingUrl;
    if (!targetUrl) throw new Error('Frozen ApplyBundle has no Listing URL');
    const requested = input.attempt.adapterId ?? input.attempt.requiredAdapterId;
    const adapter = this.siteAdapters.resolve({
      url: targetUrl,
      semantics: 'formal_application',
      requiredAdapterId: requested,
    });
    if (!adapter) throw new Error(`No submit adapter supports '${new URL(targetUrl).hostname}'`);
    if (!adapter.descriptor.capabilities.submit || !adapter.submit) {
      throw new Error(`Site adapter '${adapter.descriptor.id}' has no submit capability`);
    }
    if (!input.attempt.adapterVersion || adapter.descriptor.version !== input.attempt.adapterVersion) {
      throw new Error(`Submit adapter '${adapter.descriptor.id}' runtime version '${adapter.descriptor.version}' does not match frozen Attempt version '${input.attempt.adapterVersion ?? 'none'}'`);
    }
    const liveUrl = await input.browser.refreshCurrentUrl();
    const liveProbe = adapter.probe({ url: liveUrl });
    if (!liveProbe.supported) {
      throw new Error(`Live browser page '${new URL(liveUrl).hostname}' no longer matches submit adapter '${adapter.descriptor.id}'`);
    }
    const liveFormStateHash = await input.browser.formStateHash();
    if (liveFormStateHash !== input.expectedFormStateHash) {
      throw new Error('Live form state changed after submit authorization; refusing to call the site submit adapter');
    }
    return adapter.submit(input.browser);
  }
}
