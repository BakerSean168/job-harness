import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const profileId = process.argv[2] || 'ai-agent-app';
const companionRoot = path.resolve(
  process.env.CZC_GOOD_JOB_DIR || '/home/ubuntu/projects/job-application-copilot-czc-good-job',
);
const generatedRoot = path.resolve(root, '.local', 'czc-good-job');
const generatedConfig = path.join(generatedRoot, profileId, 'user_config.json');
const targetConfig = path.join(companionRoot, 'user_config.json');

execFileSync(process.execPath, ['scripts/generate-czc-good-job-config.mjs'], {
  cwd: root,
  stdio: 'inherit',
});

if (!fs.existsSync(generatedConfig)) {
  throw new Error(`Unknown profile or missing generated config: ${profileId}`);
}
if (!fs.existsSync(companionRoot)) {
  throw new Error(`czc-good-job checkout not found: ${companionRoot}`);
}

fs.copyFileSync(generatedConfig, targetConfig);
console.log(`Activated czc-good-job profile: ${profileId}`);
console.log(`Copied -> ${targetConfig}`);
