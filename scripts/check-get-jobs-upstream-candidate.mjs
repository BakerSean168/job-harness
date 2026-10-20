import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const candidateRoot = process.env.JOB_HARNESS_UPSTREAM_CANDIDATE_ROOT?.trim();
if (!candidateRoot) throw new Error('JOB_HARNESS_UPSTREAM_CANDIDATE_ROOT is required');

const upstream = resolve(candidateRoot, 'upstream');
const candidate = resolve(candidateRoot, 'candidate');

async function text(path) {
  try {
    return await readFile(resolve(candidate, path), 'utf8');
  } catch {
    return readFile(resolve(upstream, path), 'utf8');
  }
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
  main,
  jobsRouter,
  taskState,
  zhilian,
  zhilianLocators,
  liepin,
  liepinLocators,
  job51,
  job51Locators,
  zhilianService,
  liepinService,
  job51Service,
] = await Promise.all([
  text('pyproject.toml'),
  text('app/main.py'),
  text('app/routers/jobs.py'),
  text('app/worker/task_state.py'),
  text('app/worker/zhilian_bot.py'),
  text('app/worker/zhilian_locators.py'),
  text('app/worker/liepin_bot.py'),
  text('app/worker/liepin_locators.py'),
  text('app/worker/job51_bot.py'),
  text('app/worker/job51_locators.py'),
  text('app/services/zhilian_service.py'),
  text('app/services/liepin_service.py'),
  text('app/services/job51_service.py'),
]);

requireMarkers('pyproject', pyproject, [
  'playwright>=',
  'camoufox>=',
  'fastapi>=',
]);
requireMarkers('Job Harness runtime marker', main, [
  '/api/job-harness-runtime',
  'JOB_HARNESS_GET_JOBS_COLLECT_ONLY',
  'collectOnly',
  'collect-only',
]);

for (const platform of ['zhilian', 'liepin', 'job51']) {
  requireMarkers('jobs router', jobsRouter, [
    `@router.post("/${platform}/start"`,
    `@router.post("/${platform}/stop"`,
    `@router.get("/${platform}/status"`,
    `@router.get("/${platform}/login-status"`,
  ]);
}
requireMarkers('Zhilian collect-only native filter boundary', jobsRouter, [
  'class ZhilianNativeFilters(BaseModel):',
  'experienceCodes: list[Literal["-1", "0001", "0103"]]',
  'employmentCode: Literal["2"]',
  '@router.put("/zhilian/collection-filters"',
  '@router.get("/zhilian/collection-filters"',
  'if task_state.running:',
  'Native experience and full-time filters not configured',
  'Configure native filters before collection',
]);
requireMarkers('jobs router login singleton', jobsRouter, [
  '_login_tasks: dict[str, asyncio.Task]',
  'def _start_platform_login(platform: str) -> bool:',
  'status="already_running"',
  'status="already_logged_in"',
  'if not force and await _check_login_status(CookieService(db), "zhilian"):',
]);
for (const platform of ['boss', 'liepin', 'zhilian', 'job51']) {
  if (jobsRouter.includes(`asyncio.create_task(_run_platform_login("${platform}"))`)) {
    throw new Error(`jobs router bypasses the singleton login gate for ${platform}`);
  }
}

requireMarkers('task state', taskState, [
  'class DeliveryState',
  'cancel_event',
  'def start(',
  'def stop(',
  'def should_stop(',
]);

for (const [name, source] of [['zhilian', zhilianService], ['liepin', liepinService], ['job51', job51Service]]) {
  requireMarkers(name + ' observation service', source, ['async def observe_job', 'updated_at', 'get_job_list']);
}

requireMarkers('Zhilian worker', zhilian, [
  'experience_code not in {"-1", "0001", "0103"}',
  'filters["we"] = experience_code',
  'filters["et"] = employment_code',
  'url_filters.get("we") != [experience_code]',
  'url_filters.get("et") != [employment_code]',
  'per_band_limit = max(1, (total_budget + len(experience_codes) - 1) // len(experience_codes))',
  'return await self._deliver_current_page(max_items=max_cards)',
  'class ZhilianBot',
  'AsyncCamoufox',
  'run_delivery',
  'task_state.should_stop()',
  'is_logged_in',
  'JOB_HARNESS_GET_JOBS_COLLECT_ONLY',
  'async def _read_verified_detail_link',
  'last_title == expected_title and last_company == expected_company',
  'job_link = await self._read_verified_detail_link(card, job_title, company_name)',
  '仅采集模式',
  '已投递',
  '今日投递已达上限',
]);
requireMarkers('Zhilian locators', zhilianLocators, [
  'zhaopin.com',
  'DETAIL_TITLE',
  'DETAIL_COMPANY',
  'DETAIL_JOB_LINK',
  '.job-detail-summary__title-text',
  '.job-company-info__name',
  "a.job-company-info__view-all[href*='/jobdetail/']",
  '投递',
  '已投递',
]);

requireMarkers('Liepin worker', liepin, [
  'class LiepinBot',
  'AsyncCamoufox',
  'run_delivery',
  'task_state.should_stop()',
  'is_logged_in',
  'JOB_HARNESS_GET_JOBS_COLLECT_ONLY',
  '仅采集模式',
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
  'JOB_HARNESS_GET_JOBS_COLLECT_ONLY',
  '仅采集模式',
  '出现访问验证，停止投递',
  '检测到今日投递已达上限',
]);
requireMarkers('51job locators', job51Locators, [
  '51job.com',
  '投递成功',
  '投递上限',
]);

const schemas = await text('app/schemas.py');
for (const marker of ['job_link: Optional[str]', 'location: Optional[str]', 'job_area: Optional[str]', 'job_exp_req: Optional[str]']) {
  if (!schemas.includes(marker)) throw new Error(`Upstream candidate list API lost rich discovery field: ${marker}`);
}

execFileSync('python3', [resolve(import.meta.dirname, 'test-get-jobs-native-filters.py'), candidate], { stdio: 'inherit' });

execFileSync('python3', ['-m', 'py_compile',
  resolve(candidate, 'app/main.py'),
  resolve(candidate, 'app/routers/jobs.py'),
  resolve(candidate, 'app/schemas.py'),
  resolve(candidate, 'app/worker/zhilian_bot.py'),
  resolve(candidate, 'app/worker/liepin_bot.py'),
  resolve(candidate, 'app/worker/job51_bot.py'),
], { stdio: 'inherit' });

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
