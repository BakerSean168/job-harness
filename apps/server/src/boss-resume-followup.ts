import { z } from 'zod';

const BossChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(5000),
}).strict();

export const BossResumeFollowupRequestSchema = z.object({
  msgs: z.array(BossChatMessageSchema).max(300),
  needResume: z.number().int().min(0).max(2).default(0),
  resumeSended: z.boolean(),
  title: z.string().trim().min(1).max(500),
  company: z.string().trim().max(300).nullable().optional(),
  salary: z.string().trim().max(120).nullable().optional(),
  score: z.number().min(0).max(100),
  resumeIndex: z.number().int().min(0).max(20),
}).strict();
export type BossResumeFollowupRequest = z.infer<typeof BossResumeFollowupRequestSchema>;

export interface BossResumeFollowupDecision {
  readonly need: boolean;
  readonly reason: 'already-sent' | 'latest-not-recruiter' | 'explicit-request' | 'qualified-followup' | 'below-threshold';
}

export function decideBossResumeFollowup(raw: unknown, threshold = 58): BossResumeFollowupDecision {
  const input = BossResumeFollowupRequestSchema.parse(raw);
  if (input.resumeSended) return { need: false, reason: 'already-sent' };
  const latest = input.msgs.at(-1) ?? null;
  if (!latest || latest.role !== 'user') return { need: false, reason: 'latest-not-recruiter' };
  const recent = (() => {
    let text = '';
    for (let index = input.msgs.length - 1; index >= 0; index -= 1) {
      const message = input.msgs[index]!;
      if (message.role !== 'user') break;
      text = `${message.content}\n${text}`;
    }
    return text;
  })();
  const explicit = input.needResume > 0 || /简历|附件|履历|resume|\bcv\b/i.test(recent);
  if (explicit) return { need: true, reason: 'explicit-request' };
  if (input.score >= threshold) return { need: true, reason: 'qualified-followup' };
  return { need: false, reason: 'below-threshold' };
}

export interface PatchBossResumeFollowupOptions {
  readonly publicUrl: string;
  readonly version?: string;
}

function requiredReplace(source: string, search: string | RegExp, replacement: string, label: string): string {
  if (typeof search === 'string') {
    if (!source.includes(search)) throw new Error(`Legacy BOSS userscript is incompatible: missing ${label}`);
    return source.replace(search, replacement);
  }
  if (!search.test(source)) throw new Error(`Legacy BOSS userscript is incompatible: missing ${label}`);
  return source.replace(search, replacement);
}

export function patchBossResumeFollowupUserscript(source: string, options: PatchBossResumeFollowupOptions): string {
  const publicUrl = new URL(options.publicUrl).toString();
  const version = options.version ?? '2026.09.18.1';
  let output = source;
  output = requiredReplace(output, /^\/\/ @name\s+.*$/m, '// @name         Job Application Copilot BOSS', 'userscript name');
  output = requiredReplace(output, /^\/\/ @namespace\s+.*$/m, '// @namespace    https://oracle.taile92a8e.ts.net/job-application-copilot', 'userscript namespace');
  output = requiredReplace(output, /^\/\/ @version\s+.*$/m, `// @version      ${version}`, 'userscript version');
  output = requiredReplace(output, /^\/\/ @description\s+.*$/m, '// @description  Job Harness · 自动筛岗/首次打招呼 + 招聘方回复后按岗位自动发送对应简历；禁用多轮自动聊天', 'userscript description');
  output = requiredReplace(
    output,
    '// @match        https://www.zhipin.com/*',
    `// @match        https://www.zhipin.com/*\n// @updateURL    ${publicUrl}\n// @downloadURL  ${publicUrl}`,
    'userscript match metadata',
  );
  output = requiredReplace(output, 'onlyGreet: true, // 是否只打招呼，默认为false，即打招呼和代聊天', 'onlyGreet: false, // Job Harness follow-up mode: 允许处理招聘方新消息，但仍禁用 LLM 多轮自动聊天', 'onlyGreet default');
  output = requiredReplace(output, 'const JAC_HARD_ONLY_GREET = true;', 'const JAC_HARD_ONLY_GREET = false;', 'hard only-greet guard');

  const sendAnchor = "                                status(`检测到新消息，直接发送简历（简历索引 ${decision.resumeIndex}）`);\n                                const resumeResult = await sendResume(decision.resumeIndex);";
  const guardedSend = [
    '                                const resumeAllowed = await api.isNeedResume({',
    '                                    msgs: chatInfo.msgs,',
    '                                    needResume: chatInfo.needResume,',
    '                                    resumeSended: chatInfo.resumeSended,',
    '                                    title: jobInfo.title,',
    '                                    company,',
    '                                    salary: jobInfo.salary,',
    '                                    score: decision.score,',
    '                                    resumeIndex: decision.resumeIndex,',
    '                                });',
    '                                if (!resumeAllowed) {',
    '                                    await logAction({',
    "                                        action: 'resume_followup_blocked',",
    "                                        scene: 'chat',",
    '                                        title: jobInfo.title,',
    '                                        salary: jobInfo.salary,',
    '                                        score: decision.score,',
    '                                        resumeIndex: decision.resumeIndex,',
    '                                    });',
    "                                    status('检测到新消息，但 Job Harness policy 未授权自动发送简历');",
    '                                    continue;',
    '                                }',
    '                                status(`检测到新消息，Job Harness 已授权发送简历（简历索引 ${decision.resumeIndex}）`);',
    '                                const resumeResult = await sendResume(decision.resumeIndex);',
  ].join('\n');

  output = requiredReplace(output, sendAnchor, guardedSend, 'resume follow-up send anchor');
  output = requiredReplace(
    output,
    "                                    await sendMsg('不好意思，不太合适哈，祝早日找到合适的人选。')",
    "                                    status('岗位低于阈值，Job Harness follow-up mode 不自动发送拒绝消息');",
    'below-threshold rejection message',
  );

  for (const invariant of [
    'const JAC_HARD_ONLY_GREET = false;',
    "action: 'resume_followup_blocked'",
    'const resumeAllowed = await api.isNeedResume({',
    "status('岗位低于阈值，Job Harness follow-up mode 不自动发送拒绝消息');",
    '@updateURL',
    '@downloadURL',
  ]) {
    if (!output.includes(invariant)) throw new Error(`Generated BOSS follow-up userscript is missing invariant: ${invariant}`);
  }
  return output;
}
