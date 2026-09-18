import {
  ApplicantProfileSchema,
  ApplicationAnswerSetSchema,
} from '@job-harness/applicant-contracts';
import type { ApplicantRuntimePorts } from '@job-harness/applicant-application';
import type { ResumeRuntimePorts } from '@job-harness/resume-application';

export async function ensureApplicantDefaultsFromResume(applicant: ApplicantRuntimePorts, resume: ResumeRuntimePorts): Promise<void> {
  const existingProfile = await applicant.getDefaultProfile();
  const existingAnswerSet = await applicant.getDefaultAnswerSet();
  if (existingProfile && existingAnswerSet) return;
  const profiles = await resume.listProfiles({ includeArchived: false });
  if (!profiles.items.length && !existingProfile) return;
  const contexts = (await Promise.all(profiles.items.map((profile) => resume.getProfileContext(profile.id)))).filter((value): value is NonNullable<typeof value> => value != null);
  const source = contexts[0] ?? null;
  if (!source && !existingProfile) return;
  const now = new Date().toISOString();
  const targetRoles = [...new Set(contexts.map((context) => context.resolved.positioning).filter(Boolean))];
  const education = source?.resolved.education.map((item) => ({
    id: item.id,
    school: item.institution,
    institutionTag: item.institutionTag,
    major: item.major,
    degree: item.degree || null,
    department: item.department,
    location: item.location,
    startMonth: item.period.start,
    endMonth: item.period.end,
  })) ?? [];
  await applicant.ensureDefaults({
    profile: existingProfile?.profile ?? ApplicantProfileSchema.parse({
      id: 'default-applicant', version: 1, displayName: source!.resolved.basics.displayName,
      phone: source!.resolved.basics.contact.phone, email: source!.resolved.basics.contact.email,
      location: source!.resolved.basics.contact.location, website: source!.resolved.basics.contact.website,
      github: source!.resolved.basics.contact.github, education, targetRoles, targetCities: [], availableFrom: null,
      notes: '由 Job Harness Resume Domain 首次初始化；后续以 Applicant Profile 为自动填表基础信息真值。', createdAt: now, updatedAt: now,
    }),
    answerSet: existingAnswerSet?.answerSet ?? ApplicationAnswerSetSchema.parse({
      id: 'default-application-answers', version: 1, name: '默认投递问答', entries: [], createdAt: now, updatedAt: now,
    }),
  });
}
