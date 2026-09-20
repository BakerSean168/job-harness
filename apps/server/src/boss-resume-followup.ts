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
  readonly intent: 'explicit-resume-request' | 'question' | 'interview' | 'rejection' | 'positive' | 'unknown' | 'none';
  readonly reason: 'already-sent' | 'latest-not-recruiter' | 'explicit-request' | 'recruiter-question' | 'interview-invite' | 'recruiter-rejection' | 'positive-reply-review' | 'unknown-reply-review';
}

function recentRecruiterText(input: BossResumeFollowupRequest): string {
  let text = '';
  for (let index = input.msgs.length - 1; index >= 0; index -= 1) {
    const message = input.msgs[index]!;
    if (message.role !== 'user') break;
    text = `${message.content}\n${text}`;
  }
  return text.trim();
}

function classifyRecruiterIntent(input: BossResumeFollowupRequest): BossResumeFollowupDecision['intent'] {
  const recent = recentRecruiterText(input);
  if (/(?:不合适|不太合适|不匹配|不符合|暂不考虑|暂时不考虑|岗位.{0,6}(?:关闭|暂停|取消)|已经?招到|招满|感谢.{0,8}(?:关注|投递)|很遗憾)/i.test(recent)) return 'rejection';
  if (input.needResume > 0 || /(?:(?:发|发送|给|提供|投递|上传).{0,10}(?:简历|履历|resume|\bcv\b)|(?:简历|履历|resume|\bcv\b).{0,10}(?:发|发送|给|看看|看下|看一下|提供|投递|上传|方便))/i.test(recent)) return 'explicit-resume-request';
  if (/(?:面试|笔试|测评|电话面|视频面|现场面|到司|来公司|约.{0,6}(?:时间|面|聊))/i.test(recent)) return 'interview';
  if (/[?？]|(?:什么时候|是否|能否|可以.{0,8}吗|方便.{0,8}吗|多久|在哪|哪里|薪资|期望|到岗|毕业|实习|技术栈|经验|地点|城市|加班|单休|接受|考虑)/i.test(recent)) return 'question';
  if (/(?:你好|您好|hi\b|hello\b|可以聊|方便聊|感兴趣|可以沟通|聊一下|聊聊|收到|好的|可以的)/i.test(recent)) return 'positive';
  return 'unknown';
}

export function decideBossResumeFollowup(raw: unknown, _threshold = 58): BossResumeFollowupDecision {
  const input = BossResumeFollowupRequestSchema.parse(raw);
  const latest = input.msgs.at(-1) ?? null;
  if (!latest || latest.role !== 'user') return { need: false, intent: 'none', reason: 'latest-not-recruiter' };

  const intent = classifyRecruiterIntent(input);
  if (input.resumeSended) return { need: false, intent, reason: 'already-sent' };
  if (intent === 'explicit-resume-request') return { need: true, intent, reason: 'explicit-request' };
  if (intent === 'rejection') return { need: false, intent, reason: 'recruiter-rejection' };
  if (intent === 'interview') return { need: false, intent, reason: 'interview-invite' };
  if (intent === 'question') return { need: false, intent, reason: 'recruiter-question' };
  if (intent === 'positive') return { need: false, intent, reason: 'positive-reply-review' };
  return { need: false, intent, reason: 'unknown-reply-review' };
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
