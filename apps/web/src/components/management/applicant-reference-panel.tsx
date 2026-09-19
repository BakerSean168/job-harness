'use client';

import { useMemo, useState } from 'react';
import type {
  ApplicantProfileContext,
  ApplicationAnswerSetContext,
} from '@job-harness/applicant-contracts';
import type { MessageCatalog } from '@/i18n';

interface ReferenceItem {
  readonly id: string;
  readonly category: 'profile' | 'job' | 'education' | 'answers';
  readonly label: string;
  readonly value: string;
  readonly searchText: string;
  readonly meta: string | null | undefined;
}

export function ApplicantReferencePanel({
  profileContext,
  answerSetContext,
  copy,
}: {
  profileContext: ApplicantProfileContext;
  answerSetContext: ApplicationAnswerSetContext;
  copy: MessageCatalog['settingsWorkspace']['applicantReference'];
}) {
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const items = useMemo(
    () => buildReferenceItems(profileContext, answerSetContext, copy),
    [profileContext, answerSetContext, copy],
  );
  const normalizedQuery = normalize(query);
  const filtered = normalizedQuery
    ? items.filter((item) => normalize(item.searchText).includes(normalizedQuery))
    : items;
  const categories = [
    ['profile', copy.categories.profile],
    ['job', copy.categories.job],
    ['education', copy.categories.education],
    ['answers', copy.categories.answers],
  ] as const;

  async function copyText(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1400);
  }

  return (
    <section id="applicant-reference" className="settings-panel applicant-reference-panel">
      <div className="management-panel-heading">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <span>{filtered.length}/{items.length}</span>
      </div>
      <div className="applicant-reference-toolbar">
        <label className="management-field">
          <span>{copy.search}</span>
          <input
            type="search"
            value={query}
            placeholder={copy.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          className="action-button"
          type="button"
          disabled={!filtered.length}
          onClick={() => void copyText('__all__', renderReferenceBlock(filtered))}
        >
          {copiedId === '__all__' ? copy.copied : copy.copyVisible}
        </button>
      </div>
      <p className="settings-note applicant-reference-note">{copy.privacyNote}</p>
      <div className="applicant-reference-groups">
        {categories.map(([category, title]) => {
          const group = filtered.filter((item) => item.category === category);
          if (!group.length) return null;
          const groupCopyId = 'category:' + category;
          return (
            <div className="applicant-reference-group" key={category}>
              <div className="applicant-reference-group-heading">
                <strong>{title}</strong>
                <button
                  className="action-button"
                  type="button"
                  onClick={() => void copyText(groupCopyId, renderReferenceBlock(group))}
                >
                  {copiedId === groupCopyId ? copy.copied : copy.copyCategory}
                </button>
              </div>
              <div className="applicant-reference-list">
                {group.map((item) => (
                  <div className="applicant-reference-row" key={item.id}>
                    <div className="applicant-reference-copy">
                      <span>{item.label}</span>
                      {item.meta ? <small>{item.meta}</small> : null}
                      <strong title={item.value}>{item.value}</strong>
                    </div>
                    <button
                      className="action-button"
                      type="button"
                      aria-label={copy.copyValue + ' ' + item.label}
                      onClick={() => void copyText(item.id, item.value)}
                    >
                      {copiedId === item.id ? copy.copied : copy.copyValue}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {!filtered.length ? <p className="management-empty">{copy.empty}</p> : null}
      </div>
    </section>
  );
}

function buildReferenceItems(
  profileContext: ApplicantProfileContext,
  answerSetContext: ApplicationAnswerSetContext,
  copy: MessageCatalog['settingsWorkspace']['applicantReference'],
): ReferenceItem[] {
  const profile = profileContext.profile;
  const items: ReferenceItem[] = [];
  const push = (
    category: ReferenceItem['category'],
    id: string,
    label: string,
    value: unknown,
    meta?: string | null,
    extraSearch: readonly string[] = [],
  ) => {
    const rendered = renderLiteral(value);
    if (!rendered) return;
    items.push({
      id,
      category,
      label,
      value: rendered,
      meta,
      searchText: [label, rendered, meta ?? '', ...extraSearch].join(' '),
    });
  };

  push('profile', 'profile.name', copy.fields.name, profile.displayName);
  push('profile', 'profile.phone', copy.fields.phone, profile.phone);
  push('profile', 'profile.email', copy.fields.email, profile.email);
  push('profile', 'profile.gender', copy.fields.gender, profile.gender === 'male' ? copy.values.male : profile.gender === 'female' ? copy.values.female : null);
  push('profile', 'profile.birthDate', copy.fields.birthDate, profile.birthDate);
  push('profile', 'profile.location', copy.fields.location, profile.location);
  push('profile', 'profile.careerIdentity', copy.fields.careerIdentity, translateCareerIdentity(profile.careerIdentity, copy));
  push('profile', 'profile.jobSearchStatus', copy.fields.jobSearchStatus, translateJobSearchStatus(profile.jobSearchStatus, copy));
  push('profile', 'profile.github', copy.fields.github, profile.github);
  push('profile', 'profile.website', copy.fields.website, profile.website);
  push('profile', 'profile.notes', copy.fields.notes, profile.notes);

  push('job', 'job.roles', copy.fields.targetRoles, profile.targetRoles);
  push('job', 'job.cities', copy.fields.targetCities, profile.targetCities);
  push('job', 'job.availableFrom', copy.fields.availableFrom, profile.availableFrom);

  profile.education.forEach((education, index) => {
    const prefix = copy.educationPrefix + (index + 1);
    push('education', 'education.' + index + '.school', copy.fields.school, education.school, prefix);
    push('education', 'education.' + index + '.institutionTag', copy.fields.institutionTag, education.institutionTag, prefix);
    push('education', 'education.' + index + '.degree', copy.fields.degree, education.degree, prefix);
    push('education', 'education.' + index + '.major', copy.fields.major, education.major, prefix);
    push(
      'education',
      'education.' + index + '.admissionType',
      copy.fields.admissionType,
      education.admissionType === 'unified' ? copy.values.unified : education.admissionType === 'non_unified' ? copy.values.nonUnified : null,
      prefix,
    );
    push('education', 'education.' + index + '.department', copy.fields.department, education.department, prefix);
    push('education', 'education.' + index + '.location', copy.fields.educationLocation, education.location, prefix);
    push(
      'education',
      'education.' + index + '.period',
      copy.fields.period,
      [education.startMonth, education.endMonth].filter(Boolean).join(' ~ '),
      prefix,
    );
  });

  answerSetContext.answerSet.entries
    .filter((entry) => entry.enabled)
    .forEach((entry) => {
      push(
        'answers',
        'answer.' + entry.id,
        entry.label,
        entry.value,
        entry.siteHost ? copy.siteScope + ': ' + entry.siteHost : copy.globalScope,
        [entry.key, ...entry.aliases],
      );
    });

  return items;
}

function renderReferenceBlock(items: readonly ReferenceItem[]): string {
  return items.map((item) => item.label + '：' + item.value).join('\n');
}

function renderLiteral(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join('、');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function translateCareerIdentity(
  value: ApplicantProfileContext['profile']['careerIdentity'],
  copy: MessageCatalog['settingsWorkspace']['applicantReference'],
): string | null {
  if (value === 'student') return copy.values.student;
  if (value === 'new_graduate') return copy.values.newGraduate;
  if (value === 'professional') return copy.values.professional;
  return null;
}

function translateJobSearchStatus(
  value: ApplicantProfileContext['profile']['jobSearchStatus'],
  copy: MessageCatalog['settingsWorkspace']['applicantReference'],
): string | null {
  if (value === 'actively_looking') return copy.values.activelyLooking;
  if (value === 'open_to_opportunities') return copy.values.open;
  if (value === 'not_looking') return copy.values.notLooking;
  return null;
}
