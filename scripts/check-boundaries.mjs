import { readdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const packagesRoot = new URL('../packages/', import.meta.url);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']);

async function files(dirUrl) {
  const result = [];
  const entries = await readdir(dirUrl, { withFileTypes: true });
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      result.push(...await files(child));
    } else if (sourceExtensions.has(extname(entry.name))) result.push(child);
  }
  return result;
}

async function assertNoTokens(dirUrl, forbidden, label) {
  for (const file of await files(dirUrl)) {
    const text = await readFile(file, 'utf8');
    for (const token of forbidden) {
      if (text.includes(token)) throw new Error(`${label}: forbidden dependency/token '${token}' found in ${file.pathname}`);
    }
  }
}

await assertNoTokens(packagesRoot, ['@memoflow/'], 'core packages');

const applyCore = new URL('../packages/apply-core/', import.meta.url);
await assertNoTokens(applyCore, [
  'playwright',
  'steel',
  'node:sqlite',
  'document.',
  'window.',
  'HTMLElement',
  '@job-harness/persistence-sqlite',
  '@job-harness/application',
], 'apply-core');

const applyContracts = new URL('../packages/apply-contracts/', import.meta.url);
await assertNoTokens(applyContracts, [
  'playwright',
  'steel',
  'node:sqlite',
  '@job-harness/persistence-sqlite',
  '@job-harness/application',
], 'apply-contracts');

const applyRuntime = new URL('../packages/apply-runtime/', import.meta.url);
await assertNoTokens(applyRuntime, [
  'playwright',
  'steel',
  'node:sqlite',
  '@job-harness/persistence-sqlite',
], 'apply-runtime');

console.log('boundaries ok: Career core is host-neutral and Apply core/contracts/runtime stay independent from DOM/browser/persistence implementations');
