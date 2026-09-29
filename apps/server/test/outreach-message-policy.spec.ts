import { describe, expect, it } from 'vitest';
import {
  buildDeterministicOutreachGreeting,
  buildOutreachGreetingGuidance,
  classifyOutreachRole,
  selectOutreachGreetingSignals,
} from '../src/outreach-message-policy';

const mixedSignals = ['React', 'TypeScript', 'FastAPI', 'PostgreSQL', 'Agent Harness', 'MCP', 'Docker'];

describe('shared outreach message policy', () => {
  it('classifies the three active resume directions without coupling to one platform', () => {
    expect(classifyOutreachRole({ profileId: 'ai-frontend', profileLabel: '前端开发工程师' })).toBe('frontend');
    expect(classifyOutreachRole({ profileId: 'ai-fullstack', profileLabel: '全栈开发工程师' })).toBe('fullstack');
    expect(classifyOutreachRole({ profileId: 'ai-agent-app', profileLabel: 'AI Agent / 大模型应用开发工程师' })).toBe('ai-application');
    expect(classifyOutreachRole({ profileId: 'ai-agent-app', profileLabel: 'AI Agent / 大模型应用开发工程师', jobTitle: '前端开发工程师' })).toBe('ai-application');
  });

  it('uses role emphasis to select truthful evidence from the same matched signal pool', () => {
    expect(selectOutreachGreetingSignals({ profileId: 'ai-frontend', profileLabel: '前端开发工程师', signals: mixedSignals })).toEqual(['React', 'TypeScript']);
    expect(selectOutreachGreetingSignals({ profileId: 'ai-fullstack', profileLabel: '全栈开发工程师', signals: mixedSignals })).toEqual(['FastAPI', 'React']);
    expect(selectOutreachGreetingSignals({ profileId: 'ai-agent-app', profileLabel: 'AI Agent / 大模型应用开发工程师', signals: mixedSignals })).toEqual(['Agent Harness', 'FastAPI']);
  });

  it('keeps the shared prompt truthful and does not advertise school, major, or graduate status by default', () => {
    const guidance = buildOutreachGreetingGuidance({ profileId: 'ai-frontend', profileLabel: '前端开发工程师', jobTitle: 'Web 前端开发工程师' }).join(' ');
    expect(guidance).toContain('不使用固定文案模板');
    expect(guidance).toContain('前端方向');
    expect(guidance).toContain('默认不要主动提学校、专业');
    expect(guidance).toContain('物联网工程');
    expect(guidance).toContain('不得编造');
  });

  it('builds concise role-aware fallback copy only from supplied matched signals', () => {
    const frontend = buildDeterministicOutreachGreeting({
      profileId: 'ai-frontend', profileLabel: '前端开发工程师', jobTitle: '前端开发工程师', signals: mixedSignals,
    });
    const fullstack = buildDeterministicOutreachGreeting({
      profileId: 'ai-fullstack', profileLabel: '全栈开发工程师', jobTitle: '全栈开发工程师', signals: mixedSignals,
    });
    const agent = buildDeterministicOutreachGreeting({
      profileId: 'ai-agent-app', profileLabel: 'AI Agent / 大模型应用开发工程师', jobTitle: 'AI 应用开发工程师', signals: mixedSignals,
    });

    expect(frontend).toContain('React、TypeScript');
    expect(frontend).not.toContain('FastAPI');
    expect(fullstack).toContain('FastAPI、React');
    expect(agent).toContain('Agent Harness、FastAPI');
    for (const message of [frontend, fullstack, agent]) {
      expect(message).not.toContain('物联网工程');
      expect(message.length).toBeGreaterThanOrEqual(12);
      expect(message.length).toBeLessThanOrEqual(320);
    }
  });
});
