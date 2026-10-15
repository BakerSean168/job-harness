import { describe, expect, it } from 'vitest';
import { companyNameMatchesRule, matchingCompanyBlockRule } from '../src';

describe('employer-only blacklist rules', () => {
  it('matches identified brands in company names without matching unrelated employers', () => {
    const rule = { pattern: '外企德科', matchMode: 'contains' as const, active: true };
    expect(companyNameMatchesRule('浙江外企德科人力资源服务有限公司', rule)).toBe(true);
    expect(companyNameMatchesRule('外企德科数字技术有限公司', rule)).toBe(true);
    expect(companyNameMatchesRule('星德科包装技术(杭州)有限公司', rule)).toBe(false);
    expect(companyNameMatchesRule('广州德科知识产权代理有限公司', rule)).toBe(false);
    expect(companyNameMatchesRule('外企德科', { ...rule, active: false })).toBe(false);
  });

  it('checks company aliases, exact legal name, and brand prefixes', () => {
    const rules = [
      { pattern: '北京科睿金信技术有限公司', matchMode: 'exact' as const, active: true },
      { pattern: '京北方', matchMode: 'prefix' as const, active: true },
    ];
    expect(matchingCompanyBlockRule(['北京科睿金信技术有限公司'], rules)).toBe(rules[0]);
    expect(matchingCompanyBlockRule(['北京科睿金信科技有限公司'], rules)).toBeNull();
    expect(matchingCompanyBlockRule(['京北方信息技术股份有限公司'], rules)).toBe(rules[1]);
    expect(matchingCompanyBlockRule(['第三方公司', '京北方'], rules)).toBe(rules[1]);
  });
});
