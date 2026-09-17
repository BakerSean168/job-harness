import { createHash } from 'node:crypto';
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
import type { ApplicantProfileRevision, ApplicationAnswerSetRevision } from '@job-harness/applicant-contracts';

type ApplicantValue = ApplicantResolvedValue['value'];
interface NativeFact { readonly entry: ApplicantFieldCatalogEntry; readonly value: ApplicantValue; readonly provenance: string; }

export interface ResumeRevisionApplicantDataReader { getRevision(revisionId: string): Promise<ResumeRevision | null>; }
export interface FrozenApplicantDataReader {
  getProfileRevision(revisionId: string): Promise<ApplicantProfileRevision | null>;
  getAnswerSetRevision(revisionId: string): Promise<ApplicationAnswerSetRevision | null>;
}

export function createResumeRevisionApplicantDataGrant(
  resumeStore: ResumeRevisionApplicantDataReader,
  applicantStore?: FrozenApplicantDataReader | null,
): ApplicantDataGrantPort {
  async function factsFor(attempt: ExecutionAttempt): Promise<{ version: string; facts: NativeFact[] }> {
    const facts = new Map<string, NativeFact>();
    const versions: string[] = [];

    const revisionId = attempt.bundle.resumeRevisionId;
    if (revisionId) {
      const revision = await resumeStore.getRevision(revisionId);
      if (!revision) throw new ApplyNotFoundError('ResumeRevision', revisionId);
      if (attempt.bundle.resumeProfileId && revision.profileId !== attempt.bundle.resumeProfileId) {
        throw new ApplyConflictError(`ResumeRevision '${revision.id}' does not belong to frozen Profile '${attempt.bundle.resumeProfileId}'`);
      }
      versions.push(`resume:${revision.id}:${revision.contentHash.toLowerCase()}`);
      for (const fact of factsFromResolvedResume(revision.resolvedDocumentSnapshot, revision.id)) facts.set(fact.entry.key, fact);
    }

    if (attempt.bundle.applicantProfileRevisionId) {
      if (!applicantStore) throw new ApplyNotReadyError('Applicant Profile store is unavailable');
      const profileRevision = await applicantStore.getProfileRevision(attempt.bundle.applicantProfileRevisionId);
      if (!profileRevision) throw new ApplyNotFoundError('ApplicantProfileRevision', attempt.bundle.applicantProfileRevisionId);
      if (attempt.bundle.applicantProfileHash && profileRevision.contentHash !== attempt.bundle.applicantProfileHash) {
        throw new ApplyConflictError(`ApplicantProfileRevision '${profileRevision.id}' hash no longer matches frozen ApplyBundle evidence`);
      }
      versions.push(`profile:${profileRevision.id}:${profileRevision.contentHash}`);
      for (const fact of factsFromApplicantProfile(profileRevision)) facts.set(fact.entry.key, fact);
    }

    if (attempt.bundle.answerSetRevisionId) {
      if (!applicantStore) throw new ApplyNotReadyError('Application AnswerSet store is unavailable');
      const answerRevision = await applicantStore.getAnswerSetRevision(attempt.bundle.answerSetRevisionId);
      if (!answerRevision) throw new ApplyNotFoundError('ApplicationAnswerSetRevision', attempt.bundle.answerSetRevisionId);
      if (attempt.bundle.answerSetHash && answerRevision.contentHash !== attempt.bundle.answerSetHash) {
        throw new ApplyConflictError(`ApplicationAnswerSetRevision '${answerRevision.id}' hash no longer matches frozen ApplyBundle evidence`);
      }
      versions.push(`answers:${answerRevision.id}:${answerRevision.contentHash}`);
      const host = attempt.bundle.listingUrl ? new URL(attempt.bundle.listingUrl).hostname.toLowerCase() : null;
      for (const fact of factsFromAnswerSet(answerRevision, host)) facts.set(fact.entry.key, fact);
    }

    if (!facts.size) throw new ApplyNotReadyError(`ExecutionAttempt '${attempt.id}' has no frozen applicant data`);
    const digest = createHash('sha256').update(versions.join('|')).digest('hex');
    return { version: `applicant-snapshot:${digest}`, facts: [...facts.values()] };
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
        const fact = byKey.get(key); if (!fact) return [];
        return [{ key: fact.entry.key, value: fact.value, valueType: fact.entry.valueType, sensitivity: fact.entry.sensitivity, provenance: fact.provenance, literal: true }];
      });
      return ResolvedApplicantValuesSchema.parse({ catalogVersion: version, values });
    },
  };
}

