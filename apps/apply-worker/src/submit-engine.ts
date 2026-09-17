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

  async execute(input: { readonly attempt: ExecutionAttempt; readonly browser: BrowserDriverPort }): Promise<ApplySiteSubmitResult> {
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
    return adapter.submit(input.browser);
  }
}
