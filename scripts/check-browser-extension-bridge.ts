import { readFile } from 'node:fs/promises';
import { BROWSER_EXTENSION_DRIVER_COMMANDS } from '@job-harness/apply-contracts';

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(new URL('../integrations/browser-extension/manifest.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  if (manifest.manifest_version !== 3) throw new Error('browser extension must remain Manifest V3');
  if ('host_permissions' in manifest) throw new Error('browser extension must not silently request permanent host_permissions; site access must stay optional/user-granted');
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions.map(String) : [];
  for (const forbidden of ['cookies', 'debugger', 'webRequestBlocking']) {
    if (permissions.includes(forbidden)) throw new Error(`browser extension must not request privileged '${forbidden}' permission`);
  }
  const optionalHosts = Array.isArray(manifest.optional_host_permissions) ? manifest.optional_host_permissions.map(String) : [];
  if (!optionalHosts.includes('https://*/*')) throw new Error('browser extension must declare optional HTTPS site access for explicit user grant');

  const sourceFiles = ['background.js', 'page-driver.js', 'options.js', 'popup.js'];
  const source = (await Promise.all(sourceFiles.map((name) => readFile(new URL(`../integrations/browser-extension/${name}`, import.meta.url), 'utf8')))).join('\n');
  for (const forbidden of ['/api/ledger', 'jacApplications', 'profile-bundle.json', 'JOB_HARNESS_AUTH_TOKEN', 'chrome.debugger', 'submission_intents', 'application_submissions']) {
    if (source.includes(forbidden)) throw new Error(`browser extension crossed ownership boundary via '${forbidden}'`);
  }
  for (const command of BROWSER_EXTENSION_DRIVER_COMMANDS) {
    if (!source.includes(`"${command}"`)) throw new Error(`browser extension implementation is missing driver command '${command}'`);
  }
  if (!source.includes('JH_PAGE_DRIVER_COMMAND')) throw new Error('browser extension page-driver transport marker is missing');
  console.log(`browser extension bridge ok: MV3, ${BROWSER_EXTENSION_DRIVER_COMMANDS.length} driver commands, no legacy Career/Resume ledger ownership, optional site permissions`);
}

void main();