function entry(key: string, label: string, valueType: ApplicantValueType, sensitivity: ApplicantSensitivity, aliases: readonly string[], source: string, allowAiMapping = true): ApplicantFieldCatalogEntry {
  return ApplicantFieldCatalogSchema.shape.entries.element.parse({ key, label, valueType, sensitivity, aliases: [...aliases], allowAiMapping, requiresLiteral: true, source });
}
function fact(key: string, label: string, value: unknown, valueType: ApplicantValueType, sensitivity: ApplicantSensitivity, aliases: readonly string[], source: string, provenance: string, allowAiMapping = true): NativeFact | null {
  const normalized = normalizeApplicantValue(value, valueType); if (normalized == null || (Array.isArray(normalized) && normalized.length === 0)) return null;
  return { entry: entry(key, label, valueType, sensitivity, aliases, source, allowAiMapping), value: normalized, provenance };
}
function compactFacts(items: Array<NativeFact | null>): NativeFact[] { return items.filter((value): value is NativeFact => value != null); }

function factsFromApplicantProfile(revision: ApplicantProfileRevision): NativeFact[] {
  const p = revision.snapshot; const provenance = `applicant-profile-revision:${revision.id}`;
  const items: Array<NativeFact | null> = [
    fact('person.full_name', '姓名', p.displayName, 'text', 'personal', ['姓名','名字','name','full name'], 'job-harness-applicant-profile', provenance),
    fact('contact.phone', '电话', p.phone, 'phone', 'sensitive', ['电话','手机','手机号','phone','mobile'], 'job-harness-applicant-profile', provenance),
    fact('contact.email', '邮箱', p.email, 'email', 'sensitive', ['邮箱','电子邮箱','email','e-mail'], 'job-harness-applicant-profile', provenance),
    fact('contact.location', '所在地', p.location, 'text', 'personal', ['所在地','城市','location','current location'], 'job-harness-applicant-profile', provenance),
    fact('links.website', '个人主页', p.website, 'url', 'public', ['个人主页','个人网站','website','homepage','portfolio'], 'job-harness-applicant-profile', provenance),
    fact('links.github', 'GitHub', p.github, 'url', 'public', ['github','github主页','github地址'], 'job-harness-applicant-profile', provenance),
    fact('availability.start', '可到岗时间', p.availableFrom, 'text', 'personal', ['到岗时间','可到岗时间','available from','start date'], 'job-harness-applicant-profile', provenance),
    fact('career.preferences.target_roles', '目标岗位', p.targetRoles, 'multi_choice', 'personal', ['目标岗位','意向岗位','target roles','desired roles'], 'job-harness-applicant-profile', provenance),
    fact('career.preferences.target_cities', '目标城市', p.targetCities, 'multi_choice', 'personal', ['目标城市','意向城市','工作地点偏好','target cities','preferred locations'], 'job-harness-applicant-profile', provenance),
  ];
  p.education.forEach((education, index) => {
    const prefix = `education[${index}]`;
    items.push(
      fact(`${prefix}.school`, '学校', education.school, 'text', 'personal', ['学校','院校','毕业院校','university','school'], 'job-harness-applicant-profile', provenance),
      fact(`${prefix}.major`, '专业', education.major, 'text', 'personal', ['专业','所学专业','major'], 'job-harness-applicant-profile', provenance),
      fact(`${prefix}.degree`, '学历/学位', education.degree, 'text', 'personal', ['学历','学位','degree','education level'], 'job-harness-applicant-profile', provenance),
      fact(`${prefix}.department`, '学院（院系）', education.department, 'text', 'personal', ['学院','院系','department'], 'job-harness-applicant-profile', provenance),
      fact(`${prefix}.city`, '学校所在地', education.location, 'text', 'personal', ['学校所在地','教育地点','city','location'], 'job-harness-applicant-profile', provenance),
      fact(`${prefix}.start_date`, '教育开始时间', education.startMonth, 'text', 'personal', ['入学时间','教育开始时间','start date'], 'job-harness-applicant-profile', provenance),
      fact(`${prefix}.end_date`, '教育结束时间', education.endMonth, 'text', 'personal', ['毕业时间','教育结束时间','end date'], 'job-harness-applicant-profile', provenance),
    );
  });
  return compactFacts(items);
}

