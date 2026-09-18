export const TITLE_ONLY_NEGATIVE = /(?:负责人|架构师|专家|\bexpert\b|\barchitect\b|\bsenior\b|\blead\b|\bprincipal\b|\bdirector\b|\bstaff\b|资深|高级|主管|产品经理|产品专家|产品运营|用户增长|增长运营|市场|商务|测试|\bqa\b|投资|pmo|项目经理|需求分析|业务分析|\bba\b|售前|销售|运营|运维|规划)/i;
export const TITLE_ONLY_DEVELOPER_SIGNAL = /(?:开发|研发|工程师|\bdeveloper\b|\bengineer\b|全栈|前端|后端)/i;
export const AUTO_PREPARE_TITLE_NEGATIVE = /(?:实施|交付|客户成功|技术支持|现场支持|售前|\bsupport\b|customer\s*success|\bcommunication\b|通信|5g|6g|嵌入式|\bembedded\b|硬件|\bhardware\b)/i;

export interface ApplicantEducationEligibilityFact { readonly institutionTag?: string | null }

export function titleEligibleForAutomaticPreparation(title: string): boolean {
  return !AUTO_PREPARE_TITLE_NEGATIVE.test(title);
}

export function descriptionMeetsApplicantAcademicRequirements(
  description: string | null | undefined,
  education: readonly ApplicantEducationEligibilityFact[],
): boolean {
  const required = inferRequiredSchoolTierRank(description ?? '');
  if (required === null) return true;
  return applicantSchoolTierRank(education) >= required;
}

export function inferRequiredSchoolTierRank(text: string): number | null {
  const clauses = text.split(/[。；;\n]+/).map((part) => part.trim()).filter(Boolean);
  const ranks: number[] = [];
  for (const clause of clauses) {
    if (!/(?:985|211)/i.test(clause)) continue;
    if (/(?:优先|优先考虑|加分|preferred|plus)/i.test(clause)) continue;
    const has985 = /985/.test(clause);
    const has211 = /211/.test(clause);
    if (has985 && has211) ranks.push(1);
    else if (has985) ranks.push(2);
    else if (has211) ranks.push(1);
  }
  return ranks.length ? Math.max(...ranks) : null;
}

function applicantSchoolTierRank(education: readonly ApplicantEducationEligibilityFact[]): number {
  let rank = 0;
  for (const item of education) {
    const tag = item.institutionTag ?? '';
    if (/985/.test(tag)) rank = Math.max(rank, 2);
    else if (/211/.test(tag)) rank = Math.max(rank, 1);
  }
  return rank;
}




export function titleMatchesCampaignTargetRole(title: string, targetRoles: readonly string[]): boolean {
  if (!title || TITLE_ONLY_NEGATIVE.test(title)) return false;
  const normalized = title.toLowerCase().replace(/\s+/g, ' ').trim();
  const roleText = targetRoles.join(' ').toLowerCase();
  const wantsAgent = /agent|智能体|大模型|ai\s*应用|ai应用/.test(roleText);
  const wantsFullstack = /全栈|full\s*stack|fullstack/.test(roleText);
  const wantsFrontend = /前端|frontend|web\s*front/.test(roleText);

  if (wantsAgent && /(?:\bagent\b|智能体|大模型应用|ai\s*应用|ai应用|ai\s*native|智能应用)/i.test(normalized)) return true;
  if (wantsFullstack && /(?:全栈|full\s*stack|fullstack|product\s*engineer|产品工程师)/i.test(normalized)) return true;
  if (wantsFrontend && /(?:前端|frontend|web\s*前端|react\s*(?:开发|工程师)|vue\s*(?:开发|工程师))/i.test(normalized)) return true;
  return false;
}
export function titleLooksLikeEntryLevelDeveloper(title: string): boolean {
  return TITLE_ONLY_DEVELOPER_SIGNAL.test(title) && !TITLE_ONLY_NEGATIVE.test(title);
}

