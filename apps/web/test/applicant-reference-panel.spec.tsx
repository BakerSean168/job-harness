// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicantProfileContext, ApplicationAnswerSetContext } from '@job-harness/applicant-contracts';
import { ApplicantReferencePanel } from '../src/components/management/applicant-reference-panel';

const now = '2026-09-19T06:00:00.000Z';

const profileContext: ApplicantProfileContext = {
  profile: {
    id: 'default-applicant',
    version: 5,
    displayName: '测试用户',
    phone: '13800000000',
    email: 'test@example.com',
    gender: 'male',
    birthDate: '2004-08-17',
    location: '浙江金华',
    jobSearchStatus: 'actively_looking',
    careerIdentity: 'new_graduate',
    website: 'https://example.com/',
    github: 'https://github.com/example',
    education: [{
      id: 'education-1',
      school: '四川农业大学',
      institutionTag: '（211）',
      major: '物联网工程',
      degree: '本科',
      admissionType: 'unified',
      department: '信息工程学院',
      location: '雅安',
      startMonth: '2022-09',
      endMonth: '2026-06',
    }],
    targetRoles: ['前端开发工程师', '全栈开发工程师'],
    targetCities: ['杭州', '深圳'],
    availableFrom: '可立即到岗',
    notes: null,
    createdAt: now,
    updatedAt: now,
  },
  latestRevision: {
    id: 'revision-5',
    profileId: 'default-applicant',
    revisionNumber: 5,
    profileVersion: 5,
    snapshot: undefined as never,
    contentHash: 'a'.repeat(64),
    createdAt: now,
    createdBy: 'user',
  },
};
(profileContext.latestRevision as { snapshot: ApplicantProfileContext['profile'] }).snapshot = profileContext.profile;

const answerSetContext: ApplicationAnswerSetContext = {
  answerSet: {
    id: 'default-answers',
    version: 2,
    name: '投递问答',
    entries: [{
      id: 'answer-1',
      key: 'availability.notice_period',
      label: '到岗时间',
      valueType: 'text',
      sensitivity: 'personal',
      value: '可立即到岗',
      aliases: ['最快到岗时间'],
      siteHost: null,
      enabled: true,
    }],
    createdAt: now,
    updatedAt: now,
  },
  latestRevision: {
    id: 'answer-revision-2',
    answerSetId: 'default-answers',
    revisionNumber: 2,
    answerSetVersion: 2,
    snapshot: undefined as never,
    contentHash: 'b'.repeat(64),
    createdAt: now,
    createdBy: 'user',
  },
};
(answerSetContext.latestRevision as { snapshot: ApplicationAnswerSetContext['answerSet'] }).snapshot = answerSetContext.answerSet;

const copy = {
  title: '资料参考 / 快速复制',
  description: '快速复制',
  search: '搜索资料',
  searchPlaceholder: '搜索',
  copyValue: '复制',
  copyCategory: '复制本类',
  copyVisible: '复制当前结果',
  copied: '已复制',
  empty: '没有匹配的资料。',
  privacyNote: '只在 Web 会话中展示',
  educationPrefix: '教育经历 ',
  siteScope: '限定站点',
  globalScope: '全站通用',
  categories: { profile: '基础资料', job: '求职偏好', education: '教育经历', answers: '投递问答' },
  fields: {
    name: '姓名', phone: '手机', email: '邮箱', gender: '性别', birthDate: '出生日期', location: '当前城市 / 所在地',
    careerIdentity: '求职身份', jobSearchStatus: '当前求职状态', github: 'GitHub', website: '个人网站', notes: '备注',
    targetRoles: '目标岗位', targetCities: '目标城市', availableFrom: '可到岗时间', school: '学校', institutionTag: '院校标签',
    degree: '学历 / 学位', major: '专业', admissionType: '招生类型', department: '学院 / 院系', educationLocation: '学校所在地', period: '就读时间',
  },
  values: {
    male: '男', female: '女', student: '学生', newGraduate: '应届 / 新毕业生', professional: '职场人',
    activelyLooking: '正在积极求职', open: '对机会开放', notLooking: '暂不求职', unified: '统招', nonUnified: '非统招',
  },
};

afterEach(() => cleanup());

describe('ApplicantReferencePanel', () => {
  it('restores searchable one-click copy without moving Applicant truth into browser extension storage', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<ApplicantReferencePanel profileContext={profileContext} answerSetContext={answerSetContext} copy={copy} />);

    expect(screen.getByText('四川农业大学')).toBeTruthy();
    expect(screen.getByText('物联网工程')).toBeTruthy();
    expect(screen.getByText('统招')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '学校' } });
    expect(screen.getByText('四川农业大学')).toBeTruthy();
    expect(screen.queryByText('测试用户')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '复制 学校' }));
    expect(writeText).toHaveBeenCalledWith('四川农业大学');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '到岗' } });
    fireEvent.click(screen.getByRole('button', { name: '复制当前结果' }));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('到岗时间：可立即到岗'));
  });
});
