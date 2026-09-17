import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ApplicantFieldCatalogSchema,
  ResolvedApplicantValuesSchema,
  type ApplicantFieldCatalog,
  type ApplicantFieldCatalogEntry,
  type ApplicantFieldKey,
  type ApplicantResolvedValue,
  type ApplicantSensitivity,
  type ApplicantValueType,
  type ResolvedApplicantValues,
} from '@job-harness/apply-contracts';

export interface ApplicantDataProviderPort {
  catalog(): Promise<ApplicantFieldCatalog>;
  resolve(keys: readonly ApplicantFieldKey[]): Promise<ResolvedApplicantValues>;
}

type ApplicantValue = ApplicantResolvedValue['value'];

interface StoredApplicantFact {
  readonly entry: ApplicantFieldCatalogEntry;
  readonly value: ApplicantValue;
  readonly provenance: string;
}

export class InMemoryApplicantDataProvider implements ApplicantDataProviderPort {
  private readonly byKey: Map<string, StoredApplicantFact>;
  private readonly catalogValue: ApplicantFieldCatalog;

  constructor(version: string, facts: readonly StoredApplicantFact[]) {
    this.byKey = new Map(facts.map((fact) => [fact.entry.key, fact]));
    this.catalogValue = ApplicantFieldCatalogSchema.parse({ version, entries: facts.map((fact) => fact.entry) });
  }

  async catalog(): Promise<ApplicantFieldCatalog> { return this.catalogValue; }

