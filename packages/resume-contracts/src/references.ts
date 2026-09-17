import type { ResumeLibrary, ResumeProfile } from './schemas';

export interface ResumeReferenceIssue {
  readonly path: string;
  readonly id: string;
  readonly message: string;
}

export function validateResumeProfileReferences(library: ResumeLibrary, profile: ResumeProfile): ResumeReferenceIssue[] {
  const issues: ResumeReferenceIssue[] = [];
  const education = new Set(library.education.map((item) => item.id));
  const skills = new Set(library.skills.map((item) => item.id));
  const work = new Map(library.workExperiences.map((item) => [item.id, item]));
  const projects = new Map(library.projects.map((item) => [item.id, item]));
  const certificates = new Set(library.certificates.map((item) => item.id));
  const summaries = new Set(library.summaries.map((item) => item.id));

  const missing = (path: string, id: string, type: string) => issues.push({ path, id, message: `${type} does not exist in ResumeLibrary` });

  profile.educationIds.forEach((id, index) => { if (!education.has(id)) missing(`educationIds.${index}`, id, 'education'); });
  profile.skillIds.forEach((id, index) => { if (!skills.has(id)) missing(`skillIds.${index}`, id, 'skill'); });
  profile.certificateIds.forEach((id, index) => { if (!certificates.has(id)) missing(`certificateIds.${index}`, id, 'certificate'); });
  profile.summaryIds.forEach((id, index) => { if (!summaries.has(id)) missing(`summaryIds.${index}`, id, 'summary'); });

  profile.workSelections.forEach((selection, index) => {
    const item = work.get(selection.experienceId);
    if (!item) {
      missing(`workSelections.${index}.experienceId`, selection.experienceId, 'work experience');
      return;
    }
    const bullets = new Set(item.bullets.map((bullet) => bullet.id));
    selection.bulletIds.forEach((id, bulletIndex) => { if (!bullets.has(id)) missing(`workSelections.${index}.bulletIds.${bulletIndex}`, id, 'work bullet'); });
  });

  profile.projectSelections.forEach((selection, index) => {
    const item = projects.get(selection.projectId);
    if (!item) {
      missing(`projectSelections.${index}.projectId`, selection.projectId, 'project');
      return;
    }
    if (!item.presentations.some((presentation) => presentation.id === selection.presentationId)) {
      missing(`projectSelections.${index}.presentationId`, selection.presentationId, 'project presentation');
    }
    const highlights = new Set(item.highlights.map((highlight) => highlight.id));
    selection.highlightIds.forEach((id, highlightIndex) => { if (!highlights.has(id)) missing(`projectSelections.${index}.highlightIds.${highlightIndex}`, id, 'project highlight'); });
  });

  profile.overrides.forEach((override, index) => {
    if (override.kind === 'skill' && !skills.has(override.skillId)) missing(`overrides.${index}.skillId`, override.skillId, 'skill');
    if (override.kind === 'summary' && !summaries.has(override.summaryId)) missing(`overrides.${index}.summaryId`, override.summaryId, 'summary');
    if (override.kind === 'work-bullet') {
      const item = work.get(override.experienceId);
      if (!item) missing(`overrides.${index}.experienceId`, override.experienceId, 'work experience');
      else if (!item.bullets.some((bullet) => bullet.id === override.bulletId)) missing(`overrides.${index}.bulletId`, override.bulletId, 'work bullet');
    }
    if (override.kind === 'project-highlight') {
      const item = projects.get(override.projectId);
      if (!item) missing(`overrides.${index}.projectId`, override.projectId, 'project');
      else if (!item.highlights.some((highlight) => highlight.id === override.highlightId)) missing(`overrides.${index}.highlightId`, override.highlightId, 'project highlight');
    }
  });

  return issues;
}
