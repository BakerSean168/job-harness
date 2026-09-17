import { describe, expect, it } from 'vitest';
import { BrowserBackendRegistry, type BrowserBackendPort } from '../src';

function fake(id: string): BrowserBackendPort {
  return {
    id,
    describe: () => ({ id, kind: 'extension', persistentSession: false, humanControl: true, metadata: {} }),
    health: async () => ({ ok: true, detail: null }),
    async acquire() { throw new Error('not used'); },
  };
}

describe('BrowserBackendRegistry', () => {
  it('keeps browser infrastructure selection independent from site adapters', () => {
    const registry = new BrowserBackendRegistry([fake('steel'), fake('local-cdp')]);
    expect(registry.ids()).toEqual(['local-cdp', 'steel']);
    expect(registry.get('steel').id).toBe('steel');
    expect(() => registry.register(fake('steel'))).toThrow(/already registered/);
    expect(() => registry.get('missing')).toThrow(/not registered/);
  });
});
