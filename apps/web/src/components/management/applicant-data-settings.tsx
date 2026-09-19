'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  APPLICANT_FACT_SENSITIVITIES,
  APPLICANT_FACT_VALUE_TYPES,
  ApplicantFactSensitivitySchema,
  ApplicantFactValueTypeSchema,
  type ApplicantProfileContext,
  type ApplicationAnswerEntry,
  type ApplicationAnswerSetContext,
} from '@job-harness/applicant-contracts';
import type { MessageCatalog } from '@/i18n';
import {
  initialApplicantSettingsActionState,
  saveApplicantProfileAction,
  saveApplicationAnswerSetAction,
} from '@/app/settings/actions';

const split = (value: string) => [...new Set(value.split(/[\n,，;；]+/).map((item) => item.trim()).filter(Boolean))];
const displayValue = (value: ApplicationAnswerEntry['value']) => Array.isArray(value) ? value.join(', ') : String(value);

function parseAnswerValue(raw: string, type: ApplicationAnswerEntry['valueType']): ApplicationAnswerEntry['value'] {
  if (type === 'boolean') return raw === 'true';
  if (type === 'number') return Number(raw || '0');
  if (type === 'multi_choice') return split(raw);
  return raw;
}


function coerceAnswerValue(value: ApplicationAnswerEntry['value'], type: ApplicationAnswerEntry['valueType']): ApplicationAnswerEntry['value'] {
  if (type === 'boolean') return typeof value === 'boolean' ? value : false;
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (type === 'multi_choice') return Array.isArray(value) ? value : split(String(value));
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

function normalizeSiteHostDraft(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\.$/, '');
  return normalized || null;
}

