import { describe, expect, it } from 'vitest';
import { matchesCampaignEducation, matchesCampaignExperience, titleLooksLikeEntryLevelDeveloper } from '../src/qualification-policy';

describe('discovery qualification policy', () => {
  it('keeps entry-level developer titles and rejects senior/non-engineering title traps', () => {
    expect(titleLooksLikeEntryLevelDeveloper('AI Agent开发工程师')).toBe(true);
    expect(titleLooksLikeEntryLevelDeveloper('AI Agent Developer')).toBe(true);
    expect(titleLooksLikeEntryLevelDeveloper('AI Agent架构师')).toBe(false);
    expect(titleLooksLikeEntryLevelDeveloper('Senior AI Agent Engineer')).toBe(false);
    expect(titleLooksLikeEntryLevelDeveloper('AI Agent产品经理')).toBe(false);
  });
  it('matches normalized Campaign experience and education constraints', () => {
    const experience = ['经验不限','1-3年'];
    expect(matchesCampaignExperience('经验不限', experience)).toBe(true);
    expect(matchesCampaignExperience('1-3年', experience)).toBe(true);
    expect(matchesCampaignExperience('3-5年', experience)).toBe(false);
    const education = ['本科','统招本科','学历不限','大专'];
    expect(matchesCampaignEducation('统招本科', education)).toBe(true);
    expect(matchesCampaignEducation('本科', education)).toBe(true);
    expect(matchesCampaignEducation('学历不限', education)).toBe(true);
    expect(matchesCampaignEducation('硕士', education)).toBe(false);
  });
});
