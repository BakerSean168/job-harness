import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDateTime } from '@/lib/format';

function joinOrDash(values: readonly string[]): string {
  return values.length ? values.join(' · ') : '—';
}

export async function ExecutorsWorkspace() {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const client = getJobHarnessClient();
  const [executors, attempts] = await Promise.all([
    client.apply.executors.list({ limit: 100, offset: 0 }),
    client.apply.attempts.list({ limit: 100, offset: 0 }),
  ]);
  const copy = messages.executorsWorkspace;
  const active = attempts.items.filter((attempt) => attempt.state === 'claimed' || attempt.state === 'running').length;
  const waiting = attempts.items.filter((attempt) => attempt.state === 'waiting_for_user').length;
  const uncertain = attempts.items.filter((attempt) => attempt.externalEffectState === 'uncertain').length;
  const ready = executors.items.filter((executor) => executor.status === 'ready').length;

  return (
    <div className="workspace-page management-page">
      <WorkspaceHeader title={messages.pages.executors.title} description={messages.pages.executors.description} />
      <div className="management-content executor-workspace-content">
        <section className="executor-summary-grid" aria-label={messages.pages.executors.title}>
          <div className="executor-summary-card"><span>{copy.summary.registered}</span><strong>{executors.total}</strong></div>
          <div className="executor-summary-card"><span>{copy.summary.ready}</span><strong>{ready}</strong></div>
          <div className="executor-summary-card"><span>{copy.summary.active}</span><strong>{active}</strong></div>
          <div className="executor-summary-card"><span>{copy.summary.waiting}</span><strong>{waiting}</strong></div>
          <div className="executor-summary-card"><span>{copy.summary.uncertain}</span><strong>{uncertain}</strong></div>
        </section>

        <section className="management-panel executor-panel">
          <div className="management-panel-heading"><h2>{copy.executors.title}</h2><span>{executors.total}</span></div>
          {executors.items.length ? (
            <div className="executor-card-grid">
              {executors.items.map((executor) => (
                <article className="executor-card" key={executor.executorId}>
                  <div className="executor-card-title">
                    <div><strong>{executor.name}</strong><code>{executor.executorId}</code></div>
                    <span className="executor-status-pill" data-status={executor.status}>{copy.executorStatuses[executor.status]}</span>
                  </div>
                  <dl>
                    <div><dt>{copy.executors.backends}</dt><dd>{joinOrDash(executor.browserBackends)}</dd></div>
                    <div><dt>{copy.executors.adapters}</dt><dd>{joinOrDash(executor.adapterIds)}</dd></div>
                    <div><dt>{copy.executors.modes}</dt><dd>{executor.executionModes.map((mode) => copy.modes[mode]).join(' · ')}</dd></div>
                    <div><dt>{copy.executors.concurrency}</dt><dd>{executor.maxConcurrency}</dd></div>
                    <div><dt>{copy.executors.heartbeat}</dt><dd>{formatDateTime(locale, executor.lastHeartbeatAt)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          ) : <p className="management-empty">{copy.executors.empty}</p>}
        </section>

        <section className="management-panel executor-panel">
          <div className="management-panel-heading"><h2>{copy.attempts.title}</h2><span>{attempts.total}</span></div>
          <div className="management-table-scroll">
            <table className="management-table executor-attempt-table">
              <thead><tr>
                <th>{copy.attempts.target}</th>
                <th>{copy.attempts.state}</th>
                <th>{copy.attempts.mode}</th>
                <th>{copy.attempts.executor}</th>
                <th>{copy.attempts.adapter}</th>
                <th>{copy.attempts.backend}</th>
                <th>{copy.attempts.checkpoint}</th>
                <th>{copy.attempts.effect}</th>
                <th>{copy.attempts.created}</th>
              </tr></thead>
              <tbody>{attempts.items.length ? attempts.items.map((attempt) => (
                <tr key={attempt.id}>
                  <td><div className="executor-target"><strong>{attempt.bundle.title}</strong><span>{attempt.bundle.company}{attempt.bundle.city ? ` · ${attempt.bundle.city}` : ''}</span></div></td>
                  <td><span className="executor-status-pill" data-status={attempt.state}>{copy.states[attempt.state]}</span></td>
                  <td>{copy.modes[attempt.executionMode]}</td>
                  <td><code>{attempt.executorId ?? '—'}</code></td>
                  <td>{attempt.adapterId ?? attempt.requiredAdapterId ?? '—'}</td>
                  <td>{attempt.browserBackend ?? attempt.preferredBrowserBackend ?? '—'}</td>
                  <td>{attempt.checkpoint ?? '—'}</td>
                  <td><span className="executor-effect" data-effect={attempt.externalEffectState}>{copy.effects[attempt.externalEffectState]}</span></td>
                  <td className="nowrap-cell">{formatDateTime(locale, attempt.createdAt)}</td>
                </tr>
              )) : <tr><td colSpan={9} className="table-empty">{copy.attempts.empty}</td></tr>}</tbody>
            </table>
          </div>
        </section>

        <p className="executor-boundary-note">{copy.note}</p>
      </div>
    </div>
  );
}