export function matchesCampaignExperience(raw: unknown, allowed: readonly string[]): boolean {
  if (!allowed.length || typeof raw !== 'string' || !raw.trim()) return true;
  const value = normalizeRequirement(raw, ['经验', '工作']);
  return allowed.some((candidate) => {
    const expected = normalizeRequirement(candidate, ['经验', '工作']);
    return expected === value || value.includes(expected) || expected.includes(value);
  });
}

export function matchesCampaignEducation(raw: unknown, allowed: readonly string[]): boolean {
  if (!allowed.length || typeof raw !== 'string' || !raw.trim()) return true;
  const value = normalizeRequirement(raw, ['学历', '统招']);
  return allowed.some((candidate) => {
    const expected = normalizeRequirement(candidate, ['学历', '统招']);
    if (expected === '不限') return value === '不限';
    return expected === value || value.includes(expected) || expected.includes(value);
  });
}

function normalizeRequirement(value: string, removable: readonly string[]): string {
  let result = value.toLowerCase().replace(/[\s~～至—–]/g, '').replace(/年限/g, '年').trim();
  for (const token of removable) result = result.replaceAll(token, '');
  return result;
}


export function descriptionMeetsCampaignRequirements(
  description: string | null | undefined,
  experience: readonly string[],
  education: readonly string[],
): boolean {
  const text = description?.trim() ?? '';
  if (!text) return true;
  const minimumYears = inferMinimumExperienceYears(text);
  const allowedYears = maxAllowedExperienceYears(experience);
  if (minimumYears !== null && allowedYears !== null && minimumYears > allowedYears) return false;
  const minimumEducation = inferMinimumEducationRank(text);
  const allowedEducation = maxAllowedEducationRank(education);
  if (minimumEducation !== null && allowedEducation !== null && minimumEducation > allowedEducation) return false;
  return true;
}

export function inferMinimumExperienceYears(text: string): number | null {
  const values: number[] = [];
  const patterns = [
    /(?:至少|不少于)\s*(\d{1,2})\s*年/gi,
    /(\d{1,2})\s*年\s*(?:以上|及以上|及其以上)/gi,
    /(\d{1,2})\s*[-~～至—–]\s*\d{1,2}\s*年(?:[^。；;\n]{0,24})?(?:经验|开发|研发|工作)/gi,
    /(\d{1,2})\s*年(?:[^。；;\n]{0,24})?(?:工作|开发|研发)?经验/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const years = Number(match[1]);
      if (Number.isFinite(years) && years >= 0 && years <= 50) values.push(years);
    }
  }
  return values.length ? Math.max(...values) : null;
}

export function inferMinimumEducationRank(text: string): number | null {
  const values: number[] = [];
  for (const [label, rank] of [['博士',4],['硕士',3],['本科',2],['大专',1]] as const) {
    const pattern = new RegExp(`${label}(?:\\s*)(?:及以上|以上|及其以上|学历)`, 'gi');
    if (pattern.test(text)) values.push(rank);
  }
  return values.length ? Math.max(...values) : null;
}

function maxAllowedExperienceYears(allowed: readonly string[]): number | null {
  if (!allowed.length) return null;
  const values: number[] = [];
  for (const raw of allowed) {
    for (const match of raw.matchAll(/(\d{1,2})/g)) values.push(Number(match[1]));
  }
  return values.length ? Math.max(...values) : 0;
}

function maxAllowedEducationRank(allowed: readonly string[]): number | null {
  if (!allowed.length) return null;
  let max = 0;
  for (const raw of allowed) {
    if (/博士/.test(raw)) max = Math.max(max, 4);
    else if (/硕士/.test(raw)) max = Math.max(max, 3);
    else if (/本科/.test(raw)) max = Math.max(max, 2);
    else if (/大专|专科/.test(raw)) max = Math.max(max, 1);
  }
  return max;
}
