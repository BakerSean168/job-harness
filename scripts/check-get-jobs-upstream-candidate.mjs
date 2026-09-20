import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const candidateRoot = process.env.JOB_HARNESS_UPSTREAM_CANDIDATE_ROOT?.trim();
if (!candidateRoot) throw new Error('JOB_HARNESS_UPSTREAM_CANDIDATE_ROOT is required');

const upstream = resolve(candidateRoot, 'upstream');

async function text(path) {
  return readFile(resolve(upstream, path), 'utf8');
}

function requireMarkers(label, source, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${label} lost required upstream marker: ${marker}`);
    }
  }
}

const [
  pyproject,
  jobsRouter,
  taskState,
  zhilian,
  zhilianLocators,
  liepin,
  liepinLocators,
  job51,
  job51Locators,
] = await Promise.all([
  text('pyproject.toml'),
  text('app/routers/jobs.py'),
  text('app/worker/task_state.py'),
  text('app/worker/zhilian_bot.py'),
  text('app/worker/zhilian_locators.py'),
  text('app/worker/liepin_bot.py'),
  text('app/worker/liepin_locators.py'),
  text('app/worker/job51_bot.py'),
  text('app/worker/job51_locators.py'),
]);

requireMarkers('pyproject', pyproject, [
  'playwright>=',
  'camoufox>=',
  'fastapi>=',
]);

for (const platform of ['zhilian', 'liepin', 'job51']) {
  requireMarkers('jobs router', jobsRouter, [
    `@router.post("/${platform}/start"`,
    `@router.post("/${platform}/stop"`,
    `@router.get("/${platform}/status"`,
    `@router.get("/${platform}/login-status"`,
  ]);
}

requireMarkers('task state', taskState, [
  'class DeliveryState',
  'cancel_event',
  'def start(',
  'def stop(',
  'def should_stop(',
]);

requireMarkers('Zhilian worker', zhilian, [
  'class ZhilianBot',
  'AsyncCamoufox',
  'run_delivery',
  'task_state.should_stop()',
  'is_logged_in',
  '已投递',
  '今日投递已达上限',
]);
requireMarkers('Zhilian locators', zhilianLocators, [
  'zhaopin.com',
  '投递',
  '已投递',
]);

requireMarkers('Liepin worker', liepin, [
  'class LiepinBot',
  'AsyncCamoufox',
  'run_delivery',
  'task_state.should_stop()',
  'is_logged_in',
]);
requireMarkers('Liepin locators', liepinLocators, [
  'liepin.com',
  '投递简历',
  '立即沟通',
  '已投递',
]);

requireMarkers('51job worker', job51, [
  'class Job51Bot',
  'AsyncCamoufox',
  'run_delivery',
  'task_state.should_stop()',
  'is_logged_in',
  '出现访问验证，停止投递',
  '检测到今日投递已达上限',
]);
requireMarkers('51job locators', job51Locators, [
  '51job.com',
  '投递成功',
  '投递上限',
]);

for (const forbidden of [
  'JOB_HARNESS_AUTH_TOKEN',
  'JOB_HARNESS_EXECUTOR_AUTH_TOKEN',
  'job-harness.db',
]) {
  const combined = [jobsRouter, taskState, zhilian, liepin, job51].join('\n');
  if (combined.includes(forbidden)) {
    throw new Error(`Upstream candidate unexpectedly contains Job Harness ownership marker: ${forbidden}`);
  }
}

console.log(
  `get_jobs upstream candidate ok: ${process.env.JOB_HARNESS_UPSTREAM_CANDIDATE_COMMIT?.slice(0, 12) ?? 'unknown'}; ` +
  'Zhilian/Liepin/51job expose start/stop/status/login boundaries, cancellation, Camoufox/Playwright execution, and platform stop-limit signals',
);
