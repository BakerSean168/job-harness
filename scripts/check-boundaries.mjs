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

const applicantContracts = new URL('../packages/applicant-contracts/', import.meta.url);
await assertNoTokens(applicantContracts, [
  'node:sqlite',
  '@job-harness/persistence-sqlite',
  '@job-harness/applicant-application',
  'express',
  'next/',
  'playwright',
], 'applicant-contracts');

const applicantApplication = new URL('../packages/applicant-application/', import.meta.url);
await assertNoTokens(applicantApplication, [
  'node:sqlite',
  '@job-harness/persistence-sqlite',
  'express',
  'next/',
  'playwright',
], 'applicant-application');

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


const applyBrowser = new URL('../packages/apply-browser/', import.meta.url);
await assertNoTokens(applyBrowser, [
  '@job-harness/persistence-sqlite',
  '@job-harness/application',
  'submission_intents',
  'execution_attempts',
], 'apply-browser');


const applyAdapters = new URL('../packages/apply-adapters/', import.meta.url);
await assertNoTokens(applyAdapters, [
  '@job-harness/persistence-sqlite',
  '@job-harness/application',
  'job-application-copilot/',
  'node:sqlite',
], 'apply-adapters');

const applyWorker = new URL('../apps/apply-worker/', import.meta.url);
await assertNoTokens(applyWorker, [
  '@job-harness/persistence-sqlite',
  'JOB_HARNESS_AUTH_TOKEN',
], 'apply-worker');

const browserExtension = new URL('../integrations/browser-extension/', import.meta.url);
await assertNoTokens(browserExtension, [
  '/api/ledger',
  'jacApplications',
  'profile-bundle.json',
  'JOB_HARNESS_AUTH_TOKEN',
  'submission_intents',
  'application_submissions',
], 'browser-extension');

console.log('boundaries ok: Career/Applicant cores are host-neutral, Apply core/contracts/runtime stay independent from DOM/browser/persistence implementations, and the worker/browser layer cannot bypass Job Harness persistence or use the global bearer');
