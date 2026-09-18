import { describe, expect, it } from 'vitest';
import { ResumeProfileSchema } from '@job-harness/resume-contracts';
import { rankResumeProfilesForJob } from '../src';

function profile(id: string, role: string) {
  return ResumeProfileSchema.parse({
    id, libraryId: 'primary', version: 1, name: { 'zh-CN': role }, targetRole: { 'zh-CN': role }, locale: 'zh-CN',
    templateId: 'classic-v1', positioning: { 'zh-CN': role }, output: { documentTitle: { 'zh-CN': role }, description: null, onlineUrl: null, pdfName: null },
    layout: { header: 'without-photo', pageSize: 'A4' }, sectionOrder: ['skills'], educationIds: [], skillIds: [], workSelections: [], projectSelections: [], certificateIds: [], summaryIds: [], overrides: [],
    createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z', archivedAt: null,
  });
}

const profiles = [
  profile('ai-agent-app', 'AI Agent / 大模型应用开发工程师'),
  profile('ai-agent-dongxu', 'AI Agent / Multi-Agent 应用开发工程师'),
  profile('ai-agent-forgeflow', 'AI Agent / 大模型应用开发工程师（ForgeFlow 版）'),
  profile('ai-frontend', '前端开发工程师'),
  profile('ai-fullstack', '全栈开发工程师'),
];

describe('legacy-compatible resume matching', () => {
  it('prefers the ForgeFlow specialization for Agent Harness orchestration roles', () => {
    const ranked = rankResumeProfilesForJob({
      title: 'Agent开发工程师',
      description: '负责 Agent Harness、Orchestration、Tool Calling、Memory、Planning、MCP 与多智能体 Supervisor 系统。',
    }, profiles);
    expect(ranked[0]).toMatchObject({ profileId: 'ai-agent-forgeflow', decision: 'strong-match' });
    expect(ranked[0]!.score).toBeGreaterThan(ranked.find((item) => item.profileId === 'ai-agent-app')!.score);
  });

  it('prefers the frontend profile for React TypeScript UI roles', () => {
    const ranked = rankResumeProfilesForJob({ title: '前端开发工程师', description: 'React TypeScript Vue3 SSE TanStack Query WebSocket 性能优化' }, profiles);
    expect(ranked[0]?.profileId).toBe('ai-frontend');
  });

  it('prefers the fullstack profile for mixed backend/frontend application roles', () => {
    const ranked = rankResumeProfilesForJob({ title: 'AI全栈开发工程师', description: 'React TypeScript Node.js Go Python FastAPI PostgreSQL Redis Docker RAG' }, profiles);
    expect(ranked[0]?.profileId).toBe('ai-fullstack');
  });
});
