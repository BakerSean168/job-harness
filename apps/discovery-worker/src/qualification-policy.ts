export const TITLE_ONLY_NEGATIVE = /(?:负责人|架构师|专家|\bexpert\b|\barchitect\b|\bsenior\b|\blead\b|\bprincipal\b|\bdirector\b|\bstaff\b|资深|高级|主管|产品经理|产品专家|产品运营|测试|\bqa\b|投资|pmo|项目经理|需求分析|业务分析|\bba\b|售前|销售|运营|规划)/i;
export const TITLE_ONLY_DEVELOPER_SIGNAL = /(?:开发|研发|工程师|\bdeveloper\b|\bengineer\b|全栈|前端|后端)/i;

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
