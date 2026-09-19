import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bundlePath = path.join(root, 'data', 'profile-bundle.json');
const outputRoot = path.join(root, '.local', 'czc-good-job');
const companionRoot = path.resolve(
  process.env.CZC_GOOD_JOB_DIR || '/home/ubuntu/projects/job-application-copilot-czc-good-job',
);
const upstreamUserscriptPath = path.join(companionRoot, 'web_script.js');
const pythonServerHost = process.env.CZC_SERVER_HOST || 'http://127.0.0.1:18788';
const bossPublicBaseUrl = String(
  process.env.JAC_BOSS_PUBLIC_BASE_URL || 'https://oracle.taile92a8e.ts.net:10444',
).replace(/\/+$/, '');

if (!fs.existsSync(bundlePath)) {
  throw new Error(`Missing profile bundle: ${bundlePath}\nRun pnpm copilot:sync in the resume repo first.`);
}
if (!fs.existsSync(upstreamUserscriptPath)) {
  throw new Error(`czc-good-job userscript not found: ${upstreamUserscriptPath}`);
}

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
if (!Array.isArray(bundle.profiles) || bundle.profiles.length === 0) {
  throw new Error('Profile bundle contains no profiles.');
}
const upstreamUserscript = fs.readFileSync(upstreamUserscriptPath, 'utf8');

fs.mkdirSync(outputRoot, { recursive: true });

const resumeIndexes = {
  'ai-agent-app': 0,
  'ai-frontend': 1,
  'ai-fullstack': 2,
};

