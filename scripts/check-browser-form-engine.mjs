import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'packages/browser-form-engine/browser/runtime.js');
const target = resolve(root, 'integrations/browser-extension/form-engine.js');

const [canonical, extensionCopy] = await Promise.all([
  readFile(source, 'utf8'),
  readFile(target, 'utf8'),
]);

if (canonical !== extensionCopy) {
  console.error('Browser form engine drift detected. Run: pnpm sync:browser-form-engine');
  process.exit(1);
}
if (!canonical.includes('OpenJobAutofill') || !canonical.includes('__JOB_HARNESS_FORM_ENGINE__')) {
  console.error('Browser form engine is missing attribution/runtime markers');
  process.exit(1);
}
console.log('browser form engine ok: canonical OpenJobAutofill-derived runtime matches extension copy');
