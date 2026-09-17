import {
  ApplicantFieldCatalogSchema,
  ResolvedApplicantValuesSchema,
  type ApplicantFieldCatalogEntry,
  type ApplicantResolvedValue,
  type ApplicantSensitivity,
  type ApplicantValueType,
  type ExecutionAttempt,
} from '@job-harness/apply-contracts';
import { ApplyConflictError, ApplyNotFoundError, ApplyNotReadyError, type ApplicantDataGrantPort } from '@job-harness/apply-runtime';
import type { ResolvedResume, ResumeRevision } from '@job-harness/resume-contracts';

type ApplicantValue = ApplicantResolvedValue['value'];
interface NativeFact {
  readonly entry: ApplicantFieldCatalogEntry;
  readonly value: ApplicantValue;
  readonly provenance: string;
}

export interface ResumeRevisionApplicantDataReader {
  getRevision(revisionId: string): Promise<ResumeRevision | null>;
}

export function createResumeRevisionApplicantDataGrant(resumeStore: ResumeRevisionApplicantDataReader): ApplicantDataGrantPort {
  async function factsFor(attempt: ExecutionAttempt): Promise<{ version: string; facts: NativeFact[] }> {
    const revisionId = attempt.bundle.resumeRevisionId;
    if (!revisionId) throw new ApplyNotReadyError(`ExecutionAttempt '${attempt.id}' has no frozen Resume Revision for applicant data`);
    const revision = await resumeStore.getRevision(revisionId);
    if (!revision) throw new ApplyNotFoundError('ResumeRevision', revisionId);
    if (attempt.bundle.resumeProfileId && revision.profileId !== attempt.bundle.resumeProfileId) {
      throw new ApplyConflictError(`ResumeRevision '${revision.id}' does not belong to frozen Profile '${attempt.bundle.resumeProfileId}'`);
    }
    const version = `resume-revision:${revision.id}:${revision.contentHash.toLowerCase().slice(0, 24)}`;
    return { version, facts: factsFromResolvedResume(revision.resolvedDocumentSnapshot, revision.id) };
  }

  return {
    async catalog(attempt) {
      const { version, facts } = await factsFor(attempt);
      return ApplicantFieldCatalogSchema.parse({ version, entries: facts.map((fact) => fact.entry) });
    },
    async resolve(attempt, keys) {
      const { version, facts } = await factsFor(attempt);
      const byKey = new Map(facts.map((fact) => [fact.entry.key, fact]));
      const values = [...new Set(keys)].flatMap((key) => {
        const fact = byKey.get(key);
        if (!fact) return [];
        return [{
          key: fact.entry.key,
          value: fact.value,
          valueType: fact.entry.valueType,
          sensitivity: fact.entry.sensitivity,
          provenance: fact.provenance,
          literal: true,
        }];
      });
      return ResolvedApplicantValuesSchema.parse({ catalogVersion: version, values });
    },
  };
}

