import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'packages/browser-form-engine/browser/runtime.js');
const target = resolve(root, 'integrations/browser-extension/form-engine.js');

const content = await readFile(source, 'utf8');
await writeFile(target, content);
console.log('browser form engine synced:', target);
