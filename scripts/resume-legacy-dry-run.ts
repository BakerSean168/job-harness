import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { loadLegacyResumeRepository, importLegacyResumeBundle } from '../packages/resume-importers/src/index';
import { resolveResume, ResumeResolutionError } from '../packages/resume-application/src/index';
import { renderResumeHtml } from '../packages/resume-renderer/src/index';

function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const { values } = parseArgs({ args, options: { source: { type: 'string' }, report: { type: 'string' } }, allowPositionals: false });
  if (!values.source) throw new Error('Usage: tsx scripts/resume-legacy-dry-run.ts --source <legacy-resume-repo> [--report <json>]');
  const source = path.resolve(values.source);
  const importedAt = '2026-09-17T01:44:00.000Z';
  const bundle = loadLegacyResumeRepository(source);
  const imported = importLegacyResumeBundle(bundle, importedAt);
  const manifestPath = path.resolve('packages/resume-renderer/test/fixtures/legacy/html-sha256.txt');
  const expected = new Map(
    fs.readFileSync(manifestPath, 'utf8').trim().split('\n').map((line) => {
      const match = line.match(/^([a-f0-9]{64})\s+.*\/([a-z0-9-]+)\.html$/);
      if (!match) throw new Error(`Invalid legacy HTML manifest line: ${line}`);
      return [match[2]!, match[1]!] as const;
    }),
  );
  const profiles = imported.profiles.map((profile) => {
    try {
      const resolved = resolveResume(imported.library, profile);
      const html = renderResumeHtml(resolved, { variant: profile.id });
      const actual = sha256(html);
      const expectedHash = expected.get(profile.id) ?? null;
      return { id: profile.id, resolved: true, expectedHash, actualHash: actual, exactHtmlParity: expectedHash === actual };
    } catch (error) {
      return {
        id: profile.id,
        resolved: false,
        error: error instanceof ResumeResolutionError ? { name: error.name, issues: error.issues } : String(error),
      };
    }
  });
  const sourceHead = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const report = {
    sourceHead,
    library: {
      education: imported.library.education.length,
      skills: imported.library.skills.length,
      workExperiences: imported.library.workExperiences.length,
      projects: imported.library.projects.length,
      certificates: imported.library.certificates.length,
      summaries: imported.library.summaries.length,
    },
    profiles,
    findings: imported.findings,
    exactParityCount: profiles.filter((item) => 'exactHtmlParity' in item && item.exactHtmlParity).length,
  };
  if (values.report) fs.writeFileSync(path.resolve(values.report), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (profiles.some((profile) => !profile.resolved)) process.exitCode = 2;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