function factsFromResolvedResume(resume: ResolvedResume, revisionId: string): NativeFact[] {
  const facts: NativeFact[] = [];
  const provenance = `resume-revision:${revisionId}`;
  const add = (
    key: string,
    label: string,
    value: unknown,
    valueType: ApplicantValueType,
    sensitivity: ApplicantSensitivity,
    aliases: readonly string[],
    allowAiMapping = true,
  ) => {
    const normalized = normalizeApplicantValue(value, valueType);
    if (normalized == null || (Array.isArray(normalized) && normalized.length === 0)) return;
    facts.push({
      entry: ApplicantFieldCatalogSchema.shape.entries.element.parse({
        key,
        label,
        valueType,
        sensitivity,
        aliases: [...aliases],
        allowAiMapping,
        requiresLiteral: true,
        source: 'job-harness-resume-revision',
      }),
      value: normalized,
      provenance,
    });
  };

  add('person.full_name', '姓名', resume.basics.displayName, 'text', 'personal', ['姓名', '名字', 'name', 'full name']);
  add('contact.phone', '电话', resume.basics.contact.phone, 'phone', 'sensitive', ['电话', '手机', '手机号', 'phone', 'mobile']);
  add('contact.email', '邮箱', resume.basics.contact.email, 'email', 'sensitive', ['邮箱', '电子邮箱', 'email', 'e-mail']);
  add('contact.location', '所在地', resume.basics.contact.location, 'text', 'personal', ['所在地', '城市', 'location', 'current location']);
  add('links.website', '个人主页', resume.basics.contact.website ?? resume.output.onlineUrl, 'url', 'public', ['个人主页', '个人网站', 'website', 'homepage', 'portfolio']);
  add('links.github', 'GitHub', resume.basics.contact.github, 'url', 'public', ['github', 'github主页', 'github地址']);
  add('career.intentions[0].target_role', '意向岗位', resume.positioning, 'text', 'personal', ['意向岗位', '目标岗位', '求职岗位', 'target role', 'desired position']);

  resume.education.forEach((education, index) => {
    const prefix = `education[${index}]`;
    add(`${prefix}.school`, '学校', education.institution, 'text', 'personal', ['学校', '院校', '毕业院校', 'university', 'school']);
    add(`${prefix}.major`, '专业', education.major, 'text', 'personal', ['专业', '所学专业', 'major']);
    add(`${prefix}.department`, '学院（院系）', education.department, 'text', 'personal', ['学院', '院系', 'department']);
    add(`${prefix}.degree`, '学历/学位', education.degree, 'text', 'personal', ['学历', '学位', 'degree', 'education level']);
    add(`${prefix}.study_type`, '学习形式', education.studyType, 'text', 'personal', ['学习形式', '学习方式', 'study type']);
    add(`${prefix}.city`, '学校所在地', education.location, 'text', 'personal', ['学校所在地', '教育地点', 'city', 'location']);
    add(`${prefix}.start_date`, '教育开始时间', education.period.start, 'text', 'personal', ['入学时间', '教育开始时间', 'start date']);
    add(`${prefix}.end_date`, '教育结束时间', education.period.end, 'text', 'personal', ['毕业时间', '教育结束时间', 'end date']);
    add(`${prefix}.courses`, '专业课程', education.courseSummary, 'multiline', 'personal', ['专业课程', '主修课程', 'courses']);
  });

  resume.workExperiences.forEach((work, index) => {
    const prefix = `work[${index}]`;
    add(`${prefix}.company`, '公司', work.company, 'text', 'personal', ['公司', '公司名称', '雇主', 'company', 'employer']);
    add(`${prefix}.title`, '职位', work.role, 'text', 'personal', ['职位', '岗位', '职位名称', 'job title', 'position']);
    add(`${prefix}.department`, '部门', work.department, 'text', 'personal', ['部门', 'department']);
    add(`${prefix}.location`, '工作地点', work.location, 'text', 'personal', ['工作地点', '地点', 'location']);
    add(`${prefix}.start_date`, '工作开始时间', work.period.start, 'text', 'personal', ['工作开始时间', '开始时间', 'start date']);
    add(`${prefix}.end_date`, '工作结束时间', work.period.end, 'text', 'personal', ['工作结束时间', '结束时间', 'end date']);
    add(`${prefix}.description`, '工作内容', work.bullets.map((bullet) => plainText(bullet.content)).filter(Boolean).join('\n'), 'multiline', 'personal', ['工作内容', '工作描述', '职责', 'description', 'responsibilities']);
  });

  resume.projects.forEach((project, index) => {
    const prefix = `projects[${index}]`;
    add(`${prefix}.name`, '项目名称', project.name, 'text', 'personal', ['项目名称', 'project name']);
    add(`${prefix}.role`, '项目职位', project.role, 'text', 'personal', ['项目职位', '项目角色', 'role']);
    add(`${prefix}.start_date`, '项目开始时间', project.period.start, 'text', 'personal', ['项目开始时间', '开始时间', 'start date']);
    add(`${prefix}.end_date`, '项目结束时间', project.period.end, 'text', 'personal', ['项目结束时间', '结束时间', 'end date']);
    add(`${prefix}.description`, '项目内容', plainText(project.description), 'multiline', 'personal', ['项目内容', '项目描述', 'project description']);
    add(`${prefix}.responsibility`, '本人职责', project.highlights.map((item) => plainText(item.detail)).filter(Boolean).join('\n'), 'multiline', 'personal', ['本人职责', '项目职责', 'responsibility']);
    add(`${prefix}.url`, '项目链接', project.links[0]?.url ?? null, 'url', 'public', ['项目链接', 'project url', 'project link']);
    add(`${prefix}.stack`, '技术栈', project.stack, 'text', 'public', ['技术栈', 'technology stack', 'tech stack']);
  });

  resume.certificates.forEach((certificate, index) => {
    const prefix = `certificates[${index}]`;
    add(`${prefix}.name`, '证书名称', certificate.label, 'text', 'personal', ['证书名称', 'certificate']);
    add(`${prefix}.issuer`, '颁发机构', certificate.issuer, 'text', 'personal', ['颁发机构', 'issuer']);
    add(`${prefix}.issued_at`, '获得时间', certificate.issuedAt, 'text', 'personal', ['获得时间', '颁发时间', 'issued at']);
  });

  resume.skills.forEach((skill, index) => {
    add(`skills[${index}].content`, skill.label ?? '技能', plainText(skill.content), 'multiline', 'public', ['技能', '专业技能', 'skills']);
  });

  return facts;
}

function normalizeApplicantValue(value: unknown, valueType: ApplicantValueType): ApplicantValue | null {
  if (value == null) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = valueType === 'multiline' ? plainText(value) : value.trim();
    return normalized ? normalized : null;
  }
  if (Array.isArray(value)) {
    const normalized: Array<string | number | boolean> = [];
    for (const item of value) {
      if (typeof item === 'string') {
        const text = valueType === 'multiline' ? plainText(item) : item.trim();
        if (text) normalized.push(text);
      } else if (typeof item === 'number' || typeof item === 'boolean') {
        normalized.push(item);
      }
    }
    return normalized.length ? normalized : null;
  }
  return null;
}

function plainText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
