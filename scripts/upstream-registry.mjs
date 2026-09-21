import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const registryPath = resolve(root, 'integrations/upstreams/registry.json');

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function hashFile(path) {
  return sha256(await readFile(path));
}

async function loadRegistry() {
  const parsed = JSON.parse(await readFile(registryPath, 'utf8'));
  if (parsed.schemaVersion !== 1 || !parsed.projects || typeof parsed.projects !== 'object') {
    fail('Unsupported upstream registry schema');
  }
  return parsed;
}

function selectProjects(registry, id) {
  if (!id) return Object.entries(registry.projects);
  const project = registry.projects[id];
  if (!project) fail(`Unknown upstream '${id}'`);
  return [[id, project]];
}

function remoteHead(repository) {
  const output = run('git', ['ls-remote', '--symref', repository, 'HEAD']);
  const commitLine = output.split(/\r?\n/).find((line) => /^[0-9a-f]{40}\s+HEAD$/.test(line));
  const refLine = output.split(/\r?\n/).find((line) => line.startsWith('ref: '));
  if (!commitLine) fail(`Could not resolve HEAD for ${repository}`);
  const commit = commitLine.split(/\s+/)[0];
  const branch = refLine?.match(/refs\/heads\/([^\s]+)/)?.[1] ?? null;
  return { commit, branch };
}

