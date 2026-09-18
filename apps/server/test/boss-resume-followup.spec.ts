import { describe, expect, it } from 'vitest';
import { decideBossResumeFollowup, patchBossResumeFollowupUserscript } from '../src/boss-resume-followup';

describe('BOSS resume follow-up policy', () => {
  it('allows a qualified recruiter follow-up and explicit resume requests, but never duplicates a sent resume', () => {
    expect(decideBossResumeFollowup({ msgs: [{ role: 'assistant', content: '您好' }, { role: 'user', content: '方便聊聊吗' }], needResume: 0, resumeSended: false, title: 'Agent', score: 82, resumeIndex: 0 })).toEqual({ need: true, reason: 'qualified-followup' });
    expect(decideBossResumeFollowup({ msgs: [{ role: 'user', content: '请发一份简历看看' }], needResume: 1, resumeSended: false, title: 'Agent', score: 41, resumeIndex: 0 })).toEqual({ need: true, reason: 'explicit-request' });
    expect(decideBossResumeFollowup({ msgs: [{ role: 'user', content: '请发简历' }], needResume: 2, resumeSended: true, title: 'Agent', score: 90, resumeIndex: 0 })).toEqual({ need: false, reason: 'already-sent' });
    expect(decideBossResumeFollowup({ msgs: [{ role: 'assistant', content: '我发过消息' }], needResume: 0, resumeSended: false, title: 'Agent', score: 90, resumeIndex: 0 })).toEqual({ need: false, reason: 'latest-not-recruiter' });
    expect(decideBossResumeFollowup({ msgs: [{ role: 'user', content: '你好' }], needResume: 0, resumeSended: false, title: '不匹配', score: 40, resumeIndex: 0 })).toEqual({ need: false, reason: 'below-threshold' });
  });

  it('patches the proven legacy DOM userscript rather than reimplementing its sendResume flow', () => {
    const fixture = `// ==UserScript==\n// @name         Old\n// @namespace    old\n// @version      1\n// @description  old\n// @match        https://www.zhipin.com/*\n// ==/UserScript==\nconst OPTIONS={ onlyGreet: true, // 是否只打招呼，默认为false，即打招呼和代聊天\n};\nconst JAC_HARD_ONLY_GREET = true;\nasync function x(){\n                                status(\`检测到新消息，直接发送简历（简历索引 \${decision.resumeIndex}）\`);\n                                const resumeResult = await sendResume(decision.resumeIndex);\n                                    await sendMsg('不好意思，不太合适哈，祝早日找到合适的人选。')\n}`;
    const output = patchBossResumeFollowupUserscript(fixture, { publicUrl: 'https://oracle.example/boss-resume-followup.user.js' });
    expect(output).toContain('// @name         Job Application Copilot BOSS');
    expect(output).toContain('// @namespace    https://oracle.taile92a8e.ts.net/job-application-copilot');
    expect(output).toContain('const JAC_HARD_ONLY_GREET = false;');
    expect(output).toContain('const resumeAllowed = await api.isNeedResume({');
    expect(output).toContain("action: 'resume_followup_blocked'");
    expect(output).not.toContain("await sendMsg('不好意思，不太合适哈，祝早日找到合适的人选。')");
    expect(output).toContain('@updateURL    https://oracle.example/boss-resume-followup.user.js');
  });
});