function factsFromAnswerSet(revision: ApplicationAnswerSetRevision, host: string | null): NativeFact[] {
  const provenance = `application-answer-set-revision:${revision.id}`;
  return revision.snapshot.entries.flatMap((answer) => {
    if (!answer.enabled) return [];
    if (answer.siteHost && (!host || answer.siteHost.toLowerCase() !== host)) return [];
    const mappedType: ApplicantValueType = answer.valueType;
    const mappedSensitivity: ApplicantSensitivity = answer.sensitivity;
    const result = fact(answer.key, answer.label, answer.value, mappedType, mappedSensitivity, answer.aliases, 'job-harness-answer-set', provenance, !['legal','protected'].includes(answer.sensitivity));
    return result ? [result] : [];
  });
}

function factsFromResolvedResume(resume: ResolvedResume, revisionId: string): NativeFact[] {
  const items: Array<NativeFact | null> = []; const provenance = `resume-revision:${revisionId}`;
  const add = (key: string, label: string, value: unknown, valueType: ApplicantValueType, sensitivity: ApplicantSensitivity, aliases: readonly string[], allowAiMapping = true) => items.push(fact(key,label,value,valueType,sensitivity,aliases,'job-harness-resume-revision',provenance,allowAiMapping));
  add('person.full_name','姓名',resume.basics.displayName,'text','personal',['姓名','名字','name','full name']);
  add('contact.phone','电话',resume.basics.contact.phone,'phone','sensitive',['电话','手机','手机号','phone','mobile']);
  add('contact.email','邮箱',resume.basics.contact.email,'email','sensitive',['邮箱','电子邮箱','email','e-mail']);
  add('contact.location','所在地',resume.basics.contact.location,'text','personal',['所在地','城市','location','current location']);
  add('links.website','个人主页',resume.basics.contact.website ?? resume.output.onlineUrl,'url','public',['个人主页','个人网站','website','homepage','portfolio']);
  add('links.github','GitHub',resume.basics.contact.github,'url','public',['github','github主页','github地址']);
  add('career.intentions[0].target_role','意向岗位',resume.positioning,'text','personal',['意向岗位','目标岗位','求职岗位','target role','desired position']);
  resume.education.forEach((e,index)=>{ const p=`education[${index}]`; add(`${p}.school`,'学校',e.institution,'text','personal',['学校','院校','毕业院校','university','school']); add(`${p}.major`,'专业',e.major,'text','personal',['专业','所学专业','major']); add(`${p}.department`,'学院（院系）',e.department,'text','personal',['学院','院系','department']); add(`${p}.degree`,'学历/学位',e.degree,'text','personal',['学历','学位','degree','education level']); add(`${p}.study_type`,'学习形式',e.studyType,'text','personal',['学习形式','学习方式','study type']); add(`${p}.city`,'学校所在地',e.location,'text','personal',['学校所在地','教育地点','city','location']); add(`${p}.start_date`,'教育开始时间',e.period.start,'text','personal',['入学时间','教育开始时间','start date']); add(`${p}.end_date`,'教育结束时间',e.period.end,'text','personal',['毕业时间','教育结束时间','end date']); add(`${p}.courses`,'专业课程',e.courseSummary,'multiline','personal',['专业课程','主修课程','courses']); });
  resume.workExperiences.forEach((w,index)=>{ const p=`work[${index}]`; add(`${p}.company`,'公司',w.company,'text','personal',['公司','公司名称','雇主','company','employer']); add(`${p}.title`,'职位',w.role,'text','personal',['职位','岗位','职位名称','job title','position']); add(`${p}.department`,'部门',w.department,'text','personal',['部门','department']); add(`${p}.location`,'工作地点',w.location,'text','personal',['工作地点','地点','location']); add(`${p}.start_date`,'工作开始时间',w.period.start,'text','personal',['工作开始时间','开始时间','start date']); add(`${p}.end_date`,'工作结束时间',w.period.end,'text','personal',['工作结束时间','结束时间','end date']); add(`${p}.description`,'工作内容',w.bullets.map((b)=>plainText(b.content)).filter(Boolean).join('\n'),'multiline','personal',['工作内容','工作描述','职责','description','responsibilities']); });
  resume.projects.forEach((p0,index)=>{ const p=`projects[${index}]`; add(`${p}.name`,'项目名称',p0.name,'text','personal',['项目名称','project name']); add(`${p}.role`,'项目职位',p0.role,'text','personal',['项目职位','项目角色','role']); add(`${p}.start_date`,'项目开始时间',p0.period.start,'text','personal',['项目开始时间','开始时间','start date']); add(`${p}.end_date`,'项目结束时间',p0.period.end,'text','personal',['项目结束时间','结束时间','end date']); add(`${p}.description`,'项目内容',plainText(p0.description),'multiline','personal',['项目内容','项目描述','project description']); add(`${p}.responsibility`,'本人职责',p0.highlights.map((i)=>plainText(i.detail)).filter(Boolean).join('\n'),'multiline','personal',['本人职责','项目职责','responsibility']); add(`${p}.url`,'项目链接',p0.links[0]?.url ?? null,'url','public',['项目链接','project url','project link']); add(`${p}.stack`,'技术栈',p0.stack,'text','public',['技术栈','technology stack','tech stack']); });
  resume.certificates.forEach((c,index)=>{ const p=`certificates[${index}]`; add(`${p}.name`,'证书名称',c.label,'text','personal',['证书名称','certificate']); add(`${p}.issuer`,'颁发机构',c.issuer,'text','personal',['颁发机构','issuer']); add(`${p}.issued_at`,'获得时间',c.issuedAt,'text','personal',['获得时间','颁发时间','issued at']); });
  resume.skills.forEach((s,index)=>add(`skills[${index}].content`,s.label ?? '技能',plainText(s.content),'multiline','public',['技能','专业技能','skills']));
  return compactFacts(items);
}

function normalizeApplicantValue(value: unknown, valueType: ApplicantValueType): ApplicantValue | null {
  if (value == null) return null; if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') { const normalized = valueType === 'multiline' ? plainText(value) : value.trim(); return normalized || null; }
  if (Array.isArray(value)) { const out: Array<string|number|boolean> = []; for (const item of value) { if (typeof item === 'string') { const text=valueType==='multiline'?plainText(item):item.trim(); if(text) out.push(text); } else if (typeof item === 'number'||typeof item === 'boolean') out.push(item); } return out.length?out:null; }
  return null;
}
function plainText(value: string): string { return value.replace(/<\s*br\s*\/?\s*>/gi,'\n').replace(/<\s*\/\s*(?:p|li|div|h[1-6])\s*>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim(); }
