export type OutreachRoleFamily = 'frontend' | 'fullstack' | 'ai-application' | 'general';

export interface OutreachRoleContext {
  readonly profileId: string;
  readonly profileLabel: string;
  readonly jobTitle?: string | null;
}

export interface OutreachGreetingInput extends OutreachRoleContext {
  readonly signals: readonly string[];
}

const GENERIC_SIGNAL = /^(?:前端开发|全栈开发|后端开发|软件开发|开发工程师|AI\s*Agent|Agent开发|AI应用开发|大模型应用开发|全栈|前端|后端)$/i;

const ROLE_SIGNAL_GROUPS: Record<OutreachRoleFamily, readonly (readonly string[])[]> = {
  frontend: [
    ['vue', 'vue3', 'react', 'next', 'nuxt', 'typescript', 'javascript', 'vite'],
    ['sse', 'websocket', '性能', '组件', '工程化', '状态管理', 'tanstack', '交互'],
  ],
  fullstack: [
    ['node', 'nestjs', 'express', 'python', 'fastapi', 'django', 'go', 'java', 'spring', 'rest', 'grpc', 'api'],
    ['vue', 'vue3', 'react', 'next', 'typescript', 'javascript'],
    ['postgres', 'mysql', 'redis', 'docker', 'kubernetes', '部署', '数据库'],
  ],
  'ai-application': [
    ['agent', 'llm', '大模型', 'rag', 'mcp', 'skill', 'langgraph', 'pydanticai', 'multi-agent', '多智能体', 'tool calling', 'orchestration', 'memory', 'planning', '评测'],
    ['python', 'fastapi', 'node', 'api', 'rest', 'grpc', 'postgres', 'redis', 'docker'],
    ['vue', 'react', 'typescript', 'sse', 'websocket', '前端'],
  ],
  general: [],
};

const ROLE_GUIDANCE: Record<OutreachRoleFamily, string> = {
  frontend: '当前是前端方向：优先从真实经历中选择 Vue/React、TypeScript、交互与实时通信、性能或前端工程化等与 JD 直接相关的 1-2 个证据。',
  fullstack: '当前是全栈方向：优先体现端到端交付能力；在真实证据存在时，尽量覆盖一项后端/API/数据能力和一项前端能力，不要为了“全栈”硬凑不存在的技术。',
  'ai-application': '当前是 AI 应用开发方向：优先强调真实的 LLM/Agent/RAG/MCP/Skills/工作流/评测实践，并按 JD 需要结合 API、数据或前端交付能力。',
  general: '优先选择与当前 JD 最直接相关的 1-2 个真实项目、经历或技术证据，不要机械堆砌关键词。',
};

const ROLE_FALLBACK_LABEL: Record<OutreachRoleFamily, string> = {
  frontend: '前端开发',
  fullstack: '全栈开发',
  'ai-application': 'AI 应用开发',
  general: '当前岗位',
};

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizedSearchText(value: string): string {
  return compact(value).toLowerCase();
}

function signalMatches(signal: string, keywords: readonly string[]): boolean {
  const normalized = normalizedSearchText(signal);
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export function classifyOutreachRole(input: OutreachRoleContext): OutreachRoleFamily {
  const profile = normalizedSearchText(`${input.profileId} ${input.profileLabel}`);
  if (/fullstack|full-stack|全栈/.test(profile)) return 'fullstack';
  if (/frontend|front-end|前端/.test(profile)) return 'frontend';
  if (/ai[-_ ]?agent|agent|大模型|llm|rag|mcp|multi-agent|多智能体|ai应用|ai 应用/.test(profile)) return 'ai-application';

  const jobTitle = normalizedSearchText(input.jobTitle ?? '');
  if (/fullstack|full-stack|全栈/.test(jobTitle)) return 'fullstack';
  if (/frontend|front-end|前端/.test(jobTitle)) return 'frontend';
  if (/ai[-_ ]?agent|agent|大模型|llm|rag|mcp|multi-agent|多智能体|ai应用|ai 应用/.test(jobTitle)) return 'ai-application';
  return 'general';
}

export function selectOutreachGreetingSignals(input: OutreachGreetingInput, limit = 2): string[] {
  const boundedLimit = Math.max(0, Math.min(3, Math.floor(limit)));
  if (!boundedLimit) return [];
  const unique = input.signals
    .map(compact)
    .filter((value) => value && !GENERIC_SIGNAL.test(value))
    .filter((value, index, all) => all.indexOf(value) === index);
  const role = classifyOutreachRole(input);
  const selected: string[] = [];
  for (const group of ROLE_SIGNAL_GROUPS[role]) {
    const match = unique.find((signal) => !selected.includes(signal) && signalMatches(signal, group));
    if (match) selected.push(match);
    if (selected.length >= boundedLimit) return selected;
  }
  for (const signal of unique) {
    if (!selected.includes(signal)) selected.push(signal);
    if (selected.length >= boundedLimit) break;
  }
  return selected;
}

export function normalizeOutreachGreetingMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const message = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (message.length < 12 || message.length > 320) return null;
  return message;
}

export function buildOutreachGreetingGuidance(input: OutreachRoleContext): readonly string[] {
  const role = classifyOutreachRole(input);
  return Object.freeze([
    '根据岗位 JD 和候选人真实简历内容临时生成首次沟通文案；允许复用统一策略，但不使用固定文案模板，也不要机械发送完全相同的内容。',
    '用中文，1-3 句，简洁自然，像真人求职者；通常控制在 50-120 个汉字左右。',
    ROLE_GUIDANCE[role],
    '岗位 JD 决定最终取舍：只强调当前岗位真正相关的技术和经历，不要因为简历里存在某项能力就强行带上。',
    '不得编造候选人未提供的经历、年限、公司、奖项或技能熟练度。',
    '如果 JD 的核心必备要求与候选人真实经历明显不符，应选择 skip，而不是勉强生成招呼语。',
    '默认不要主动提学校、专业（例如物联网工程）或应届身份；只有 JD 明确要求这些信息，或它们能直接增强当前岗位匹配度时才考虑提及。',
    '不要重复姓名，不要使用“精通”“非常熟练”等无证据强表述；结尾自然表达希望进一步沟通。',
    'send 时只提交最终要发送给招聘方的文案，不要解释生成过程；skip 时给出简短原因。',
  ]);
}

export function buildDeterministicOutreachGreeting(input: OutreachGreetingInput): string {
  const role = classifyOutreachRole(input);
  const signals = selectOutreachGreetingSignals(input, 2);
  const jobTitle = compact(input.jobTitle ?? '');
  const roleLabel = jobTitle || (role === 'general' ? compact(input.profileLabel) || ROLE_FALLBACK_LABEL.general : ROLE_FALLBACK_LABEL[role]);
  const evidence = signals.length >= 2
    ? `项目和实践中涉及 ${signals.join('、')}`
    : signals.length === 1
      ? `有 ${signals[0]} 相关项目实践`
      : `有与${role === 'general' ? compact(input.profileLabel) || '岗位' : ROLE_FALLBACK_LABEL[role]}方向相关的项目实践`;
  const message = `您好，看到贵司的${roleLabel}岗位，${evidence}，和岗位方向比较契合，希望有机会进一步沟通，谢谢。`;
  return normalizeOutreachGreetingMessage(message)
    ?? '您好，我关注到贵司这个岗位，我的项目经历与岗位方向有一定匹配，希望有机会进一步沟通，谢谢。';
}
