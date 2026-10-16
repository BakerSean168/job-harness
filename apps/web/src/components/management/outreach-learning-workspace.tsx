import Link from 'next/link';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getMessages } from '@/i18n/server';
import { resumeSamples, writingGuide } from '@/lib/resume-learning';
import { GREETING_PREVIEW_CHARS, charCount, greetingPreview, outreachGuide, outreachSamples } from '@/lib/outreach-learning';

export async function OutreachLearningWorkspace() {
  const messages = await getMessages();
  const copy = messages.resumeLearning;
  const oc = messages.outreachLearning;
  const sourceById = new Map(outreachGuide.sources.map((s) => [s.id, s]));

  return (
    <div className="workspace-page management-page resume-learning-page outreach-learning-page">
      <WorkspaceHeader
        title={oc.title}
        description={oc.description}
        actions={<Link className="filter-reset" href="/resumes">{copy.backToResumes}</Link>}
      />
      <nav className="resume-learning-tabs" aria-label={copy.title}>
        <Link href="/resumes/learn">{copy.tabs.samples} <span>{resumeSamples.length}</span></Link>
        <Link href="/resumes/learn?tab=guide">{copy.tabs.guide} <span>{writingGuide.rules.length}</span></Link>
        <Link href="/resumes/learn/outreach" data-selected="true">{copy.tabs.outreach} <span>{outreachGuide.sections.length}</span></Link>
      </nav>

      <div className="resume-learning-guide">
        <p className="management-callout">{oc.scope}{outreachGuide.scopeNote}</p>
        <nav className="resume-guide-toc">
          {outreachGuide.sections.map((sec) => <a key={sec.id} href={`#outreach-${sec.id}`}>{sec.title}</a>)}
          <a href="#outreach-samples">{oc.samples}</a>
          <a href="#outreach-sources">{copy.sources}</a>
        </nav>

        {outreachGuide.sections.map((sec) => (
          <section key={sec.id} id={`outreach-${sec.id}`} className="management-panel resume-guide-section">
            <div className="management-panel-heading"><h2>{sec.title}</h2><span>{sec.subtitle}</span></div>
            <div className="resume-guide-body">
              <h3>{oc.keyPoints}</h3>
              <dl className="outreach-facts">
                {sec.facts.map((f, i) => (
                  <div key={i}><dt>{f.label}</dt><dd>{f.text}</dd></div>
                ))}
              </dl>
              {sec.donts.length > 0 ? (
                <>
                  <h3>{oc.donts}</h3>
                  <ul className="resume-guide-rules">
                    {sec.donts.map((d, i) => (
                      <li key={i}><span className="resume-rule-strength" data-strength="avoid">{copy.strength.avoid}</span><span className="resume-rule-text">{d}</span></li>
                    ))}
                  </ul>
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
              <h3>{oc.checklist}</h3>
              <ul className="outreach-checklist">
                {sec.checklist.map((c, i) => <li key={i}><span aria-hidden="true">☐</span>{c}</li>)}
              </ul>
              {sec.sources.length > 0 ? (
                <p className="resume-rule-meta outreach-section-sources">
                  {copy.sources}：{sec.sources.map((id, i) => {
                    const s = sourceById.get(id);
                    return <span key={id}>{i > 0 ? ' · ' : ''}{s ? <a href={s.url} target="_blank" rel="noreferrer noopener" title={s.title}>{s.publisher}《{s.title}》</a> : id}</span>;
                  })}
                </p>
              ) : null}
            </div>
          </section>
        ))}

        <section id="outreach-samples" className="management-panel resume-guide-section">
          <div className="management-panel-heading"><h2>{oc.samples}</h2><span>{outreachSamples.length}</span></div>
          <div className="resume-guide-body">
            <p className="management-muted">{oc.samplesNote.replace('{chars}', String(GREETING_PREVIEW_CHARS))}</p>
            <div className="outreach-samples">
              {outreachSamples.map((s) => {
                const { head, rest } = greetingPreview(s.text);
                return (
                  <article key={s.id} className="outreach-sample">
                    <header>
                      <strong>{s.lane}</strong>
                      <span className="resume-sample-quality" data-quality="mixed">{s.status} · {s.version}</span>
                      <small>{oc.chars.replace('{count}', String(charCount(s.text)))}</small>
                    </header>
                    <blockquote><mark title={oc.previewHint}>{head}</mark>{rest}</blockquote>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="outreach-sources" className="management-panel resume-guide-section">
          <div className="management-panel-heading"><h2>{copy.sources}</h2><span>{outreachGuide.sources.length}</span></div>
          <ol className="resume-guide-sources">
            {outreachGuide.sources.map((s) => (
              <li key={s.id}><strong>{s.id}</strong> <a href={s.url} target="_blank" rel="noreferrer noopener">{s.publisher}《{s.title}》</a></li>
            ))}
          </ol>
          <p className="management-muted outreach-version">{oc.version.replace('{version}', outreachGuide.version)}</p>
        </section>
      </div>
    </div>
  );
}
