import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateJobHarnessOpenApiDocument } from '../packages/contracts/src/rest-api';

async function main(): Promise<void> {
  const target = resolve('openapi/job-harness-v1.json');
  const rendered = `${JSON.stringify(generateJobHarnessOpenApiDocument(), null, 2)}\n`;
  const write = process.argv.includes('--write');

  if (write) {
    await writeFile(target, rendered, 'utf8');
    console.log(`wrote ${target}`);
    return;
  }

  let current = '';
  try { current = await readFile(target, 'utf8'); } catch {}
  if (current !== rendered) {
    console.error('OpenAPI artifact drift detected. Run: pnpm openapi:generate');
    process.exitCode = 1;
    return;
  }
  console.log('OpenAPI artifact matches canonical Zod contracts');
}

void main();
