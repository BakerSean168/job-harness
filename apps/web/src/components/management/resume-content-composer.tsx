'use client';

import type { ResumeLibrary, ResumeProfile } from '@job-harness/resume-contracts';

export interface ResumeComposerCopy {
  title: string;
  selected: string;
  available: string;
  skills: string;
  work: string;
  projects: string;
  education: string;
  summaries: string;
  certificates: string;
  bullets: string;
  highlights: string;
  presentation: string;
  include: string;
  noItems: string;
  sectionOrder: string;
  moveUp: string;
  moveDown: string;
}

function localize(value: Record<string, string | undefined> | null | undefined, locale: ResumeProfile['locale']): string {
  if (!value) return '';
  return value[locale] ?? value['zh-CN'] ?? value.en ?? '';
}

function toggleOrdered(ids: readonly string[], id: string, order: readonly string[], checked: boolean): string[] {
  const next = new Set(ids);
  if (checked) next.add(id); else next.delete(id);
  return order.filter((candidate) => next.has(candidate));
}

function truncate(value: string, length = 96): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= length ? normalized : `${normalized.slice(0, length - 1)}…`;
}

export function ResumeContentComposer({
  library,
  profile,
  onChange,
  copy,
}: {
  library: ResumeLibrary;
  profile: ResumeProfile;
  onChange: (profile: ResumeProfile) => void;
  copy: ResumeComposerCopy;
}) {
  const locale = profile.locale;

  function setWorkIncluded(experienceId: string, checked: boolean) {
    const existing = profile.workSelections.find((item) => item.experienceId === experienceId);
    if (checked && !existing) {
      onChange({ ...profile, workSelections: [...profile.workSelections, { experienceId, bulletIds: [] }] });
      return;
    }
    if (!checked && existing) {
      onChange({ ...profile, workSelections: profile.workSelections.filter((item) => item.experienceId !== experienceId) });
    }
  }

  function setWorkBullet(experienceId: string, bulletId: string, checked: boolean) {
    const experience = library.workExperiences.find((item) => item.id === experienceId);
    if (!experience) return;
    const order = experience.bullets.map((item) => item.id);
    const existing = profile.workSelections.find((item) => item.experienceId === experienceId);
    const bulletIds = toggleOrdered(existing?.bulletIds ?? [], bulletId, order, checked);
    const next = existing
      ? profile.workSelections.map((item) => item.experienceId === experienceId ? { ...item, bulletIds } : item)
      : [...profile.workSelections, { experienceId, bulletIds }];
    onChange({ ...profile, workSelections: next });
  }

  function setProjectIncluded(projectId: string, checked: boolean) {
    const existing = profile.projectSelections.find((item) => item.projectId === projectId);
    const project = library.projects.find((item) => item.id === projectId);
    if (checked && !existing && project?.presentations[0]) {
      onChange({
        ...profile,
        projectSelections: [...profile.projectSelections, {
          projectId,
          presentationId: project.presentations[0].id,
          highlightIds: [],
        }],
      });
      return;
    }
    if (!checked && existing) {
      onChange({ ...profile, projectSelections: profile.projectSelections.filter((item) => item.projectId !== projectId) });
    }
  }

  function updateProject(projectId: string, updater: (current: ResumeProfile['projectSelections'][number]) => ResumeProfile['projectSelections'][number]) {
    onChange({
      ...profile,
      projectSelections: profile.projectSelections.map((item) => item.projectId === projectId ? updater(item) : item),
    });
  }

  function moveSection(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= profile.sectionOrder.length) return;
    const next = [...profile.sectionOrder];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ ...profile, sectionOrder: next });
  }

  const sectionLabels: Record<string, string> = {
    basics: 'Basics',
    education: copy.education,
    skills: copy.skills,
    work: copy.work,
    projects: copy.projects,
    certificates: copy.certificates,
    summary: copy.summaries,
  };

  return (
    <div className="resume-composer">
      <section className="resume-composer-section">
        <div className="resume-composer-heading">
          <div><strong>{copy.sectionOrder}</strong><span>{profile.sectionOrder.length}</span></div>
        </div>
        <div className="resume-section-order-list">
          {profile.sectionOrder.map((section, index) => (
            <div key={section} className="resume-section-order-item">
              <span>{index + 1}</span>
              <strong>{sectionLabels[section] ?? section}</strong>
              <div>
                <button type="button" disabled={index === 0} onClick={() => moveSection(index, -1)} aria-label={copy.moveUp}>↑</button>
                <button type="button" disabled={index === profile.sectionOrder.length - 1} onClick={() => moveSection(index, 1)} aria-label={copy.moveDown}>↓</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="resume-composer-section">
        <div className="resume-composer-heading">
          <div><strong>{copy.skills}</strong><span>{profile.skillIds.length} {copy.selected} / {library.skills.length} {copy.available}</span></div>
        </div>
        <div className="resume-choice-list">
          {library.skills.map((skill) => (
            <label key={skill.id} className="resume-choice-row">
              <input
                type="checkbox"
                checked={profile.skillIds.includes(skill.id)}
                onChange={(event) => onChange({
                  ...profile,
                  skillIds: toggleOrdered(profile.skillIds, skill.id, library.skills.map((item) => item.id), event.target.checked),
                })}
              />
              <span><strong>{localize(skill.label, locale) || skill.id}</strong><small>{truncate(localize(skill.content, locale), 130)}</small></span>
            </label>
          ))}
        </div>
      </section>

      <section className="resume-composer-section">
        <div className="resume-composer-heading"><div><strong>{copy.work}</strong><span>{profile.workSelections.length} {copy.selected} / {library.workExperiences.length} {copy.available}</span></div></div>
        {library.workExperiences.length ? library.workExperiences.map((experience) => {
          const selection = profile.workSelections.find((item) => item.experienceId === experience.id);
          return (
            <article key={experience.id} className="resume-composer-group" data-selected={selection ? 'true' : undefined}>
              <label className="resume-composer-group-title">
                <input type="checkbox" checked={Boolean(selection)} onChange={(event) => setWorkIncluded(experience.id, event.target.checked)} />
                <span><strong>{localize(experience.company, locale)}</strong><small>{localize(experience.role, locale)}</small></span>
                <em>{selection?.bulletIds.length ?? 0} / {experience.bullets.length}</em>
              </label>
              {selection ? (
                <div className="resume-choice-list nested">
                  {experience.bullets.map((bullet) => (
                    <label key={bullet.id} className="resume-choice-row compact">
                      <input type="checkbox" checked={selection.bulletIds.includes(bullet.id)} onChange={(event) => setWorkBullet(experience.id, bullet.id, event.target.checked)} />
                      <span><small>{localize(bullet.content, locale)}</small></span>
                    </label>
                  ))}
                </div>
              ) : null}
            </article>
          );
        }) : <p className="management-muted">{copy.noItems}</p>}
      </section>

      <section className="resume-composer-section">
        <div className="resume-composer-heading"><div><strong>{copy.projects}</strong><span>{profile.projectSelections.length} {copy.selected} / {library.projects.length} {copy.available}</span></div></div>
        {library.projects.length ? library.projects.map((project) => {
          const selection = profile.projectSelections.find((item) => item.projectId === project.id);
          return (
            <article key={project.id} className="resume-composer-group" data-selected={selection ? 'true' : undefined}>
              <label className="resume-composer-group-title">
                <input type="checkbox" checked={Boolean(selection)} onChange={(event) => setProjectIncluded(project.id, event.target.checked)} />
                <span><strong>{localize(project.name, locale)}</strong><small>{project.id}</small></span>
                <em>{selection?.highlightIds.length ?? 0} / {project.highlights.length}</em>
              </label>
              {selection ? (
                <div className="resume-project-composer-body">
                  <label className="resume-composer-select"><span>{copy.presentation}</span><select value={selection.presentationId} onChange={(event) => updateProject(project.id, (current) => ({ ...current, presentationId: event.target.value }))}>{project.presentations.map((presentation) => <option value={presentation.id} key={presentation.id}>{localize(presentation.name, locale) || presentation.id} · {truncate(localize(presentation.description, locale), 64)}</option>)}</select></label>
                  <div className="resume-choice-list nested">
                    {project.highlights.map((highlight) => (
                      <label key={highlight.id} className="resume-choice-row compact">
                        <input
                          type="checkbox"
                          checked={selection.highlightIds.includes(highlight.id)}
                          onChange={(event) => updateProject(project.id, (current) => ({
                            ...current,
                            highlightIds: toggleOrdered(current.highlightIds, highlight.id, project.highlights.map((item) => item.id), event.target.checked),
                          }))}
                        />
                        <span><strong>{localize(highlight.label, locale) || highlight.id}</strong><small>{localize(highlight.detail, locale)}</small></span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          );
        }) : <p className="management-muted">{copy.noItems}</p>}
      </section>

      <section className="resume-composer-section resume-composer-small-grid">
        <div>
          <div className="resume-composer-heading"><div><strong>{copy.education}</strong><span>{profile.educationIds.length} / {library.education.length}</span></div></div>
          <div className="resume-choice-list">
            {library.education.map((item) => <label key={item.id} className="resume-choice-row compact"><input type="checkbox" checked={profile.educationIds.includes(item.id)} onChange={(event) => onChange({ ...profile, educationIds: toggleOrdered(profile.educationIds, item.id, library.education.map((candidate) => candidate.id), event.target.checked) })} /><span><strong>{localize(item.institution, locale)}</strong><small>{localize(item.major, locale)}</small></span></label>)}
          </div>
        </div>
        <div>
          <div className="resume-composer-heading"><div><strong>{copy.certificates}</strong><span>{profile.certificateIds.length} / {library.certificates.length}</span></div></div>
          <div className="resume-choice-list">
            {library.certificates.map((item) => <label key={item.id} className="resume-choice-row compact"><input type="checkbox" checked={profile.certificateIds.includes(item.id)} onChange={(event) => onChange({ ...profile, certificateIds: toggleOrdered(profile.certificateIds, item.id, library.certificates.map((candidate) => candidate.id), event.target.checked) })} /><span><small>{localize(item.label, locale)}</small></span></label>)}
          </div>
        </div>
        <div>
          <div className="resume-composer-heading"><div><strong>{copy.summaries}</strong><span>{profile.summaryIds.length} / {library.summaries.length}</span></div></div>
          <div className="resume-choice-list">
            {library.summaries.map((item) => <label key={item.id} className="resume-choice-row compact"><input type="checkbox" checked={profile.summaryIds.includes(item.id)} onChange={(event) => onChange({ ...profile, summaryIds: toggleOrdered(profile.summaryIds, item.id, library.summaries.map((candidate) => candidate.id), event.target.checked) })} /><span><strong>{localize(item.label, locale) || item.id}</strong><small>{truncate(localize(item.detail, locale), 120)}</small></span></label>)}
          </div>
        </div>
      </section>
    </div>
  );
}