async function verifyLocalProject(id, project) {
  const errors = [];
  for (const tracked of project.trackedPaths ?? []) {
    for (const [pathKey, hashKey] of [
      ['localPath', 'localSha256'],
      ['localReferencePath', 'localReferenceSha256'],
      ['derivedPath', 'derivedSha256'],
      ['overlayPath', null],
    ]) {
      const relative = tracked[pathKey];
      if (!relative) continue;
      const absolute = resolve(root, relative);
      try {
        if (hashKey && tracked[hashKey]) {
          const actual = await hashFile(absolute);
          if (actual !== tracked[hashKey]) {
            errors.push(`${relative}: hash drift ${actual} != ${tracked[hashKey]}`);
          }
        } else {
          await readFile(absolute);
        }
      } catch (error) {
        errors.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (errors.length) {
    fail(`Upstream registry local verification failed for ${id}:\n- ${errors.join('\n- ')}`);
  }
}

async function cloneAt(repository, commits) {
  const dir = await mkdtemp(resolve(tmpdir(), 'job-harness-upstream-'));
  run('git', ['init', '-q'], { cwd: dir });
  run('git', ['remote', 'add', 'origin', repository], { cwd: dir });
  const unique = [...new Set(commits.filter(Boolean))];
  for (const commit of unique) {
    run('git', ['fetch', '-q', '--depth=1', 'origin', commit], { cwd: dir });
  }
  return dir;
}

async function verifyPinnedRemote(id, project) {
  const dir = await cloneAt(project.repository, [project.pinnedCommit]);
  try {
    const license = run('git', ['show', `${project.pinnedCommit}:${project.licensePath}`], { cwd: dir });
    const licenseHash = sha256(Buffer.from(license));
    if (licenseHash !== project.licenseSha256) {
      fail(`${id}: pinned license hash drifted (${licenseHash} != ${project.licenseSha256})`);
    }
    for (const tracked of project.trackedPaths ?? []) {
      if (!tracked.upstreamPath || !tracked.upstreamSha256) continue;
      const source = run('git', ['show', `${project.pinnedCommit}:${tracked.upstreamPath}`], { cwd: dir });
      const actual = sha256(Buffer.from(source));
      if (actual !== tracked.upstreamSha256) {
        fail(`${id}: pinned source hash drifted for ${tracked.upstreamPath} (${actual} != ${tracked.upstreamSha256})`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function commandCheck(registry, id, strictUpdates) {
  let updates = 0;
  for (const [projectId, project] of selectProjects(registry, id)) {
    await verifyLocalProject(projectId, project);
    await verifyPinnedRemote(projectId, project);
    const head = remoteHead(project.repository);
    const state = head.commit === project.pinnedCommit ? 'CURRENT' : 'UPDATE_AVAILABLE';
    if (state === 'UPDATE_AVAILABLE') updates += 1;
    console.log(`${projectId}\t${state}\tpinned=${project.pinnedCommit.slice(0, 12)}\thead=${head.commit.slice(0, 12)}\tbranch=${head.branch ?? project.defaultBranch ?? 'unknown'}\tlicense=${project.license}`);
  }
  if (strictUpdates && updates > 0) process.exitCode = 2;
}

async function inspectCandidate(projectId, project) {
  const head = remoteHead(project.repository);
  const dir = await cloneAt(project.repository, [project.pinnedCommit, head.commit]);
  return { head, dir };
}

async function commandDiff(registry, id) {
  if (!id) fail('Usage: pnpm upstream:diff <upstream-id>');
  const [[projectId, project]] = selectProjects(registry, id);
  await verifyLocalProject(projectId, project);
  const { head, dir } = await inspectCandidate(projectId, project);
  try {
    console.log(`upstream=${projectId}`);
    console.log(`pinned=${project.pinnedCommit}`);
    console.log(`head=${head.commit}`);
    if (head.commit === project.pinnedCommit) {
      console.log('status=CURRENT');
    } else {
      console.log('status=UPDATE_AVAILABLE');
      const paths = (project.trackedPaths ?? []).map((item) => item.upstreamPath).filter(Boolean);
      const diffArgs = ['diff', '--stat', project.pinnedCommit, head.commit, '--', ...paths];
      const stat = run('git', diffArgs, { cwd: dir }).trim();
      console.log(stat || '(tracked paths unchanged; repository HEAD changed elsewhere)');
    }

    for (const tracked of project.trackedPaths ?? []) {
      if (!tracked.overlayPath || !tracked.upstreamPath) continue;
      const candidateRoot = await mkdtemp(resolve(tmpdir(), 'job-harness-overlay-'));
      try {
        const upstreamText = run('git', ['show', `${head.commit}:${tracked.upstreamPath}`], { cwd: dir });
        const candidatePath = resolve(candidateRoot, tracked.upstreamPath);
        await mkdir(dirname(candidatePath), { recursive: true });
        await writeFile(candidatePath, upstreamText, 'utf8');
        const result = spawnSync('git', ['apply', '--check', resolve(root, tracked.overlayPath)], {
          cwd: candidateRoot,
          encoding: 'utf8',
        });
        console.log(`overlay=${tracked.overlayPath}\t${result.status === 0 ? 'APPLIES' : 'CONFLICT'}`);
        if (result.status !== 0 && result.stderr) console.log(result.stderr.trim());
      } finally {
        await rm(candidateRoot, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function materializeCandidate(projectId, project) {
  const { head, dir } = await inspectCandidate(projectId, project);
  const candidateRoot = resolve(root, '.tmp', 'upstreams', projectId, head.commit);
  await rm(candidateRoot, { recursive: true, force: true });
  const upstreamRoot = resolve(candidateRoot, 'upstream');
  const candidateTreeRoot = resolve(candidateRoot, 'candidate');
  await mkdir(upstreamRoot, { recursive: true });
  await mkdir(candidateTreeRoot, { recursive: true });

  const files = [];
  try {
    if (project.materialization === 'full-tree') {
      const archivePath = resolve(candidateRoot, '.upstream.tar');
      run('git', ['archive', '--format=tar', head.commit, '-o', archivePath], { cwd: dir });
      run('tar', ['-xf', archivePath, '-C', upstreamRoot]);
      run('cp', ['-a', `${upstreamRoot}/.`, candidateTreeRoot]);
      await rm(archivePath, { force: true });
    }

    const license = run('git', ['show', `${head.commit}:${project.licensePath}`], { cwd: dir });
    const licenseHash = sha256(Buffer.from(license));
    await mkdir(dirname(resolve(upstreamRoot, project.licensePath)), { recursive: true });
    await writeFile(resolve(upstreamRoot, project.licensePath), license, 'utf8');

    for (const tracked of project.trackedPaths ?? []) {
      if (!tracked.upstreamPath) continue;
      const upstreamText = run('git', ['show', `${head.commit}:${tracked.upstreamPath}`], { cwd: dir });
      const upstreamPath = resolve(upstreamRoot, tracked.upstreamPath);
      await mkdir(dirname(upstreamPath), { recursive: true });
      await writeFile(upstreamPath, upstreamText, 'utf8');
      const upstreamHash = sha256(Buffer.from(upstreamText));

      let candidatePath = null;
      let candidateHash = null;
      let overlayApplied = null;
      if (tracked.overlayPath) {
        candidatePath = resolve(candidateTreeRoot, tracked.upstreamPath);
        await mkdir(dirname(candidatePath), { recursive: true });
        await copyFile(upstreamPath, candidatePath);
        const result = spawnSync('git', ['apply', resolve(root, tracked.overlayPath)], {
          cwd: candidateTreeRoot,
          encoding: 'utf8',
        });
        overlayApplied = result.status === 0;
        if (!overlayApplied) {
          const detail = String(result.stderr || result.stdout || '').trim();
          fail(`${projectId}: local overlay no longer applies to upstream ${head.commit.slice(0, 12)}: ${detail}`);
        }
        candidateHash = await hashFile(candidatePath);
      }

      files.push({
        upstreamPath: tracked.upstreamPath,
        upstreamSha256: upstreamHash,
        candidatePath: candidatePath ? candidatePath.slice(root.length + 1) : null,
        candidateSha256: candidateHash,
        overlayApplied,
      });
    }

    const manifest = {
      schemaVersion: 1,
      projectId,
      repository: project.repository,
      previousPinnedCommit: project.pinnedCommit,
      candidateCommit: head.commit,
      status: head.commit === project.pinnedCommit ? 'same-as-pinned' : 'upgrade-candidate',
      license: project.license,
      licenseSha256: licenseHash,
      integrationKind: project.integrationKind,
      materialization: project.materialization ?? 'tracked-files',
      files,
    };
    await writeFile(resolve(candidateRoot, 'candidate.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return { candidateRoot, manifest };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function inspectUpgradeCandidate(projectId, project) {
  await verifyLocalProject(projectId, project);
  await verifyPinnedRemote(projectId, project);
  const { head, dir } = await inspectCandidate(projectId, project);
  try {
    const updateAvailable = head.commit !== project.pinnedCommit;
    const trackedPaths = [...new Set([
      project.licensePath,
      ...(project.trackedPaths ?? []).map((item) => item.upstreamPath).filter(Boolean),
    ])];
    const changedPaths = updateAvailable
      ? run('git', ['diff', '--name-only', project.pinnedCommit, head.commit, '--', ...trackedPaths], { cwd: dir })
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
      : [];

    const licenseText = run('git', ['show', `${head.commit}:${project.licensePath}`], { cwd: dir });
    const candidateLicenseSha256 = sha256(Buffer.from(licenseText));
    const overlays = [];
    for (const tracked of project.trackedPaths ?? []) {
      if (!tracked.overlayPath || !tracked.upstreamPath) continue;
      const candidateRoot = await mkdtemp(resolve(tmpdir(), 'job-harness-overlay-report-'));
      try {
        const upstreamText = run('git', ['show', `${head.commit}:${tracked.upstreamPath}`], { cwd: dir });
        const candidatePath = resolve(candidateRoot, tracked.upstreamPath);
        await mkdir(dirname(candidatePath), { recursive: true });
        await writeFile(candidatePath, upstreamText, 'utf8');
        const result = spawnSync('git', ['apply', '--check', resolve(root, tracked.overlayPath)], {
          cwd: candidateRoot,
          encoding: 'utf8',
        });
        overlays.push({
          overlayPath: tracked.overlayPath,
          upstreamPath: tracked.upstreamPath,
          state: result.status === 0 ? 'applies' : 'conflict',
          detail: result.status === 0 ? null : String(result.stderr || result.stdout || '').trim().slice(0, 2000),
        });
      } finally {
        await rm(candidateRoot, { recursive: true, force: true });
      }
    }

    return {
      projectId,
      repository: project.repository,
      integrationKind: project.integrationKind,
      productionRole: project.productionRole ?? null,
      promotion: project.promotion ?? null,
      pinnedCommit: project.pinnedCommit,
      candidateCommit: head.commit,
      branch: head.branch ?? project.defaultBranch ?? null,
      state: updateAvailable ? 'update-available' : 'current',
      license: project.license,
      pinnedLicenseSha256: project.licenseSha256,
      candidateLicenseSha256,
      licenseChanged: candidateLicenseSha256 !== project.licenseSha256,
      changedTrackedPaths: changedPaths,
      overlays,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function commandReport(registry, id, outputDir) {
  const selected = selectProjects(registry, id);
  const projects = [];
  for (const [projectId, project] of selected) {
    projects.push(await inspectUpgradeCandidate(projectId, project));
  }

  const generatedAt = new Date().toISOString();
  const updateCount = projects.filter((project) => project.state === 'update-available').length;
  const conflictCount = projects.reduce(
    (count, project) => count + project.overlays.filter((overlay) => overlay.state === 'conflict').length,
    0,
  );
  const licenseChangeCount = projects.filter((project) => project.licenseChanged).length;
  const report = {
    schemaVersion: 1,
    generatedAt,
    registryUpdatedAt: registry.updatedAt ?? null,
    updateCount,
    conflictCount,
    licenseChangeCount,
    projects,
  };

  const destination = resolve(root, outputDir || '.tmp/upstream-watch-report');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await writeFile(resolve(destination, 'upgrade-candidates.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

  const lines = [
    '# Recruitment Runtime Upstream Watch',
    '',
    `Generated: ${generatedAt}`,
    '',
    `Updates: **${updateCount}** · Overlay conflicts: **${conflictCount}** · License changes: **${licenseChangeCount}**`,
    '',
    '| Upstream | State | Pinned | Candidate | Tracked changes | Overlay | License | Promotion |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- |',
  ];
  for (const project of projects) {
    const overlayState = project.overlays.some((overlay) => overlay.state === 'conflict')
      ? 'CONFLICT'
      : project.overlays.length ? 'applies' : 'n/a';
    lines.push(
      `| ${markdownCell(project.projectId)} | ${project.state === 'update-available' ? '**UPDATE**' : 'current'} | ${project.pinnedCommit.slice(0, 12)} | ${project.candidateCommit.slice(0, 12)} | ${project.changedTrackedPaths.length} | ${overlayState} | ${project.licenseChanged ? '**CHANGED**' : 'unchanged'} | ${markdownCell(project.promotion ?? 'manual review')} |`,
    );
  }
  for (const project of projects.filter((item) => item.state === 'update-available')) {
    lines.push('', `## ${project.projectId}`, '');
    lines.push(`- Repository: \`${project.repository}\``);
    lines.push(`- Pinned: \`${project.pinnedCommit}\``);
    lines.push(`- Candidate: \`${project.candidateCommit}\``);
    lines.push(`- License hash: ${project.licenseChanged ? '**changed — manual review required**' : 'unchanged'}`);
    lines.push(`- Promotion policy: \`${project.promotion ?? 'manual-review'}\``);
    lines.push('- Changed tracked paths:');
    if (project.changedTrackedPaths.length) {
      for (const path of project.changedTrackedPaths) lines.push(`  - \`${path}\``);
    } else {
      lines.push('  - none (repository HEAD changed outside tracked paths)');
    }
    if (project.overlays.length) {
      lines.push('- Overlay compatibility:');
      for (const overlay of project.overlays) {
        lines.push(`  - \`${overlay.overlayPath}\` -> **${overlay.state.toUpperCase()}** against \`${overlay.upstreamPath}\``);
        if (overlay.detail) lines.push(`    - ${overlay.detail.replace(/\r?\n/g, ' ').slice(0, 500)}`);
      }
    }
  }
  lines.push(
    '',
    '## Promotion boundary',
    '',
    'This report is evidence only. It never updates registry pins, production source, browser bundles, or deployment state.',
    'An update still requires candidate characterization, diff review, a paused/real-browser canary where applicable, and explicit promotion.',
    '',
  );
  await writeFile(resolve(destination, 'upgrade-candidates.md'), lines.join('\n'), 'utf8');

  console.log(`report=${destination}`);
  console.log(`updates=${updateCount}`);
  console.log(`overlay_conflicts=${conflictCount}`);
  console.log(`license_changes=${licenseChangeCount}`);
}

async function commandSync(registry, id) {
  if (!id) fail('Usage: pnpm upstream:sync <upstream-id>');
  const [[projectId, project]] = selectProjects(registry, id);
  await verifyLocalProject(projectId, project);
  const { candidateRoot, manifest } = await materializeCandidate(projectId, project);
  console.log(`candidate=${candidateRoot}`);
  console.log(`status=${manifest.status}`);
  console.log(`commit=${manifest.candidateCommit}`);
  console.log('Production source was not modified. Review/test the candidate before updating registry pin or promotion.');
}

async function commandTest(registry, id) {
  if (!id) fail('Usage: pnpm upstream:test <upstream-id>');
  const [[projectId, project]] = selectProjects(registry, id);
  await verifyLocalProject(projectId, project);
  const { candidateRoot, manifest } = await materializeCandidate(projectId, project);

  if (projectId === 'czc-good-job') {
    const tracked = project.trackedPaths.find((item) => item.overlayPath);
    const candidateSource = tracked ? resolve(candidateRoot, 'candidate', tracked.upstreamPath) : null;
    if (!candidateSource) fail('czc-good-job candidate source missing');
    const candidateOutput = resolve(candidateRoot, 'boss-copilot.js');
    run('pnpm', ['exec', 'tsx', 'scripts/build-boss-copilot-compat.ts'], {
      env: {
        ...process.env,
        JOB_HARNESS_BOSS_COPILOT_SOURCE: candidateSource,
        JOB_HARNESS_BOSS_COPILOT_OUTPUT: candidateOutput,
      },
      stdio: 'inherit',
    });
    run('node', ['--check', candidateOutput], { stdio: 'inherit' });
  }

  for (const command of project.checks ?? []) {
    const parts = command.trim().split(/\s+/);
    run(parts[0], parts.slice(1), {
      env: {
        ...process.env,
        JOB_HARNESS_UPSTREAM_ID: projectId,
        JOB_HARNESS_UPSTREAM_CANDIDATE_ROOT: candidateRoot,
        JOB_HARNESS_UPSTREAM_CANDIDATE_COMMIT: manifest.candidateCommit,
      },
      stdio: 'inherit',
    });
  }
  console.log(`upstream candidate test passed: ${projectId}@${manifest.candidateCommit.slice(0, 12)}`);
}

function optionValue(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const registry = await loadRegistry();
  const command = process.argv[2] ?? 'check';
  const id = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
  const strictUpdates = process.argv.includes('--strict-updates');
  const outputDir = optionValue('--output-dir');

  if (command === 'check') return commandCheck(registry, id, strictUpdates);
  if (command === 'diff') return commandDiff(registry, id);
  if (command === 'report') return commandReport(registry, id, outputDir);
  if (command === 'sync') return commandSync(registry, id);
  if (command === 'test') return commandTest(registry, id);
  fail(`Unknown upstream command '${command}'`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
