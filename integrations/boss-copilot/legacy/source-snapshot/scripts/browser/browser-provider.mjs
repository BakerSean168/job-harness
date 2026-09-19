import { LocalCdpProvider } from './local-cdp-provider.mjs';
import { SteelProvider } from './steel-provider.mjs';

export function createBrowserProvider(name = process.env.JAC_BROWSER_PROVIDER || 'steel', options = {}) {
  const normalized = String(name || '').trim().toLowerCase();
  if (['local', 'local-chrome', 'local-cdp', 'chrome'].includes(normalized)) {
    return new LocalCdpProvider(options);
  }
  if (['steel', 'steel-selfhost', 'steel-cloud'].includes(normalized)) {
    return new SteelProvider(options);
  }
  throw new Error(`Unknown browser provider: ${name}`);
}
