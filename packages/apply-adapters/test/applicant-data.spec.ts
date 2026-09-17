import { describe, expect, it } from 'vitest';
import { LegacyProfileV2ApplicantDataProvider } from '../src';

const bundle = {
  profiles: [{
    id: 'frontend',
    profileV2: {
      schemaVersion: 2,
      sections: {
        basic: { values: { 姓名: 'Fixture User', 电话: '13800000000', 邮箱: 'fixture-secret@example.test', 最高学历: '本科' } },
        other: { values: { GitHub: 'https://github.com/fixture', 个人主页: 'https://fixture.example' } },
        intention: { items: [{ values: { 意向岗位: '前端开发工程师' } }] },
        education: { items: [{ values: { 学校: 'Fixture University', 专业: '物联网工程', 学历: '本科', 开始时间: '2022-09', 结束时间: '2026-06' } }] },
        internship: { items: [{ values: { 公司: 'Fixture Co', 职位: '前端实习生', 工作内容: 'Built web features' } }] },
        project: { items: [{ values: { 项目名称: 'Fixture Project', 本人职责: 'Implemented UI', 项目链接: 'https://example.test/project' } }] },
        language: { items: [] },
        certificates: { items: [] },
      },
    },
  }],
};

describe('Legacy Profile V2 compatibility ApplicantDataProvider', () => {
  it('publishes keys/types/sensitivity without leaking applicant values into the mapping catalog', async () => {
    const provider = LegacyProfileV2ApplicantDataProvider.fromBundle(bundle, 'frontend');
    const catalog = await provider.catalog();
    const serialized = JSON.stringify(catalog);
    expect(catalog.version).toMatch(/^legacy-profile-v2:frontend:/);
    expect(catalog.entries.map((entry) => entry.key)).toContain('person.full_name');
    expect(catalog.entries.map((entry) => entry.key)).toContain('education[0].school');
    expect(catalog.entries.map((entry) => entry.key)).toContain('work[0].description');
    expect(serialized).not.toContain('Fixture User');
    expect(serialized).not.toContain('13800000000');
    expect(serialized).not.toContain('fixture-secret@example.test');
    expect(catalog.entries.find((entry) => entry.key === 'contact.email')).toMatchObject({ sensitivity: 'sensitive', allowAiMapping: false });
  });

  it('resolves only explicitly requested literal values and preserves provider provenance', async () => {
    const provider = LegacyProfileV2ApplicantDataProvider.fromBundle(bundle, 'frontend');
    const resolved = await provider.resolve(['contact.email', 'education[0].major', 'unknown.key']);
    expect(resolved.values).toEqual([
      expect.objectContaining({ key: 'contact.email', value: 'fixture-secret@example.test', literal: true }),
      expect.objectContaining({ key: 'education[0].major', value: '物联网工程', literal: true }),
    ]);
    expect(resolved.values.every((value) => value.provenance === 'legacy-profile-v2:frontend')).toBe(true);
  });
});
