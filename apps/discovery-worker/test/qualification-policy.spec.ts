import { describe, expect, it } from 'vitest';
import { descriptionMeetsApplicantAcademicRequirements, descriptionMeetsCampaignRequirements, inferMinimumEducationRank, inferMinimumExperienceYears, inferRequiredSchoolTierRank, matchesCampaignEducation, matchesCampaignExperience, titleEligibleForAutomaticPreparation, titleLooksLikeEntryLevelDeveloper, titleMatchesCampaignTargetRole } from '../src/qualification-policy';

describe('discovery qualification policy', () => {
  it('keeps entry-level developer titles and rejects senior/non-engineering title traps', () => {
    expect(titleLooksLikeEntryLevelDeveloper('AI Agent开发工程师')).toBe(true);
    expect(titleLooksLikeEntryLevelDeveloper('AI Agent Developer')).toBe(true);
    expect(titleLooksLikeEntryLevelDeveloper('AI Agent架构师')).toBe(false);
    expect(titleLooksLikeEntryLevelDeveloper('Senior AI Agent Engineer')).toBe(false);
    expect(titleLooksLikeEntryLevelDeveloper('AI Agent产品经理')).toBe(false);
  });
  it('matches only campaign target-role families for automatic qualification', () => {
    const roles = ['AI Agent / Agent 应用开发', '全栈开发', '前端开发'];
    expect(titleMatchesCampaignTargetRole('AI Agent开发工程师', roles)).toBe(true);
    expect(titleMatchesCampaignTargetRole('大模型应用开发工程师', roles)).toBe(true);
    expect(titleMatchesCampaignTargetRole('AI Native 智能体工程师', roles)).toBe(true);
    expect(titleMatchesCampaignTargetRole('AI全栈工程师', roles)).toBe(true);
    expect(titleMatchesCampaignTargetRole('AI Native 产品工程师', roles)).toBe(true);
    expect(titleMatchesCampaignTargetRole('Web前端开发工程师', roles)).toBe(true);
    expect(titleMatchesCampaignTargetRole('Agent 评测产品经理', roles)).toBe(false);
    expect(titleMatchesCampaignTargetRole('后端运维开发工程师-AI', roles)).toBe(false);
    expect(titleMatchesCampaignTargetRole('R&D Software Engineer', roles)).toBe(false);
    expect(titleMatchesCampaignTargetRole('python开发工程师', roles)).toBe(false);
  });

  it('keeps shortlist eligibility broader than the automatic-prepare role gate', () => {
    expect(titleEligibleForAutomaticPreparation('AI Agent开发工程师')).toBe(true);
    expect(titleEligibleForAutomaticPreparation('AI Agent实施工程师')).toBe(false);
    expect(titleEligibleForAutomaticPreparation('AI Agent Communication Engineer (5G/6G)')).toBe(false);
  });
  it('treats 985/211 as applicant hard requirements but ignores preference-only clauses', () => {
    expect(inferRequiredSchoolTierRank('本科毕业于优秀985院校或海外同水平院校')).toBe(2);
    expect(inferRequiredSchoolTierRank('985/211院校毕业')).toBe(1);
    expect(inferRequiredSchoolTierRank('985、211院校优先')).toBeNull();
    expect(descriptionMeetsApplicantAcademicRequirements('本科毕业于优秀985院校', [{ institutionTag: '（211）' }])).toBe(false);
    expect(descriptionMeetsApplicantAcademicRequirements('985/211院校毕业', [{ institutionTag: '（211）' }])).toBe(true);
    expect(descriptionMeetsApplicantAcademicRequirements('985院校优先', [{ institutionTag: '（211）' }])).toBe(true);
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
  it('rechecks explicit minimum experience and education inside the full JD', () => {
    expect(inferMinimumExperienceYears('要求 5 年以上软件开发经验，3年以上AI应用经验')).toBe(5);
    expect(inferMinimumExperienceYears('2年以上Java研发经验')).toBe(2);
    expect(inferMinimumEducationRank('计算机相关专业本科及以上学历')).toBe(2);
    expect(inferMinimumEducationRank('硕士及以上学历，人工智能相关专业')).toBe(3);
    const exp = ['经验不限','1年以内','1-3年'];
    const edu = ['学历不限','大专','本科','统招本科'];
    expect(descriptionMeetsCampaignRequirements('本科及以上学历，2年以上研发经验', exp, edu)).toBe(true);
    expect(descriptionMeetsCampaignRequirements('本科及以上学历，5年以上软件开发经验', exp, edu)).toBe(false);
    expect(descriptionMeetsCampaignRequirements('硕士及以上学历，1-3年开发经验', exp, edu)).toBe(false);
  });
});
