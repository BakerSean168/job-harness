import {
  ResolvedResumeSchema,
  ResumeLibrarySchema,
  ResumeProfileSchema,
  validateResumeProfileReferences,
  type LocalizedText,
  type ResolvedResume,
  type ResumeLibrary,
  type ResumeProfile,
} from '@job-harness/resume-contracts';

export interface ResumeResolutionIssue {
  readonly path: string;
  readonly message: string;
}

export class ResumeResolutionError extends Error {
  readonly issues: readonly ResumeResolutionIssue[];

  constructor(issues: readonly ResumeResolutionIssue[]) {
    super(`Resume resolution failed with ${issues.length} issue(s)`);
    this.name = 'ResumeResolutionError';
    this.issues = issues;
  }
}

function createLocalizer(locale: ResumeProfile['locale'], issues: ResumeResolutionIssue[]) {
  return (value: LocalizedText | null | undefined, path: string, nullable = false): string | null => {
    if (value == null) {
      if (nullable) return null;
      issues.push({ path, message: 'required localized value is missing' });
      return '';
    }
    const resolved = value[locale];
    if (!resolved) {
      issues.push({ path, message: `locale ${locale} is missing` });
      return nullable ? null : '';
    }
    return resolved;
  };
}

export function resolveResume(libraryInput: ResumeLibrary, profileInput: ResumeProfile): ResolvedResume {
  const library = ResumeLibrarySchema.parse(libraryInput);
  const profile = ResumeProfileSchema.parse(profileInput);
  const issues: ResumeResolutionIssue[] = validateResumeProfileReferences(library, profile).map((issue) => ({
    path: issue.path,
    message: `${issue.message}: ${issue.id}`,
  }));
  const localize = createLocalizer(profile.locale, issues);

  const resolvePeriod = (period: ResumeLibrary['education'][number]['period'], path: string) => ({
    start: period.start,
    end: period.end,
    current: period.current,
    note: localize(period.note, `${path}.note`, true),
  });

  const skillOverrides = new Map(
    profile.overrides.filter((item) => item.kind === 'skill').map((item) => [item.skillId, item.value]),
  );
  const summaryOverrides = new Map(
    profile.overrides.filter((item) => item.kind === 'summary').map((item) => [item.summaryId, item.value]),
  );
  const workBulletOverrides = new Map(
    profile.overrides
      .filter((item) => item.kind === 'work-bullet')
      .map((item) => [`${item.experienceId}\u0000${item.bulletId}`, item.value]),
  );
  const projectHighlightOverrides = new Map(
    profile.overrides
      .filter((item) => item.kind === 'project-highlight')
      .map((item) => [`${item.projectId}\u0000${item.highlightId}`, item.value]),
  );

  const educationById = new Map(library.education.map((item) => [item.id, item]));
  const skillById = new Map(library.skills.map((item) => [item.id, item]));
  const workById = new Map(library.workExperiences.map((item) => [item.id, item]));
  const projectById = new Map(library.projects.map((item) => [item.id, item]));
  const certificateById = new Map(library.certificates.map((item) => [item.id, item]));
  const summaryById = new Map(library.summaries.map((item) => [item.id, item]));

  const education = profile.educationIds.flatMap((id, index) => {
    const item = educationById.get(id);
    if (!item) return [];
    return [{
      id: item.id,
      institution: localize(item.institution, `educationIds.${index}.institution`) ?? '',
      institutionTag: localize(item.institutionTag, `educationIds.${index}.institutionTag`, true),
      major: localize(item.major, `educationIds.${index}.major`) ?? '',
      degree: localize(item.degree, `educationIds.${index}.degree`) ?? '',
      department: localize(item.department, `educationIds.${index}.department`, true),
      studyType: localize(item.studyType, `educationIds.${index}.studyType`, true),
      location: localize(item.location, `educationIds.${index}.location`, true),
      period: resolvePeriod(item.period, `educationIds.${index}.period`),
      courseSummary: localize(item.courseSummary, `educationIds.${index}.courseSummary`, true),
    }];
  });

  const skills = profile.skillIds.flatMap((id, index) => {
    const item = skillById.get(id);
    if (!item) return [];
    const content = skillOverrides.get(id) ?? item.content;
    return [{
      id,
      label: localize(item.label, `skillIds.${index}.label`, true),
      content: localize(content, `skillIds.${index}.content`) ?? '',
      keywords: item.keywords,
    }];
  });

  const workExperiences = profile.workSelections.flatMap((selection, index) => {
    const item = workById.get(selection.experienceId);
    if (!item) return [];
    const bulletById = new Map(item.bullets.map((bullet) => [bullet.id, bullet]));
    return [{
      id: item.id,
      company: localize(item.company, `workSelections.${index}.company`) ?? '',
      role: localize(item.role, `workSelections.${index}.role`) ?? '',
      department: localize(item.department, `workSelections.${index}.department`, true),
      location: localize(item.location, `workSelections.${index}.location`, true),
      period: resolvePeriod(item.period, `workSelections.${index}.period`),
      bullets: selection.bulletIds.flatMap((bulletId, bulletIndex) => {
        const bullet = bulletById.get(bulletId);
        if (!bullet) return [];
        const override = workBulletOverrides.get(`${item.id}\u0000${bulletId}`);
        return [{
          id: bullet.id,
          content: localize(override ?? bullet.content, `workSelections.${index}.bulletIds.${bulletIndex}.content`) ?? '',
        }];
      }),
    }];
  });

  const projects = profile.projectSelections.flatMap((selection, index) => {
    const item = projectById.get(selection.projectId);
    if (!item) return [];
    const presentation = item.presentations.find((candidate) => candidate.id === selection.presentationId);
    if (!presentation) return [];
    const highlightById = new Map(item.highlights.map((highlight) => [highlight.id, highlight]));
    return [{
      id: item.id,
      name: localize(presentation.name ?? item.name, `projectSelections.${index}.name`) ?? '',
      role: localize(presentation.role ?? item.role, `projectSelections.${index}.role`, true),
      location: localize(item.location, `projectSelections.${index}.location`, true),
      period: resolvePeriod(item.period, `projectSelections.${index}.period`),
      links: item.links.map((link, linkIndex) => ({
        label: localize(link.label, `projectSelections.${index}.links.${linkIndex}.label`, true),
        url: link.url,
      })),
      description: localize(presentation.description, `projectSelections.${index}.presentation.description`) ?? '',
      stack: localize(presentation.stack, `projectSelections.${index}.presentation.stack`, true),
      highlights: selection.highlightIds.flatMap((highlightId, highlightIndex) => {
        const highlight = highlightById.get(highlightId);
        if (!highlight) return [];
        const override = projectHighlightOverrides.get(`${item.id}\u0000${highlightId}`);
        return [{
          id: highlight.id,
          label: localize(highlight.label, `projectSelections.${index}.highlightIds.${highlightIndex}.label`, true),
          detail: localize(override ?? highlight.detail, `projectSelections.${index}.highlightIds.${highlightIndex}.detail`) ?? '',
        }];
      }),
    }];
  });

  const certificates = profile.certificateIds.flatMap((id, index) => {
    const item = certificateById.get(id);
    if (!item) return [];
    return [{
      id,
      label: localize(item.label, `certificateIds.${index}.label`) ?? '',
      issuer: localize(item.issuer, `certificateIds.${index}.issuer`, true),
      issuedAt: item.issuedAt,
    }];
  });

  const summaries = profile.summaryIds.flatMap((id, index) => {
    const item = summaryById.get(id);
    if (!item) return [];
    return [{
      id,
      label: localize(item.label, `summaryIds.${index}.label`, true),
      detail: localize(summaryOverrides.get(id) ?? item.detail, `summaryIds.${index}.detail`) ?? '',
    }];
  });

  const displayName = localize(library.basics.displayName, 'basics.displayName') ?? '';
  const contactLocation = localize(library.basics.contact.location, 'basics.contact.location', true);
  const positioning = localize(profile.positioning, 'profile.positioning') ?? '';
  const documentTitle = localize(profile.output.documentTitle, 'profile.output.documentTitle') ?? '';
  const outputDescription = localize(profile.output.description, 'profile.output.description', true);
  const outputPdfName = localize(profile.output.pdfName, 'profile.output.pdfName', true);

  if (issues.length) throw new ResumeResolutionError(issues);

  return ResolvedResumeSchema.parse({
    libraryId: library.id,
    libraryVersion: library.version,
    profileId: profile.id,
    profileVersion: profile.version,
    locale: profile.locale,
    templateId: profile.templateId,
    positioning,
    output: { documentTitle, description: outputDescription, onlineUrl: profile.output.onlineUrl, pdfName: outputPdfName },
    layout: profile.layout,
    sectionOrder: profile.sectionOrder,
    basics: {
      displayName,
      contact: {
        phone: localize(library.basics.contact.phone, 'basics.contact.phone', true),
        email: library.basics.contact.email,
        website: library.basics.contact.website,
        github: library.basics.contact.github,
        location: contactLocation,
      },
      photoAssetId: library.basics.photoAssetId,
    },
    education,
    skills,
    workExperiences,
    projects,
    certificates,
    summaries,
  });
}
