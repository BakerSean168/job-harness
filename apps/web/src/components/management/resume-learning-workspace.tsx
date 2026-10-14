import Link from 'next/link';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getMessages } from '@/i18n/server';
import {
  facetValues,
  filterSamples,
  resumeSamples,
  rulesForSection,
  writingGuide,
  type SampleFilter,
} from '@/lib/resume-learning';

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || undefined;
}

export async function ResumeLearningWorkspace({ searchParams }: { searchParams: SearchParams }) {
  const messages = await getMessages();
  const copy = messages.resumeLearning;
  const tab = one(searchParams.tab) === 'guide' ? 'guide' : 'samples';
  const filter: SampleFilter = {
    role: one(searchParams.role),
    year: one(searchParams.year),
    level: one(searchParams.level),
    language: one(searchParams.language),
    quality: one(searchParams.quality),
    q: one(searchParams.q),
  };
  const facets = facetValues(resumeSamples);
  const samples = filterSamples(resumeSamples, filter);
  const sourceById = new Map(writingGuide.sources.map((s) => [s.id, s]));

  return (
    <div className="workspace-page management-page resume-learning-page">
      <WorkspaceHeader
        title={copy.title}
        description={copy.description}
        actions={<Link className="filter-reset" href="/resumes">{copy.backToResumes}</Link>}
      />
      <nav className="resume-learning-tabs" aria-label={copy.title}>
        <Link href="/resumes/learn" data-selected={tab === 'samples' ? 'true' : undefined}>{copy.tabs.samples} <span>{resumeSamples.length}</span></Link>
        <Link href="/resumes/learn?tab=guide" data-selected={tab === 'guide' ? 'true' : undefined}>{copy.tabs.guide} <span>{writingGuide.rules.length}</span></Link>
      </nav>

      {tab === 'samples' ? (
        <>
          <form className="management-filter-bar resume-learning-filters" method="get" action="/resumes/learn">
            <label className="filter-field"><span>{copy.filters.role}</span>
              <select name="role" defaultValue={filter.role ?? ''}>
                <option value="">{copy.filters.all}</option>
                {facets.roles.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="filter-field"><span>{copy.filters.year}</span>
              <select name="year" defaultValue={filter.year ?? ''}>
                <option value="">{copy.filters.all}</option>
                {facets.years.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="filter-field"><span>{copy.filters.level}</span>
              <select name="level" defaultValue={filter.level ?? ''}>
                <option value="">{copy.filters.all}</option>
                {facets.levels.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="filter-field"><span>{copy.filters.language}</span>
              <select name="language" defaultValue={filter.language ?? ''}>
                <option value="">{copy.filters.all}</option>
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="filter-field"><span>{copy.filters.quality}</span>
              <select name="quality" defaultValue={filter.quality ?? ''}>
                <option value="">{copy.filters.all}</option>
                <option value="good">{copy.quality.good}</option>
                <option value="mixed">{copy.quality.mixed}</option>
                <option value="bad-example">{copy.quality['bad-example']}</option>
              </select>
            </label>
            <label className="filter-field"><span>{copy.filters.keyword}</span>
              <input type="search" name="q" defaultValue={filter.q ?? ''} placeholder={copy.filters.keywordPlaceholder} />
            </label>
            <button className="filter-submit" type="submit">{copy.filters.apply}</button>
            <Link className="filter-reset" href="/resumes/learn">{copy.filters.reset}</Link>
          </form>
          <p className="management-muted resume-learning-count">{copy.matched.replace('{count}', String(samples.length))}</p>
          <div className="resume-learning-samples">
            {samples.length === 0 ? <section className="management-panel"><p className="management-empty">{copy.empty}</p></section> : null}
            {samples.map((s) => (
              <article key={s.id} className="management-panel resume-sample-card" data-quality={s.quality}>
                <header>
                  <h2><a href={s.source_url} target="_blank" rel="noreferrer noopener">{s.title}</a></h2>
                  <span className="resume-sample-quality" data-quality={s.quality}>{copy.quality[s.quality]}</span>
                </header>
                <div className="resume-sample-meta">
                  <span title={s.date_note ?? undefined}>{s.resume_date ?? copy.unknownDate}</span>
                  {s.role_tags.map((t) => <span key={t} data-kind="role">{t}</span>)}
                  {s.level_tags.map((t) => <span key={t} data-kind="level">{t}</span>)}
                  {s.graduation_year ? <span>{copy.graduation.replace('{year}', String(s.graduation_year))}</span> : null}
                  <span>{s.language === 'zh' ? '中文' : 'English'}</span>
                  <span>{s.source_type}</span>
                  {s.outcome ? <span data-kind="outcome">{s.outcome}</span> : null}
                </div>
                <p className="resume-sample-role">{s.target_role} · {s.level}</p>
                <ul className="resume-sample-excerpts">
                  {s.excerpts.map((e, i) => (
                    <li key={i}><small>{e.section}</small><blockquote>{e.text}</blockquote></li>
                  ))}
                </ul>
                <p className="resume-sample-why"><strong>{copy.why}</strong>{s.why_good}</p>
                <div className="resume-sample-tags">{s.tags.map((t) => <span key={t}>#{t}</span>)}</div>
                {s.date_note ? <p className="management-muted">{copy.dateNote}{s.date_note}</p> : null}
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="resume-learning-guide">
          <p className="management-callout">{writingGuide.evidenceNote}</p>
          <nav className="resume-guide-toc">
            {writingGuide.sections.map((sec) => <a key={sec.id} href={`#guide-${sec.id}`}>{sec.title}</a>)}
            <a href="#guide-sources">{copy.sources}</a>
          </nav>
          {writingGuide.sections.map((sec) => (
            <section key={sec.id} id={`guide-${sec.id}`} className="management-panel resume-guide-section">
              <div className="management-panel-heading"><h2>{sec.title}</h2><span>{rulesForSection(writingGuide, sec.id).length}</span></div>
              <div className="resume-guide-body">
                <h3>{copy.rules}</h3>
                <ul className="resume-guide-rules">
                  {rulesForSection(writingGuide, sec.id).map((r) => (
                    <li key={r.id}>
                      <span className="resume-rule-strength" data-strength={r.strength}>{copy.strength[r.strength]}</span>
                      <span className="resume-rule-text">{r.rule}</span>
                      <span className="resume-rule-meta">
                        {r.id} · {copy.consensus[r.consensus]} ·{' '}
                        {r.sources.map((id, i) => {
                          const src = sourceById.get(id);
                          return <span key={id}>{i > 0 ? ' ' : ''}{src ? <a href={src.url} target="_blank" rel="noreferrer noopener" title={src.title}>{id}</a> : id}</span>;
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
                {sec.id === 'skills' ? (
                  <>
                    <h3>{copy.skillLevels}</h3>
                    <table className="resume-guide-table">
                      <thead><tr><th>{copy.levelWord}</th><th>{copy.levelMeaning}</th><th>{copy.levelDepth}</th></tr></thead>
                      <tbody>{writingGuide.skillLevels.map((l) => <tr key={l.word}><td>{l.word}</td><td>{l.meaning}</td><td>{l.depth}</td></tr>)}</tbody>
                    </table>
                  </>
                ) : null}
                {sec.id === 'projects' ? (
                  <>
                    <h3>{copy.verbs}</h3>
                    <table className="resume-guide-table">
                      <tbody>{writingGuide.verbs.map((v) => <tr key={v.group}><th>{v.group}</th><td>{v.words}</td></tr>)}</tbody>
                    </table>
                  </>
                ) : null}
                {sec.templates.length > 0 ? (
                  <>
                    <h3>{copy.templates}</h3>
                    {sec.templates.map((t, i) => <pre key={i} className="resume-guide-template">{t}</pre>)}
                  </>
                ) : null}
                {sec.examples.length > 0 ? (
                  <>
                    <h3>{copy.examples}</h3>
                    <table className="resume-guide-table resume-guide-examples">
                      <thead><tr><th>{copy.bad}</th><th>{copy.good}</th></tr></thead>
                      <tbody>{sec.examples.map((e, i) => (
                        <tr key={i}><td data-kind="bad">{e.bad}</td><td data-kind="good">{e.good}{e.why ? <small>{e.why}</small> : null}</td></tr>
                      ))}</tbody>
                    </table>
                  </>
                ) : null}
              </div>
            </section>
          ))}
          <section id="guide-sources" className="management-panel resume-guide-section">
            <div className="management-panel-heading"><h2>{copy.sources}</h2><span>{writingGuide.sources.length}</span></div>
            <ol className="resume-guide-sources">
              {writingGuide.sources.map((s) => (
                <li key={s.id}><strong>{s.id}</strong> <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> <small>{s.date} · {s.type}</small></li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
