import { createHash } from 'node:crypto';
import {
  ResumeLibrarySchema,
  ResumeProfileSchema,
  type LocalizedText,
  type ResumeLibrary,
  type ResumeProfile,
} from '@job-harness/resume-contracts';
import { LegacyResumeBundleSchema, type LegacyProfile, type LegacyResumeBundle, type LegacyResumeData } from './legacy-schema';

type AnyRecord = Record<string, unknown>;

export interface ResumeMigrationFinding {
  readonly severity: 'warning' | 'error';
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface LegacyResumeImportResult {
  readonly library: ResumeLibrary;
  readonly profiles: readonly ResumeProfile[];
  readonly findings: readonly ResumeMigrationFinding[];
}

function value(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function localized(zh?: string, en?: string): LocalizedText | null {
  const out: { 'zh-CN'?: string; en?: string } = {};
  if (value(zh)) out['zh-CN'] = value(zh)!;
  if (value(en)) out.en = value(en)!;
  return Object.keys(out).length ? out : null;
}

function nestedLocale(raw: unknown, locale: 'zh' | 'en'): string | undefined {
  if (typeof raw === 'string') return value(raw);
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as AnyRecord;
  return value(record[locale]);
}

function localizedNested(zhRaw: unknown, enRaw: unknown): LocalizedText | null {
  const zh = nestedLocale(zhRaw, 'zh') ?? nestedLocale(enRaw, 'zh');
  const en = nestedLocale(enRaw, 'en') ?? nestedLocale(zhRaw, 'en');
  return localized(zh, en);
}

function localizedField(zhItem: AnyRecord | undefined, enItem: AnyRecord | undefined, field: string): LocalizedText | null {
  const zh = value(zhItem?.[field]);
  const en = value(enItem?.[field]) ?? value(zhItem?.[`${field}En`]);
  return localized(zh, en);
}

function localizedDynamicField(zhItem: AnyRecord | undefined, enItem: AnyRecord | undefined, field: string): LocalizedText | null {
  const zhRaw = zhItem?.[field];
  const enRaw = enItem?.[field];
  const zh = typeof zhRaw === 'string' ? value(zhRaw) : nestedLocale(zhRaw, 'zh');
  const en = typeof enRaw === 'string'
    ? value(enRaw)
    : nestedLocale(enRaw, 'en') ?? nestedLocale(enRaw, 'zh') ?? nestedLocale(zhRaw, 'en');
  return localized(zh, en);
}

function byId<T extends { id: string }>(items: readonly T[] | undefined): Map<string, T> {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

function orderedUnion<T extends { id: string }>(zh: readonly T[], en: readonly T[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of [...zh, ...(en ?? [])]) if (!seen.has(item.id)) { seen.add(item.id); result.push(item.id); }
  return result;
}

const EN_MONTHS = new Map([
  ['Jan', '01'], ['Feb', '02'], ['Mar', '03'], ['Apr', '04'], ['May', '05'], ['Jun', '06'],
  ['Jul', '07'], ['Aug', '08'], ['Sep', '09'], ['Oct', '10'], ['Nov', '11'], ['Dec', '12'],
]);

function parseLegacyPeriod(zhRaw: string | undefined, enRaw: string | undefined, path: string, findings: ResumeMigrationFinding[]) {
  const zh = value(zhRaw);
  if (zh) {
    const match = zh.match(/^(\d{4})年(\d{1,2})月\s*-\s*(?:(\d{4})年(\d{1,2})月|至今)(.*)$/);
    if (match) {
      const current = !match[3];
      const suffix = value(match[5]);
      return {
        start: `${match[1]}-${String(match[2]).padStart(2, '0')}`,
        end: current ? null : `${match[3]}-${String(match[4]).padStart(2, '0')}`,
        current,
        note: suffix ? localized(suffix, undefined) : null,
      };
    }
  }
  const en = value(enRaw);
  if (en) {
    const match = en.match(/^([A-Z][a-z]{2})\s+(\d{4})\s*-\s*(?:([A-Z][a-z]{2})\s+(\d{4})|Present)(.*)$/);
    if (match && EN_MONTHS.has(match[1]!)) {
      const current = !match[3];
      const suffix = value(match[5]);
      return {
        start: `${match[2]}-${EN_MONTHS.get(match[1]!)}`,
        end: current ? null : `${match[4]}-${EN_MONTHS.get(match[3]!)}`,
        current,
        note: suffix ? localized(undefined, suffix) : null,
      };
    }
  }
  if (zh || en) findings.push({ severity: 'warning', code: 'unparsed-period', path, message: `Could not parse legacy period: ${zh ?? en}` });
  return { start: null, end: null, current: false, note: null };
}

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function presentationIdFromDescriptionField(field?: string): string {
  if (!field || field === 'description') return 'default';
  const suffix = field.replace(/^description/, '');
  return kebab(suffix) || 'default';
}

function getProjectOverride(profile: LegacyProfile, projectId: string) {
  return profile.overrides?.projects?.[projectId];
}

function profileLocalized(profile: LegacyProfile, valueZh?: string, valueEn?: string): LocalizedText {
  const merged = localized(valueZh, valueEn);
  if (merged) return merged;
  return profile.meta.lang === 'en' ? { en: valueZh ?? profile.meta.name } : { 'zh-CN': valueZh ?? profile.meta.name };
}

function allOrSelection(selection: readonly string[] | 'all', ids: readonly string[]): string[] {
  return selection === 'all' ? [...ids] : [...selection];
}

function createPresentations(
  projectId: string,
  zhProject: AnyRecord | undefined,
  enProject: AnyRecord | undefined,
  profiles: readonly LegacyProfile[],
  findings: ResumeMigrationFinding[],
) {
  const configurations = new Map<string, { nameField?: string; descriptionField?: string; stackField?: string }>();
  configurations.set('default', {});

  for (const key of new Set([...Object.keys(zhProject ?? {}), ...Object.keys(enProject ?? {})])) {
    if (!key.startsWith('description') || key === 'description') continue;
    const id = presentationIdFromDescriptionField(key);
    const suffix = key.slice('description'.length);
    const stackField = `stack${suffix}`;
    configurations.set(id, {
      descriptionField: key,
      ...((zhProject?.[stackField] ?? enProject?.[stackField]) != null ? { stackField } : {}),
    });
  }

  for (const profile of profiles) {
    const override = getProjectOverride(profile, projectId);
    if (!override) continue;
    const id = presentationIdFromDescriptionField(override.descriptionField);
    configurations.set(id, {
      ...(override.nameField ? { nameField: override.nameField } : {}),
      ...(override.descriptionField ? { descriptionField: override.descriptionField } : {}),
      ...(override.stackField ? { stackField: override.stackField } : {}),
    });
  }

  return [...configurations.entries()].map(([id, config]) => {
    const descriptionField = config.descriptionField ?? 'description';
    const description = localizedDynamicField(zhProject, enProject, descriptionField);
      if (!description) findings.push({ severity: 'error', code: 'missing-project-description', path: `projects.${projectId}.presentations.${id}`, message: `Missing ${descriptionField}` });
    const stackField = config.stackField ?? 'stack';
    const stack = localizedDynamicField(zhProject, enProject, stackField);
    const name = config.nameField ? localizedDynamicField(zhProject, enProject, config.nameField) : null;
    return {
      id,
      name,
      description: description ?? { 'zh-CN': `[missing ${descriptionField}]` },
      stack,
      role: null,
    };
  });
}

export function importLegacyResumeBundle(input: LegacyResumeBundle, importedAt: string): LegacyResumeImportResult {
  const bundle = LegacyResumeBundleSchema.parse(input);
  const findings: ResumeMigrationFinding[] = [];
  const zh = bundle.zh;
  const en = bundle.en;

  const zhEducation = byId(zh.education); const enEducation = byId(en?.education);
  const zhSkills = byId(zh.skills); const enSkills = byId(en?.skills);
  const zhWork = byId(zh.work); const enWork = byId(en?.work);
  const zhProjects = byId(zh.projects); const enProjects = byId(en?.projects);
  const zhCertificates = byId(zh.certificates); const enCertificates = byId(en?.certificates);
  const zhSummaries = byId(zh.summary); const enSummaries = byId(en?.summary);

  const education = orderedUnion(zh.education, en?.education).map((id) => {
    const z = zhEducation.get(id) as AnyRecord | undefined; const e = enEducation.get(id) as AnyRecord | undefined;
    return {
      id,
      institution: localizedField(z, e, 'school') ?? { 'zh-CN': id },
      institutionTag: localizedField(z, e, 'schoolTag'),
      major: localizedField(z, e, 'major') ?? { 'zh-CN': id },
      degree: localizedField(z, e, 'degree') ?? { 'zh-CN': id },
      department: localizedField(z, e, 'department'),
      studyType: localizedField(z, e, 'type'),
      location: localizedField(z, e, 'location'),
      period: parseLegacyPeriod(value(z?.date), value(e?.date), `education.${id}.period`, findings),
      courseSummary: localizedNested(z?.courses, e?.courses),
    };
  });

  const skills = orderedUnion(zh.skills, en?.skills).map((id) => {
    const z = zhSkills.get(id) as AnyRecord | undefined; const e = enSkills.get(id) as AnyRecord | undefined;
    return { id, label: null, content: localized(value(z?.zh), value(e?.en) ?? value(e?.zh) ?? value(z?.en)) ?? { 'zh-CN': id }, keywords: [] };
  });

  const workExperiences = orderedUnion(zh.work, en?.work).map((id) => {
    const z = zhWork.get(id) as AnyRecord | undefined; const e = enWork.get(id) as AnyRecord | undefined;
    const zBullets = byId((z?.bullets as Array<{ id: string }> | undefined) ?? []); const eBullets = byId((e?.bullets as Array<{ id: string }> | undefined) ?? []);
    const bulletIds = orderedUnion((z?.bullets as Array<{ id: string }> | undefined) ?? [], (e?.bullets as Array<{ id: string }> | undefined) ?? []);
    return {
      id,
      company: localizedField(z, e, 'company') ?? { 'zh-CN': id },
      role: localizedField(z, e, 'role') ?? { 'zh-CN': id },
      department: localizedField(z, e, 'department'), location: localizedField(z, e, 'location'),
      period: parseLegacyPeriod(value(z?.date), value(e?.date), `workExperiences.${id}.period`, findings),
      bullets: bulletIds.map((bulletId) => {
        const zb = zBullets.get(bulletId) as AnyRecord | undefined; const eb = eBullets.get(bulletId) as AnyRecord | undefined;
        return { id: bulletId, content: localized(value(zb?.zh), value(eb?.en) ?? value(eb?.zh) ?? value(zb?.en)) ?? { 'zh-CN': bulletId } };
      }),
    };
  });

  const projects = orderedUnion(zh.projects, en?.projects).map((id) => {
    const z = zhProjects.get(id) as AnyRecord | undefined; const e = enProjects.get(id) as AnyRecord | undefined;
    const zHighlights = byId((z?.highlights as Array<{ id: string }> | undefined) ?? []); const eHighlights = byId((e?.highlights as Array<{ id: string }> | undefined) ?? []);
    const highlightIds = orderedUnion((z?.highlights as Array<{ id: string }> | undefined) ?? [], (e?.highlights as Array<{ id: string }> | undefined) ?? []);
    const link = value(z?.link) ?? value(e?.link);
    return {
      id,
      name: localizedField(z, e, 'name') ?? { 'zh-CN': id },
      role: localizedField(z, e, 'role'), location: localizedField(z, e, 'location'),
      period: parseLegacyPeriod(value(z?.date), value(e?.date), `projects.${id}.period`, findings),
      links: link ? [{ label: null, url: link }] : [],
      presentations: createPresentations(id, z, e, bundle.profiles, findings),
      highlights: highlightIds.map((highlightId) => {
        const zhHighlight = zHighlights.get(highlightId) as AnyRecord | undefined; const enHighlight = eHighlights.get(highlightId) as AnyRecord | undefined;
        return {
          id: highlightId,
          label: localizedNested(zhHighlight?.label, enHighlight?.label),
          detail: localizedNested(zhHighlight?.detail, enHighlight?.detail) ?? { 'zh-CN': highlightId },
        };
      }),
    };
  });

  const certificates = orderedUnion(zh.certificates, en?.certificates).map((id) => {
    const z = zhCertificates.get(id) as AnyRecord | undefined; const e = enCertificates.get(id) as AnyRecord | undefined;
    return { id, label: localized(value(z?.zh), value(e?.en) ?? value(e?.zh) ?? value(z?.en)) ?? { 'zh-CN': id }, issuer: null, issuedAt: null };
  });

  const summaries = orderedUnion(zh.summary, en?.summary).map((id) => {
    const z = zhSummaries.get(id) as AnyRecord | undefined; const e = enSummaries.get(id) as AnyRecord | undefined;
    return { id, label: localizedNested(z?.label, e?.label), detail: localizedNested(z?.detail, e?.detail) ?? { 'zh-CN': id } };
  });

  const library = ResumeLibrarySchema.parse({
    id: 'primary', schemaVersion: 2, version: 1,
    basics: {
      displayName: localized(zh.name, en?.name) ?? { 'zh-CN': zh.name },
      contact: {
        phone: localized(zh.contact.phone, en?.contact.phoneIntl ?? en?.contact.phone ?? zh.contact.phoneIntl),
        email: zh.contact.email, website: zh.contact.website, github: zh.contact.github, location: null,
      },
      photoAssetId: bundle.profiles.some((profile) => profile.layout?.header === 'with-photo') ? 'profile-photo' : null,
    },
    education, skills, workExperiences, projects, certificates, summaries,
    createdAt: importedAt, updatedAt: importedAt,
  });

  const profiles = bundle.profiles.map((legacy) => {
    const locale = legacy.meta.lang === 'en' ? 'en' as const : 'zh-CN' as const;
    const localeKey = locale === 'en' ? 'en' : 'zh-CN';
    const local = (primary: string | undefined, secondary?: string): LocalizedText => {
      const result = localized(localeKey === 'zh-CN' ? primary : secondary, localeKey === 'en' ? primary : secondary);
      return result ?? (locale === 'en' ? { en: primary ?? legacy.meta.name } : { 'zh-CN': primary ?? legacy.meta.name });
    };
    const skillIds = allOrSelection(legacy.include.skills, library.skills.map((item) => item.id));
    const workIds = allOrSelection(legacy.include.work, library.workExperiences.map((item) => item.id));
    const projectIds = allOrSelection(legacy.include.projects, library.projects.map((item) => item.id));
    const certificateIds = allOrSelection(legacy.include.certificates, library.certificates.map((item) => item.id));
    const summaryIds = allOrSelection(legacy.include.summary, library.summaries.map((item) => item.id));
    const workSelections = workIds.map((experienceId) => {
      const item = library.workExperiences.find((candidate) => candidate.id === experienceId);
      return { experienceId, bulletIds: legacy.include.workBullets?.[experienceId] ?? item?.bullets.map((bullet) => bullet.id) ?? [] };
    });
    const projectSelections = projectIds.map((projectId) => {
      const item = library.projects.find((candidate) => candidate.id === projectId);
      const override = getProjectOverride(legacy, projectId);
      return {
        projectId,
        presentationId: presentationIdFromDescriptionField(override?.descriptionField),
        highlightIds: legacy.include.projectHighlights?.[projectId] ?? item?.highlights.map((highlight) => highlight.id) ?? [],
      };
    });
    return ResumeProfileSchema.parse({
      id: legacy.meta.variant,
      version: 1,
      name: local(legacy.meta.name, legacy.meta.nameEn),
      targetRole: local(legacy.positioning),
      locale,
      templateId: 'classic-v1',
      positioning: local(legacy.positioning),
      output: {
        documentTitle: local(legacy.meta.title, legacy.meta.titleEn),
        description: legacy.meta.description ? local(legacy.meta.description) : null,
        onlineUrl: value(legacy.meta.onlineUrl) ?? null,
        pdfName: legacy.export?.pdfName ? local(legacy.export.pdfName) : null,
      },
      layout: { header: legacy.layout?.header ?? 'without-photo', pageSize: 'A4' },
      sectionOrder: legacy.sections,
      educationIds: library.education.map((item) => item.id),
      skillIds, workSelections, projectSelections, certificateIds, summaryIds,
      overrides: [],
      createdAt: importedAt, updatedAt: importedAt, archivedAt: null,
    });
  });

  if (findings.some((finding) => finding.severity === 'error')) {
    const fingerprint = createHash('sha256').update(JSON.stringify(findings)).digest('hex').slice(0, 12);
    throw new Error(`Legacy Resume import has blocking findings (${fingerprint})`);
  }

  return { library, profiles, findings };
}
