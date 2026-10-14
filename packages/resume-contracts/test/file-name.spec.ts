import { describe, expect, it } from 'vitest';
import { resumeAttachmentFileName, resumeFileBaseName } from '../src';

describe('recipient-facing resume file names', () => {
  it('removes the obsolete V5.1 suffix but not the role distinction', () => {
    expect(resumeAttachmentFileName('卢楼豪-前端开发工程师-v5.1')).toBe('卢楼豪-前端开发工程师.pdf');
    expect(resumeAttachmentFileName('卢楼豪-AI全栈开发工程师-v5.1.pdf')).toBe('卢楼豪-AI全栈开发工程师.pdf');
    expect(resumeAttachmentFileName('卢楼豪-AIAgent应用开发工程师')).toBe('卢楼豪-AIAgent应用开发工程师.pdf');
    expect(resumeAttachmentFileName('Person-v５．１.PDF')).toBe('Person.pdf');
  });

  it('cleans unsafe names and keeps other revision provenance internal', () => {
    expect(resumeFileBaseName('Company/Role:Resume-v5.1.pdf')).toBe('Company-Role-Resume');
    expect(resumeAttachmentFileName(null, 'Candidate / Agent')).toBe('Candidate - Agent.pdf');
    expect(resumeAttachmentFileName('')).toBe('resume.pdf');
    expect(resumeAttachmentFileName('ForgeFlow-v2.pdf')).toBe('ForgeFlow-v2.pdf');
  });
});