for (const profile of bundle.profiles) {
  const resumeIndex = resumeIndexes[profile.id] ?? 0;
  const config = buildConfig(profile, resumeIndex);
  const targetDir = path.join(outputRoot, profile.id);
  const userscriptServerHost = `${bossPublicBaseUrl}/p/${profile.id}`;
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, 'user_config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(targetDir, 'boss-screening.user.js'),
    patchUserscript(upstreamUserscript, {
      serverHost: userscriptServerHost,
      resumeIndex,
      thread: 42,
      onlyGreet: true,
      screeningOnly: true,
      profileLabel: profile.label || profile.id,
    }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(targetDir, 'boss-copilot.user.js'),
    patchUserscript(upstreamUserscript, {
      serverHost: userscriptServerHost,
      resumeIndex,
      thread: config.frontend.thread,
      onlyGreet: true,
      screeningOnly: false,
      profileLabel: profile.label || profile.id,
    }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(targetDir, 'README.txt'),
    [
      `Profile: ${profile.label}`,
      `Recommended BOSS resume filename: ${profile.resumePdfName || '(not set)'}`,
      `Generated resumeIndex: ${resumeIndex}`,
      `Oracle2 only-greet backend: ${userscriptServerHost}`,
      '',
      'Recommended path:',
      '1. For real screening tests, install boss-screening.user.js into Tampermonkey first.',
      '2. Keep only one Job Application Copilot BOSS userscript enabled at a time.',
      '3. Screening mode reads real jobs and JD, calls Oracle2 scoring, and logs results, but never starts a chat.',
      '4. boss-copilot.user.js is the later only-greet mode; do not enable it until screening quality is accepted.',
      '5. Upload your three resumes to BOSS in the same index order before enabling only-greet mode.',
      '',
      'Optional legacy/full-chat path:',
      `- user_config.json still targets the Python czc-good-job backend at ${pythonServerHost}.`,
      '- Use it only if you intentionally enable the upstream reply/resume-sending workflow.',
      '',
    ].join('\n'),
    'utf8',
  );
  console.log(`Generated ${profile.id} -> ${targetDir}`);
}

function buildConfig(profile, resumeIndex) {
  const scoring = profile.scoring || {};
  const tags = unique([
    ...Object.keys(scoring.titleStrongKeywords || {}),
    ...Object.keys(scoring.titleMediumKeywords || {}),
  ]).slice(0, 10);

  return {
    resume_name: 'resume.md',
    think_model: 'qwen3:0.6b',
    chat_model: 'qwen3:0.6b',
    introduce: profile.greeting || '',
    character: '简洁 直接 礼貌',
    tags,
    backend: {
      job_score_delay_base_ms: 4000,
      job_score_delay_jitter_ms: 500,
    },
    frontend: {
      serverHost: pythonServerHost,
      resumeIndex,
      thread: 58,
      timestampTimeout: 3000,
      onlyGreet: true,
      manualFilterWaitMs: 10000,
      roundRestartDelayMs: 2000,
      maxEmptyRounds: 3,
      detailTimeout: 10000,
      greetTimeout: 12000,
      preloadScrollPixels: 180,
      preloadScrollWaitMs: 450,
      preloadStableRoundsLimit: 24,
      preloadMaxRounds: 300,
      preloadActivateCardEvery: 0,
      preloadActivateCardWaitMs: 250,
    },
    scoring: {
      title_block_keywords: scaleMap(scoring.titleBlockKeywords, 1.25, 100),
      title_penalty_keywords: {},
      title_strong_keywords: scaleMap(scoring.titleStrongKeywords, 2.25, 92),
      title_medium_keywords: scaleMap(scoring.titleMediumKeywords, 2.0, 68),
      detail_infra_keywords: scaleMap(scoring.detailStrongKeywords, 0.8, 16),
      detail_support_keywords: scaleMap(scoring.detailSupportKeywords, 0.8, 10),
      detail_negative_keywords: scaleMap(scoring.detailNegativeKeywords, 0.9, 30),
    },
  };
}

function patchUserscript(source, options) {
  const connectHost = new URL(options.serverHost).hostname;
  const helper = `
    const JAC_HARD_ONLY_GREET = true;
    const JAC_SCREENING_ONLY = ${options.screeningOnly ? 'true' : 'false'};
    const JAC_SCREENING_THRESHOLD = ${Number(options.thread) || 42};
    const JAC_SCREENING_MAX_JOBS = 20;
    const JAC_SCREENING_MAX_ROUNDS = 1;
    const JAC_SCREENING_PRELOAD_MAX_ROUNDS = 30;
    const JAC_SCREENING_PRELOAD_STABLE_ROUNDS = 8;

    function jacHttpRequest(details) {
        if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
            return GM.xmlHttpRequest(details);
        }
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('Tampermonkey GM_xmlhttpRequest is unavailable'));
                return;
            }
            GM_xmlhttpRequest({
                ...details,
                onload: resolve,
                onerror: reject,
                ontimeout: reject,
            });
        });
    }
`;

  let output = String(source)
    .replace(/^\/\/ @name\s+.*$/m, `// @name         Job Application Copilot BOSS${options.screeningOnly ? ' Screening' : ''}`)
    .replace(/^\/\/ @namespace\s+.*$/m, '// @namespace    https://oracle.taile92a8e.ts.net/job-application-copilot')
    .replace(/^\/\/ @version\s+.*$/m, '// @version      2026.08.20.5')
    .replace(/^\/\/ @description\s+.*$/m, `// @description  ${options.profileLabel} · Oracle2 ${options.screeningOnly ? 'screening-only' : 'only-greet'} · 人工控制最终投递`)
    .replace(
      /^\/\/ @grant\s+GM_xmlhttpRequest\s*$/m,
      [
        '// @grant        GM_xmlhttpRequest',
        '// @grant        GM.xmlHttpRequest',
        `// @connect      ${connectHost}`,
        '// @connect      127.0.0.1',
        '// @connect      localhost',
      ].join('\n'),
    )
    .replace(/serverHost:\s*'[^']*'/, `serverHost: '${escapeJsString(options.serverHost)}'`)
    .replace(/resumeIndex:\s*\d+/, `resumeIndex: ${Number(options.resumeIndex) || 0}`)
    .replace(/thread:\s*\d+/, `thread: ${Number(options.thread) || 58}`)
    .replace(/onlyGreet:\s*(?:true|false)/, `onlyGreet: ${options.onlyGreet ? 'true' : 'false'}`)
    .replace('    // api请求\n    class Api {', `${helper}\n    // api请求\n    class Api {`)
    .replace(/GM\.xmlHttpRequest\(\{/g, 'jacHttpRequest({')
    .replace(
      '            const sendResume = async (resumeIndex = OPTIONS.resumeIndex) => {',
      [
        '            const sendResume = async (resumeIndex = OPTIONS.resumeIndex) => {',
        '                if (JAC_HARD_ONLY_GREET) {',
        "                    throw new Error('onlyGreet mode blocks automatic resume sending');",
        '                }',
      ].join('\n'),
    )
    .replace('                else if (isChat) {', '                else if (isChat && !JAC_HARD_ONLY_GREET) {')
    .replace(
      '                    Object.assign(OPTIONS, clientConfig.frontend);',
      [
        '                    Object.assign(OPTIONS, clientConfig.frontend);',
        '                    if (JAC_HARD_ONLY_GREET) OPTIONS.onlyGreet = true;',
        '                    if (JAC_SCREENING_ONLY) {',
        '                        OPTIONS.thread = JAC_SCREENING_THRESHOLD;',
        '                        OPTIONS.preloadMaxRounds = Math.min(Number(OPTIONS.preloadMaxRounds || JAC_SCREENING_PRELOAD_MAX_ROUNDS), JAC_SCREENING_PRELOAD_MAX_ROUNDS);',
        '                        OPTIONS.preloadStableRoundsLimit = Math.min(Number(OPTIONS.preloadStableRoundsLimit || JAC_SCREENING_PRELOAD_STABLE_ROUNDS), JAC_SCREENING_PRELOAD_STABLE_ROUNDS);',
        '                    }',
      ].join('\n'),
    )
    .replace(
      '            let currentTagIdx = -1;\n            const processedJobHrefs = new Set();',
      [
        '            let currentTagIdx = -1;',
        "            const screeningSessionId = `boss-screen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;",
        '            const processedJobHrefs = new Set();',
      ].join('\n'),
    )
    .replace(
      "                        scene: 'search',\n                        title: jobInfo.title,\n                        salary: jobInfo.salary,\n                        score: decision.score,\n                        resumeIndex: decision.resumeIndex,",
      "                        scene: 'search',\n                        screeningSessionId,\n                        jobUrl: href,\n                        title: jobInfo.title,\n                        salary: jobInfo.salary,\n                        score: decision.score,\n                        threshold: OPTIONS.thread,\n                        screeningPassed: decision.score >= OPTIONS.thread,\n                        resumeIndex: decision.resumeIndex,",
    )
    .replace(
      '            const loop = async () => {\n                try {',
      [
        '            const loop = async () => {',
        '                if (JAC_SCREENING_ONLY && count >= JAC_SCREENING_MAX_JOBS) {',
        '                    logger.add(`筛查测试已达到 ${JAC_SCREENING_MAX_JOBS} 个岗位，自动停止`);',
        '                    this.pause = true;',
        '                    return;',
        '                }',
        '                try {',
      ].join('\n'),
    )
    .replace(
      '            const startRound = async () => {\n                resetRoundState();',
      [
        '            const startRound = async () => {',
        '                if (JAC_SCREENING_ONLY && currentRound >= JAC_SCREENING_MAX_ROUNDS) {',
        '                    logger.add(`筛查测试已完成 ${JAC_SCREENING_MAX_ROUNDS} 个搜索关键词，自动停止`);',
        '                    this.pause = true;',
        '                    return;',
        '                }',
        '                resetRoundState();',
      ].join('\n'),
    )
    .replace(
      '            const addToChatList = async (url) => {',
      [
        '            const addToChatList = async (url) => {',
        '                if (JAC_SCREENING_ONLY) {',
        "                    throw new Error('screening-only mode blocks BOSS chat creation');",
        '                }',
      ].join('\n'),
    )
    .replace(
      '                    // 如果分数达到阈值，打个招呼\n                    if (decision.score >= OPTIONS.thread) {',
      [
        '                    if (JAC_SCREENING_ONLY) {',
        "                        logger.add(`筛查结果：${decision.score >= OPTIONS.thread ? '通过' : '跳过'} | ${decision.score}/${OPTIONS.thread} | ${jobInfo.title}`);",
        '                        return loop();',
        '                    }',
        '                    // 如果分数达到阈值，打个招呼',
        '                    if (decision.score >= OPTIONS.thread) {',
      ].join('\n'),
    );

  if (options.onlyGreet) {
    const requiredGuards = [
      'const JAC_HARD_ONLY_GREET = true;',
      `const JAC_SCREENING_ONLY = ${options.screeningOnly ? 'true' : 'false'};`,
      `const JAC_SCREENING_THRESHOLD = ${Number(options.thread) || 42};`,
      'const JAC_SCREENING_MAX_JOBS = 20;',
      'const JAC_SCREENING_MAX_ROUNDS = 1;',
      'const JAC_SCREENING_PRELOAD_MAX_ROUNDS = 30;',
      'const JAC_SCREENING_PRELOAD_STABLE_ROUNDS = 8;',
      "throw new Error('onlyGreet mode blocks automatic resume sending')",
      'else if (isChat && !JAC_HARD_ONLY_GREET) {',
      'if (JAC_HARD_ONLY_GREET) OPTIONS.onlyGreet = true;',
      'OPTIONS.thread = JAC_SCREENING_THRESHOLD;',
      'OPTIONS.preloadMaxRounds = Math.min(Number(OPTIONS.preloadMaxRounds || JAC_SCREENING_PRELOAD_MAX_ROUNDS), JAC_SCREENING_PRELOAD_MAX_ROUNDS);',
      'const screeningSessionId = `boss-screen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;',
      'if (JAC_SCREENING_ONLY && count >= JAC_SCREENING_MAX_JOBS) {',
      'if (JAC_SCREENING_ONLY && currentRound >= JAC_SCREENING_MAX_ROUNDS) {',
      'if (JAC_SCREENING_ONLY) {',
      "throw new Error('screening-only mode blocks BOSS chat creation')"
    ];
    for (const guard of requiredGuards) {
      if (!output.includes(guard)) {
        throw new Error(`Failed to harden generated only-greet userscript: missing ${guard}`);
      }
    }
  }

  return output;
}

function escapeJsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function scaleMap(input, factor, cap) {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(
    Object.entries(input).map(([keyword, value]) => [
      keyword,
      Math.max(1, Math.min(cap, Math.round((Number(value) || 0) * factor))),
    ]),
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
