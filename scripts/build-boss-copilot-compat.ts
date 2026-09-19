import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { patchBossResumeFollowupUserscript } from '../apps/server/src/boss-resume-followup';

async function main(): Promise<void> {
  const root = process.cwd();
  const sourcePath = resolve(root, 'integrations/boss/legacy-copilot.user.js');
  const outputPath = resolve(root, 'integrations/boss-copilot/extension/boss-copilot.js');
  const publicUrl = 'https://oracle.taile92a8e.ts.net:10444/boss-resume-followup.user.js';

  const source = await readFile(sourcePath, 'utf8');
  const output = patchBossResumeFollowupUserscript(source, {
    publicUrl,
    version: '2026.09.19.1',
  });

  const invariants = [
    "const JAC_HARD_ONLY_GREET = false;",
    "onlyGreet: false",
    "const resumeAllowed = await api.isNeedResume({",
    "fetch(details.url",
    "serverHost: 'https://oracle.taile92a8e.ts.net:10444/p/ai-agent-app'",
    "SELECTORS.ZHIPIN.DETAIL.STARTCHAT",
    "SELECTORS.ZHIPIN.CHAT.RESUMESEND",
    "SELECTORS.ZHIPIN.CHAT.NEWMSGNOTICE",
  ];
  for (const invariant of invariants) {
    if (!output.includes(invariant)) {
      throw new Error(`Generated BOSS Copilot compatibility runtime lost invariant: ${invariant}`);
    }
  }

  await writeFile(outputPath, output, 'utf8');
  console.log(`BOSS Copilot compatibility runtime built: ${outputPath} (${Buffer.byteLength(output)} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