export function ApplicantDataSettings({
  profileContext,
  answerSetContext,
  copy,
}: {
  profileContext: ApplicantProfileContext;
  answerSetContext: ApplicationAnswerSetContext;
  copy: MessageCatalog['settingsWorkspace']['applicant'];
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(profileContext.profile);
  const [answers, setAnswers] = useState<ApplicationAnswerEntry[]>([...answerSetContext.answerSet.entries]);
  const [profileResult, profileAction, profilePending] = useActionState(saveApplicantProfileAction, initialApplicantSettingsActionState);
  const [answerResult, answerAction, answerPending] = useActionState(saveApplicationAnswerSetAction, initialApplicantSettingsActionState);
  const profilePayload = useMemo(() => JSON.stringify({ ...profile, targetRoles: profile.targetRoles, targetCities: profile.targetCities }), [profile]);
  const answerPayload = useMemo(() => JSON.stringify({ ...answerSetContext.answerSet, entries: answers }), [answerSetContext.answerSet, answers]);
  useEffect(() => { setProfile(profileContext.profile); }, [profileContext.profile, profileContext.profile.version]);
  useEffect(() => { setAnswers([...answerSetContext.answerSet.entries]); }, [answerSetContext.answerSet, answerSetContext.answerSet.version]);
  useEffect(() => { if (profileResult.ok || answerResult.ok) router.refresh(); }, [profileResult.ok, answerResult.ok, router]);

  return (
    <>
      <section id="applicant-profile" className="settings-panel applicant-settings-panel">
        <div className="management-panel-heading"><h2>{copy.profileTitle}</h2><span>v{profile.version} · rev {profileContext.latestRevision.revisionNumber}</span></div>
        <form action={profileAction} className="campaign-editor-fields">
          <input type="hidden" name="expectedVersion" value={profile.version} />
          <input type="hidden" name="profileJson" value={profilePayload} />
          <p className="settings-note applicant-settings-note">{copy.profileDescription}</p>
          <div className="management-field-grid">
            <label className="management-field"><span>{copy.name}</span><input value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} /></label>
            <label className="management-field"><span>{copy.phone}</span><input value={profile.phone ?? ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value || null })} /></label>
            <label className="management-field"><span>{copy.email}</span><input type="email" value={profile.email ?? ''} onChange={(e) => setProfile({ ...profile, email: e.target.value || null })} /></label>
            <label className="management-field"><span>{copy.gender}</span><select value={profile.gender ?? ''} onChange={(e) => setProfile({ ...profile, gender: e.target.value === 'male' || e.target.value === 'female' ? e.target.value : null })}><option value="">{copy.unknown}</option><option value="male">{copy.genderMale}</option><option value="female">{copy.genderFemale}</option></select></label>
            <label className="management-field"><span>{copy.birthDate}</span><input type="date" value={profile.birthDate ?? ''} onChange={(e) => setProfile({ ...profile, birthDate: e.target.value || null })} /></label>
            <label className="management-field"><span>{copy.location}</span><input value={profile.location ?? ''} onChange={(e) => setProfile({ ...profile, location: e.target.value || null })} /></label>
            <label className="management-field"><span>{copy.jobSearchStatus}</span><select value={profile.jobSearchStatus ?? ''} onChange={(e) => setProfile({ ...profile, jobSearchStatus: ['actively_looking','open_to_opportunities','not_looking'].includes(e.target.value) ? e.target.value as typeof profile.jobSearchStatus : null })}><option value="">{copy.unknown}</option><option value="actively_looking">{copy.statusActivelyLooking}</option><option value="open_to_opportunities">{copy.statusOpen}</option><option value="not_looking">{copy.statusNotLooking}</option></select></label>
            <label className="management-field"><span>{copy.careerIdentity}</span><select value={profile.careerIdentity ?? ''} onChange={(e) => setProfile({ ...profile, careerIdentity: e.target.value === 'student' || e.target.value === 'new_graduate' || e.target.value === 'professional' ? e.target.value : null })}><option value="">{copy.unknown}</option><option value="student">{copy.careerIdentityStudent}</option><option value="new_graduate">{copy.careerIdentityNewGraduate}</option><option value="professional">{copy.careerIdentityProfessional}</option></select></label>
            <label className="management-field"><span>{copy.github}</span><input value={profile.github ?? ''} onChange={(e) => setProfile({ ...profile, github: e.target.value || null })} /></label>
            <label className="management-field"><span>{copy.website}</span><input value={profile.website ?? ''} onChange={(e) => setProfile({ ...profile, website: e.target.value || null })} /></label>
          </div>
          <div className="management-field-grid">
            <label className="management-field"><span>{copy.targetRoles}</span><textarea rows={2} value={profile.targetRoles.join(', ')} onChange={(e) => setProfile({ ...profile, targetRoles: split(e.target.value) })} /></label>
            <label className="management-field"><span>{copy.targetCities}</span><textarea rows={2} value={profile.targetCities.join(', ')} onChange={(e) => setProfile({ ...profile, targetCities: split(e.target.value) })} /></label>
          </div>
          <label className="management-field management-field-small"><span>{copy.availableFrom}</span><input value={profile.availableFrom ?? ''} onChange={(e) => setProfile({ ...profile, availableFrom: e.target.value || null })} /></label>

          <div className="applicant-subsection-heading"><strong>{copy.education}</strong><span>{profile.education.length}</span></div>
          {profile.education.map((education, index) => (
            <div className="applicant-education-card" key={education.id}>
              <div className="management-field-grid">
                <label className="management-field"><span>{copy.school}</span><input value={education.school} onChange={(e) => setProfile({ ...profile, education: profile.education.map((item, i) => i === index ? { ...item, school: e.target.value } : item) })} /></label>
                <label className="management-field"><span>{copy.institutionTag}</span><input value={education.institutionTag ?? ''} onChange={(e) => setProfile({ ...profile, education: profile.education.map((item, i) => i === index ? { ...item, institutionTag: e.target.value || null } : item) })} /></label>
                <label className="management-field"><span>{copy.major}</span><input value={education.major} onChange={(e) => setProfile({ ...profile, education: profile.education.map((item, i) => i === index ? { ...item, major: e.target.value } : item) })} /></label>
                <label className="management-field"><span>{copy.degree}</span><input value={education.degree ?? ''} onChange={(e) => setProfile({ ...profile, education: profile.education.map((item, i) => i === index ? { ...item, degree: e.target.value || null } : item) })} /></label>
                <label className="management-field"><span>{copy.department}</span><input value={education.department ?? ''} onChange={(e) => setProfile({ ...profile, education: profile.education.map((item, i) => i === index ? { ...item, department: e.target.value || null } : item) })} /></label>
                <label className="management-field"><span>{copy.educationLocation}</span><input value={education.location ?? ''} onChange={(e) => setProfile({ ...profile, education: profile.education.map((item, i) => i === index ? { ...item, location: e.target.value || null } : item) })} /></label>
                <label className="management-field"><span>{copy.period}</span><div className="applicant-inline-inputs"><input placeholder="YYYY-MM" value={education.startMonth ?? ''} onChange={(e) => setProfile({ ...profile, education: profile.education.map((item, i) => i === index ? { ...item, startMonth: e.target.value || null } : item) })} /><input placeholder="YYYY-MM" value={education.endMonth ?? ''} onChange={(e) => setProfile({ ...profile, education: profile.education.map((item, i) => i === index ? { ...item, endMonth: e.target.value || null } : item) })} /></div></label>
              </div>
            </div>
          ))}
          <div className="campaign-editor-footer">
            {profileResult.ok ? <span className="management-success">{copy.saved}</span> : profileResult.message ? <span className="management-error">{profileResult.message}</span> : <span />}
            <button className="filter-submit" type="submit" disabled={profilePending}>{profilePending ? copy.saving : copy.saveProfile}</button>
          </div>
        </form>
      </section>

      <section className="settings-panel applicant-settings-panel">
        <div className="management-panel-heading"><h2>{copy.answersTitle}</h2><span>v{answerSetContext.answerSet.version} · rev {answerSetContext.latestRevision.revisionNumber}</span></div>
        <form action={answerAction} className="campaign-editor-fields">
          <input type="hidden" name="expectedVersion" value={answerSetContext.answerSet.version} />
          <input type="hidden" name="answerSetJson" value={answerPayload} />
          <p className="settings-note applicant-settings-note">{copy.answersDescription}</p>
          {answers.length === 0 ? <p className="management-muted">{copy.noAnswers}</p> : null}
          {answers.map((answer, index) => (
            <div className="applicant-answer-card" key={answer.id}>
              <div className="management-field-grid">
                <label className="management-field"><span>{copy.answerLabel}</span><input value={answer.label} onChange={(e) => setAnswers(answers.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} /></label>
                <label className="management-field"><span>{copy.answerKey}</span><input value={answer.key} onChange={(e) => setAnswers(answers.map((item, i) => i === index ? { ...item, key: e.target.value } : item))} /></label>
                <label className="management-field"><span>{copy.answerType}</span><select value={answer.valueType} onChange={(e) => { const next = ApplicantFactValueTypeSchema.safeParse(e.target.value); if (next.success) setAnswers(answers.map((item, i) => i === index ? { ...item, valueType: next.data, value: coerceAnswerValue(item.value, next.data) } : item)); }}>{APPLICANT_FACT_VALUE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label className="management-field"><span>{copy.sensitivity}</span><select value={answer.sensitivity} onChange={(e) => { const next = ApplicantFactSensitivitySchema.safeParse(e.target.value); if (next.success) setAnswers(answers.map((item, i) => i === index ? { ...item, sensitivity: next.data } : item)); }}>{APPLICANT_FACT_SENSITIVITIES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              </div>
              <label className="management-field"><span>{copy.answerValue}</span>{answer.valueType === 'boolean' ? <select value={String(answer.value)} onChange={(e) => setAnswers(answers.map((item, i) => i === index ? { ...item, value: e.target.value === 'true' } : item))}><option value="true">true</option><option value="false">false</option></select> : <textarea rows={answer.valueType === 'multiline' ? 3 : 1} value={displayValue(answer.value)} onChange={(e) => setAnswers(answers.map((item, i) => i === index ? { ...item, value: parseAnswerValue(e.target.value, item.valueType) } : item))} />}</label>
              <div className="management-field-grid">
                <label className="management-field"><span>{copy.aliases}</span><input value={answer.aliases.join(', ')} onChange={(e) => setAnswers(answers.map((item, i) => i === index ? { ...item, aliases: split(e.target.value) } : item))} /></label>
                <label className="management-field"><span>{copy.siteHost}</span><input placeholder="example.com" value={answer.siteHost ?? ''} onChange={(e) => setAnswers(answers.map((item, i) => i === index ? { ...item, siteHost: e.target.value.toLowerCase() || null } : item))} onBlur={() => setAnswers((current) => current.map((item, i) => i === index ? { ...item, siteHost: normalizeSiteHostDraft(item.siteHost ?? '') } : item))} /></label>
              </div>
              <button className="action-button" type="button" onClick={() => setAnswers(answers.filter((_, i) => i !== index))}>{copy.removeAnswer}</button>
            </div>
          ))}
          <button className="action-button applicant-add-answer" type="button" onClick={() => setAnswers([...answers, { id: `answer-${crypto.randomUUID()}`, key: 'availability.notice_period', label: '新问题', valueType: 'text', sensitivity: 'personal', value: '', aliases: ['新问题'], siteHost: null, enabled: true }])}>{copy.addAnswer}</button>
          <p className="settings-note applicant-settings-note">{copy.sensitiveWarning}</p>
          <div className="campaign-editor-footer">
            {answerResult.ok ? <span className="management-success">{copy.saved}</span> : answerResult.message ? <span className="management-error">{answerResult.message}</span> : <span />}
            <button className="filter-submit" type="submit" disabled={answerPending}>{answerPending ? copy.saving : copy.saveAnswers}</button>
          </div>
        </form>
      </section>
    </>
  );
}