  async resolve(keys: readonly ApplicantFieldKey[]): Promise<ResolvedApplicantValues> {
    const values = [...new Set(keys)].flatMap((key) => {
      const fact = this.byKey.get(key);
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
    return ResolvedApplicantValuesSchema.parse({ catalogVersion: this.catalogValue.version, values });
  }
}

export class LegacyProfileV2ApplicantDataProvider implements ApplicantDataProviderPort {
  private constructor(private readonly delegate: InMemoryApplicantDataProvider) {}

  static async fromBundleFile(path: string, profileId: string): Promise<LegacyProfileV2ApplicantDataProvider> {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    return LegacyProfileV2ApplicantDataProvider.fromBundle(raw, profileId);
  }

  static fromBundle(raw: unknown, profileId: string): LegacyProfileV2ApplicantDataProvider {
    if (!isRecord(raw) || !Array.isArray(raw.profiles)) throw new Error('Legacy profile bundle is invalid');
    const profile = raw.profiles.find((item) => isRecord(item) && item.id === profileId);
    if (!isRecord(profile)) throw new Error(`Legacy profile '${profileId}' was not found`);
    const profileV2 = profile.profileV2;
    if (!isRecord(profileV2)) throw new Error(`Legacy profile '${profileId}' has no Profile V2 payload`);
    const facts = collectLegacyFacts(profileV2, profileId);
    const fingerprint = createHash('sha256').update(stableJson(profileV2)).digest('hex').slice(0, 20);
    return new LegacyProfileV2ApplicantDataProvider(new InMemoryApplicantDataProvider(`legacy-profile-v2:${profileId}:${fingerprint}`, facts));
  }

  catalog(): Promise<ApplicantFieldCatalog> { return this.delegate.catalog(); }
  resolve(keys: readonly ApplicantFieldKey[]): Promise<ResolvedApplicantValues> { return this.delegate.resolve(keys); }
}

function collectLegacyFacts(profileV2: Record<string, unknown>, profileId: string): StoredApplicantFact[] {
  const sections = isRecord(profileV2.sections) ? profileV2.sections : {};
  const facts: StoredApplicantFact[] = [];
  const provenance = `legacy-profile-v2:${profileId}`;

  const add = (
    key: string,
    label: string,
    value: unknown,
    valueType: ApplicantValueType,
    sensitivity: ApplicantSensitivity,
    aliases: readonly string[],
    allowAiMapping = false,
  ) => {
    const normalized = normalizeValue(value);
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
        source: 'legacy-profile-v2-compat',
      }),
      value: normalized,
      provenance,
    });
  };

  const basic = sectionValues(sections.basic);
  add('person.full_name', '姓名', basic['姓名'], 'text', 'personal', ['姓名','名字','name','full name']);
  add('contact.phone', '电话', basic['电话'], 'phone', 'sensitive', ['电话','手机','手机号','phone','mobile']);
  add('contact.email', '邮箱', basic['邮箱'], 'email', 'sensitive', ['邮箱','电子邮箱','email','e-mail']);
  add('education.highest_degree', '最高学历', basic['最高学历'], 'text', 'personal', ['最高学历','highest degree'], true);
  add('education.highest_fulltime_degree', '最高全日制学历', basic['最高全日制学历'], 'text', 'personal', ['最高全日制学历','全日制学历'], true);

  const other = sectionValues(sections.other);
  add('links.github', 'GitHub', other['GitHub'], 'url', 'public', ['github','github主页','github地址'], true);
  add('links.website', '个人主页', other['个人主页'], 'url', 'public', ['个人主页','个人网站','website','homepage','portfolio'], true);

  for (const [index, item] of sectionItems(sections.intention).entries()) {
    const values = itemValues(item);
    add(`career.intentions[${index}].target_role`, '意向岗位', values['意向岗位'], 'text', 'personal', ['意向岗位','目标岗位','求职岗位','target role'], true);
  }
  for (const [index, item] of sectionItems(sections.education).entries()) {
    const values = itemValues(item);
    const prefix = `education[${index}]`;
    add(`${prefix}.school`, '学校', values['学校'], 'text', 'personal', ['学校','院校','毕业院校','university','school'], true);
    add(`${prefix}.major`, '专业', values['专业'], 'text', 'personal', ['专业','所学专业','major'], true);
    add(`${prefix}.department`, '学院（院系）', values['学院（院系）'], 'text', 'personal', ['学院','院系','department'], true);
    add(`${prefix}.degree`, '学历', values['学历'], 'text', 'personal', ['学历','degree','education level'], true);
    add(`${prefix}.degree_name`, '学位', values['学位'], 'text', 'personal', ['学位','学位名称','academic degree'], true);
    add(`${prefix}.city`, '城市', values['城市'], 'text', 'personal', ['城市','地点','city'], true);
    add(`${prefix}.start_date`, '教育开始时间', values['开始时间'], 'date', 'personal', ['入学时间','开始时间','start date'], true);
    add(`${prefix}.end_date`, '教育结束时间', values['结束时间'], 'date', 'personal', ['毕业时间','结束时间','end date'], true);
    add(`${prefix}.courses`, '专业课程', values['专业课程'], 'multiline', 'personal', ['专业课程','主修课程','courses'], true);
  }
  for (const [index, item] of sectionItems(sections.internship).entries()) {
    const values = itemValues(item);
    const prefix = `work[${index}]`;
    add(`${prefix}.company`, '公司', values['公司'], 'text', 'personal', ['公司','公司名称','雇主','company','employer'], true);
    add(`${prefix}.title`, '职位', values['职位'], 'text', 'personal', ['职位','岗位','职位名称','job title','position'], true);
    add(`${prefix}.department`, '部门', values['部门'], 'text', 'personal', ['部门','department'], true);
    add(`${prefix}.location`, '工作地点', values['地点'], 'text', 'personal', ['工作地点','地点','location'], true);
    add(`${prefix}.start_date`, '工作开始时间', values['开始时间'], 'date', 'personal', ['工作开始时间','开始时间','start date'], true);
    add(`${prefix}.end_date`, '工作结束时间', values['结束时间'], 'date', 'personal', ['工作结束时间','结束时间','end date'], true);
    add(`${prefix}.description`, '工作内容', values['工作内容'], 'multiline', 'personal', ['工作内容','工作描述','职责','description','responsibilities'], true);
  }
  for (const [index, item] of sectionItems(sections.project).entries()) {
    const values = itemValues(item);
    const prefix = `projects[${index}]`;
    add(`${prefix}.name`, '项目名称', values['项目名称'], 'text', 'personal', ['项目名称','project name'], true);
    add(`${prefix}.role`, '项目职位', values['职位'], 'text', 'personal', ['项目职位','项目角色','role'], true);
    add(`${prefix}.start_date`, '项目开始时间', values['开始时间'], 'date', 'personal', ['项目开始时间','开始时间','start date'], true);
    add(`${prefix}.end_date`, '项目结束时间', values['结束时间'], 'date', 'personal', ['项目结束时间','结束时间','end date'], true);
    add(`${prefix}.description`, '项目内容', values['项目内容'], 'multiline', 'personal', ['项目内容','项目描述','project description'], true);
    add(`${prefix}.responsibility`, '本人职责', values['本人职责'], 'multiline', 'personal', ['本人职责','项目职责','responsibility'], true);
    add(`${prefix}.url`, '项目链接', values['项目链接'], 'url', 'public', ['项目链接','project url','project link'], true);
  }
  for (const [index, item] of sectionItems(sections.language).entries()) {
    const values = itemValues(item);
    const prefix = `languages[${index}]`;
    add(`${prefix}.name`, '外语种类', values['外语种类'], 'text', 'personal', ['外语种类','语言','language'], true);
    add(`${prefix}.proficiency`, '掌握程度', values['掌握程度'], 'text', 'personal', ['掌握程度','熟练程度','proficiency'], true);
    add(`${prefix}.certificate`, '语言证书', values['证书名称（技能名称）'], 'text', 'personal', ['语言证书','证书名称','certificate'], true);
  }
  for (const [index, item] of sectionItems(sections.certificates).entries()) {
    const values = itemValues(item);
    add(`certificates[${index}].name`, '证书名称', values['证书名称'] ?? values['证书名称（技能名称）'], 'text', 'personal', ['证书名称','certificate'], true);
    add(`certificates[${index}].category`, '证书类别', values['证书类别'], 'text', 'personal', ['证书类别','certificate category'], true);
  }
  return facts;
}

function sectionValues(section: unknown): Record<string, unknown> {
  return isRecord(section) && isRecord(section.values) ? section.values : {};
}
function sectionItems(section: unknown): Record<string, unknown>[] {
  return isRecord(section) && Array.isArray(section.items) ? section.items.filter(isRecord) : [];
}
function itemValues(item: Record<string, unknown>): Record<string, unknown> { return isRecord(item.values) ? item.values : {}; }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function normalizeValue(value: unknown): ApplicantValue | null {
  if (typeof value === 'string') { const text = value.trim(); return text ? text : null; }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const values: Array<string | number | boolean> = [];
    for (const item of value) {
      if (typeof item === 'string') {
        const text = item.trim();
        if (text) values.push(text);
      } else if (typeof item === 'number' || typeof item === 'boolean') {
        values.push(item);
      }
    }
    return values.length ? values : null;
  }
  return null;
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
