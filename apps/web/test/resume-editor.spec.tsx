// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResumeProfileContext } from '@job-harness/resume-contracts';
import { ResumeEditor } from '../src/components/management/resume-editor';

vi.mock('server-only', () => ({}));
vi.mock('../src/app/resumes/actions', () => ({
  saveResumeLibraryAction: vi.fn(),
  saveResumeProfileAction: vi.fn(),
  syncResumeRevisionToSiteAction: vi.fn(),
}));

const both = (zh: string, en = zh) => ({ 'zh-CN': zh, en });
const now = '2026-09-17T01:00:00.000Z';

const context: ResumeProfileContext = {
  library: {
    id: 'primary', schemaVersion: 2, version: 1,
    basics: { displayName: both('张三', 'Sean Zhang'), contact: { phone: both('123'), email: 'a@example.com', website: null, github: null, location: null }, photoAssetId: null },
    education: [], skills: [], workExperiences: [], projects: [], certificates: [], summaries: [],
    createdAt: now, updatedAt: now,
  },
  profile: {
    id: 'agent', libraryId: 'primary', version: 1, name: both('Agent 简历'), targetRole: both('Agent 工程师'), locale: 'zh-CN', templateId: 'classic-v1', positioning: both('Agent 工程师'),
    output: { documentTitle: both('Agent 简历'), description: null, onlineUrl: null, pdfName: both('Agent') },
    layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: [], educationIds: [], skillIds: [], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [], archivedAt: null, createdAt: now, updatedAt: now,
  },
  resolved: {
    libraryId: 'primary', libraryVersion: 1, profileId: 'agent', profileVersion: 1, locale: 'zh-CN', templateId: 'classic-v1', positioning: 'Agent 工程师',
    output: { documentTitle: 'Agent 简历', description: null, onlineUrl: null, pdfName: 'Agent' }, layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: [],
    basics: { displayName: '张三', contact: { phone: '123', email: 'a@example.com', website: null, github: null, location: null }, photoAssetId: null },
    education: [], skills: [], workExperiences: [], projects: [], certificates: [], summaries: [],
  },
};


afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const copy = {
  preview: '预览', details: '详情', targetRole: '目标方向', locale: '语言', template: '模板', profileVersion: 'Profile', libraryVersion: 'Library', usage: '使用', readOnly: '只读', editProfile: '当前 Profile', editShared: '共享内容', formMode: '表单', sourceMode: 'Source', save: '保存', saving: '保存中', saved: '已保存', saveFailed: '保存失败', sourceInvalid: 'Source 无效', previewFailed: '预览失败', sharedWarning: '共享内容会影响多个 Profile', name: '名称', positioning: '定位', documentTitle: '标题', pdfName: 'PDF', header: '页头', displayName: '姓名', email: '邮箱', phone: '电话', website: '网站', github: 'GitHub', unsavedChanges: '有尚未保存的简历修改，确定离开吗？', history: 'Revision 历史', noRevisions: '尚未发布 Revision。', publish: '发布 Revision', publishing: '发布中…', publishNote: 'Revision 说明（可选）', published: '已发布 Revision', reusedRevision: '内容未变化，复用已有 Revision', saveBeforePublish: '请先保存当前所有修改，再发布 Revision。', comparePrevious: '对比上一版', compareCurrent: '对比当前', changes: '处变化', noChanges: '没有差异', diffFailed: '加载 Diff 失败', downloadPdf: 'PDF', downloadHtml: 'HTML', downloadJson: 'JSON', revisionUnused: '未使用', revisionLastUsed: '最近使用', siteSync: '同步到招聘站', siteSyncDescription: '同步已发布 PDF', siteSyncAgent: '浏览器', siteSyncNoAgent: '无浏览器', syncLiepin: '同步到猎聘', syncingToSite: '同步中', siteSyncSuccess: '同步成功', siteSyncFailed: '同步失败', siteBinding: '有效站点绑定', siteBindingNone: '暂无', resyncLiepin: '重新同步到猎聘',
};

describe('ResumeEditor draft ownership', () => {
  it('keeps unsaved profile and library drafts when switching edit scope', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<ResumeEditor initialContext={context} initialHtml="<html></html>" initialRevisions={[]} revisionUsage={[]} usage={{ applications: 0, submissions: 0, screening: 0, assessment: 0, interview: 0 }} usageLabels={{ applications: '投递', submissions: '提交', screening: '筛选', assessment: '测评', interview: '面试' }} applicationsHref="/applications" viewApplicationsLabel="查看投递" syncAgents={[]} siteBindings={[]} copy={copy} />);

    const profileName = screen.getByLabelText('名称');
    fireEvent.change(profileName, { target: { value: '未保存的新 Profile 名称' } });
    expect(screen.getByDisplayValue('未保存的新 Profile 名称')).toBeTruthy();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(fireEvent.click(screen.getByRole('link', { name: '查看投递' }))).toBe(false);
    expect(confirm).toHaveBeenCalledWith('有尚未保存的简历修改，确定离开吗？');

    fireEvent.click(screen.getByRole('button', { name: '共享内容' }));
    const displayName = screen.getByLabelText('姓名');
    fireEvent.change(displayName, { target: { value: '未保存的新姓名' } });
    expect(screen.getByDisplayValue('未保存的新姓名')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '当前 Profile' }));
    expect(screen.getByDisplayValue('未保存的新 Profile 名称')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '共享内容' }));
    expect(screen.getByDisplayValue('未保存的新姓名')).toBeTruthy();
  });
});


describe('ResumeEditor site binding projection', () => {
  it('renders active site-resume bindings beside the exact immutable revision', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const revision: any = { id:'rev-1', profileId:'agent', revisionNumber:1, profileVersion:1, libraryVersion:1, contentHash:'a'.repeat(64), note:null, resolvedDocumentSnapshot:context.resolved, createdAt:now };
    const binding: any = { id:'binding-1', siteFamily:'liepin', browserAgentId:'windows-chrome-primary', profileId:'agent', resumeRevisionId:'rev-1', resumeArtifactId:'artifact-1', externalResumeLabel:'AI Agent 简历', assurance:'user-confirmed-label', characterizationRunId:'run-1', characterizationFormStateHash:'b'.repeat(64), characterizationObservedAt:now, status:'active', createdAt:now, updatedAt:now, revokedAt:null, idempotencyKey:'k', requestHash:'c'.repeat(64), revokeIdempotencyKey:null, revokeRequestHash:null };
    render(<ResumeEditor initialContext={context} initialHtml="<html></html>" initialRevisions={[revision]} revisionUsage={[]} usage={{ applications:0, submissions:0, screening:0, assessment:0, interview:0 }} usageLabels={{ applications:'投递', submissions:'提交', screening:'筛选', assessment:'测评', interview:'面试' }} applicationsHref="/applications" viewApplicationsLabel="查看投递" syncAgents={[{ agentId:'windows-chrome-primary', name:'Chrome', version:'0.1.6', browserName:'Chrome', platform:'Windows', online:true, lastSeenAt:now, queuedCommands:0, inFlightCommands:0, resumeUpload:true, screenshots:false }]} siteBindings={[binding]} copy={copy} />);
    expect(screen.getByText('liepin · AI Agent 简历')).toBeTruthy();
    expect(screen.getByRole('button', { name:'重新同步到猎聘' })).toBeTruthy();
  });
});
