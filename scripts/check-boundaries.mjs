import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = new URL('../packages/', import.meta.url);
const forbidden = ['@memoflow/'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']);

async function walk(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      await walk(child);
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name))) continue;
    const text = await readFile(child, 'utf8');
    for (const token of forbidden) {
      if (text.includes(token)) {
        throw new Error(`Forbidden core dependency '${token}' found in ${join(child.pathname)}`);
      }
    }
  }
}

await walk(root);
console.log('boundaries ok: core packages have no @memoflow/* dependency');
