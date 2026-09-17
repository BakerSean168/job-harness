import type { BrowserBackendPort } from './types';

export class BrowserBackendRegistry {
  private readonly backends = new Map<string, BrowserBackendPort>();

  constructor(backends: readonly BrowserBackendPort[] = []) {
    for (const backend of backends) this.register(backend);
  }

  register(backend: BrowserBackendPort): this {
    const id = backend.id.trim();
    if (!id) throw new Error('Browser backend id is required');
    if (this.backends.has(id)) throw new Error(`Browser backend '${id}' is already registered`);
    this.backends.set(id, backend);
    return this;
  }

  get(id: string): BrowserBackendPort {
    const backend = this.backends.get(id);
    if (!backend) throw new Error(`Browser backend '${id}' is not registered`);
    return backend;
  }

  has(id: string): boolean { return this.backends.has(id); }
  ids(): string[] { return [...this.backends.keys()].sort(); }
  descriptors() { return this.ids().map((id) => this.backends.get(id)!.describe()); }

  async reapExpired(now?: string): Promise<number> {
    const counts = await Promise.all(this.ids().map((id) => this.backends.get(id)!.reapExpired(now)));
    return counts.reduce((sum, count) => sum + count, 0);
  }
}
