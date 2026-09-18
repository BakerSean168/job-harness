import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { dispatchPreparedIntentAction } from '@/app/executors/actions';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDateTime } from '@/lib/format';

function joinOrDash(values: readonly string[]): string {
  return values.length ? values.join(' · ') : '—';
}

export async function ExecutorsWorkspace() {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const client = getJobHarnessClient();
  const [executors, attempts, prepared] = await Promise.all([
    client.apply.executors.list({ limit: 100, offset: 0 }),
    client.apply.attempts.list({ limit: 100, offset: 0 }),
    client.submissionIntents.list({ statuses: ['planned'], limit: 20, offset: 0, order: 'oldest' }),
  ]);
  const jobEntries = await Promise.all([...new Set(prepared.items.map((intent) => intent.jobId))].map(async (jobId) => [jobId, await client.workspace.getJobDetail(jobId)] as const));
  const jobs = new Map(jobEntries);
  const activeAttemptsByIntent = new Map(
    attempts.items
      .filter((attempt) => ['queued', 'claimed', 'running', 'waiting_for_user'].includes(attempt.state))
      .map((attempt) => [attempt.intentId, attempt] as const),
  );
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
          <div className="executor-summary-card"><span>{copy.summary.prepared}</span><strong>{prepared.total}</strong></div>
        </section>

        <section className="management-panel executor-panel">
          <div className="management-panel-heading"><h2>{copy.dispatch.title}</h2><span>{prepared.total}</span></div>
          {prepared.items.length ? (
            <div className="executor-card-grid">
              {prepared.items.map((intent) => {
                const detail = jobs.get(intent.jobId) ?? null;
                const listing = intent.listingId ? detail?.job.listings.find((candidate) => candidate.id === intent.listingId) ?? null : null;
                const targetUrl = intent.externalTargetUrl ?? listing?.url ?? null;
                const activeAttempt = activeAttemptsByIntent.get(intent.id) ?? null;
                const compatibleExecutors = executors.items.filter((executor) =>
                  executor.status === 'ready'
                  && (executor.executionModes.includes('fill_only') || executor.executionModes.includes('review_then_submit'))
                  && executor.capabilities.humanControl
                  && executor.capabilities.persistentSession
                  && executor.capabilities.resumeUpload);
                const compatibleBackends = [...new Set(compatibleExecutors.flatMap((executor) => executor.browserBackends))].sort();
                const supervisedSubmitAvailable = compatibleExecutors.some((executor) => executor.executionModes.includes('review_then_submit'));
                const hasFrozenResume = Boolean(intent.resumeRevisionId && intent.resumeArtifactId);
                const canDispatch = !activeAttempt && compatibleBackends.length > 0 && Boolean(targetUrl) && hasFrozenResume;
                const blockedReason = activeAttempt
                  ? copy.dispatch.alreadyDispatched
                  : compatibleBackends.length === 0
                    ? copy.dispatch.missingExecutor
                    : !targetUrl
                      ? copy.dispatch.missingTarget
                      : !hasFrozenResume
                        ? copy.dispatch.missingResume
                        : null;
                return (
                  <article className="executor-card executor-dispatch-card" key={intent.id}>
                    <div className="executor-card-title">
                      <div>
                        <strong>{detail?.job.title ?? intent.jobId}</strong>
                        <span className="muted-copy">{detail?.job.companyName ?? '—'}{detail?.job.city ? ` · ${detail.job.city}` : ''}</span>
                        <code>{intent.id}</code>
                      </div>
                      <span className="executor-status-pill" data-status="queued">{copy.dispatch.prepared}</span>
                    </div>
                    <dl>
                      <div><dt>{copy.dispatch.target}</dt><dd>{targetUrl ? new URL(targetUrl).hostname : '—'}</dd></div>
                      <div><dt>{copy.dispatch.resume}</dt><dd>{intent.resumeRevisionId ? <code>{intent.resumeRevisionId}</code> : '—'}{intent.resumeArtifactId ? <small> · PDF</small> : null}</dd></div>
                      <div><dt>{copy.dispatch.created}</dt><dd>{formatDateTime(locale, intent.createdAt)}</dd></div>
                    </dl>
                    <p className="executor-boundary-note">{copy.dispatch.safeFillHint}</p>
                    <div className="executor-dispatch-actions">
                      {activeAttempt ? (
                        <Link className="filter-reset" href={`/executors/${activeAttempt.id}`}>{copy.dispatch.openAttempt}</Link>
                      ) : (
                        <Link className="filter-reset" href={`/jobs/${intent.jobId}`}>{copy.dispatch.openJob}</Link>
                      )}
                      <form action={dispatchPreparedIntentAction} className="executor-dispatch-form">
                        <input type="hidden" name="intentId" value={intent.id} />
                        <input type="hidden" name="decisionNonce" value={randomUUID()} />
                        {supervisedSubmitAvailable ? (
                          <label className="executor-backend-select">
                            <span>{copy.attempts.mode}</span>
                            <select name="executionMode" defaultValue="fill_only" disabled={!canDispatch}>
                              <option value="fill_only">{copy.modes.fill_only}</option>
                              <option value="review_then_submit">{copy.modes.review_then_submit}</option>
                            </select>
                          </label>
                        ) : <input type="hidden" name="executionMode" value="fill_only" />}
                        {compatibleBackends.length === 1 ? (
                          <input type="hidden" name="browserBackend" value={compatibleBackends[0]} />
                        ) : (
                          <label className="executor-backend-select">
                            <span>{copy.dispatch.backend}</span>
                            <select name="browserBackend" defaultValue={compatibleBackends.includes('extension') ? 'extension' : compatibleBackends[0]} disabled={!canDispatch}>
                              {compatibleBackends.map((backend) => <option key={backend} value={backend}>{backend === 'steel' ? copy.dispatch.backendSteel : backend === 'extension' ? copy.dispatch.backendExtension : backend}</option>)}
                            </select>
                          </label>
                        )}
                        <button className="filter-submit" type="submit" disabled={!canDispatch} title={blockedReason ?? undefined}>{copy.dispatch.safeFill}</button>
                      </form>
                    </div>
                    {blockedReason ? <p className="muted-copy">{blockedReason}</p> : null}
                  </article>
                );
              })}
            </div>
          ) : <p className="management-empty">{copy.dispatch.empty}</p>}
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
                  <td>
                    <div className="executor-checkpoint">
                      <a className="text-link" href={`/executors/${attempt.id}`}>{attempt.id.slice(0, 8)}…</a>
                      <span>{attempt.checkpoint ?? '—'}</span>
                      {attempt.browserSessionHandoff?.humanControlUrl ? (
                        <a className="text-link" href={attempt.browserSessionHandoff.humanControlUrl} target="_blank" rel="noreferrer">{copy.attempts.openBrowser}</a>
                      ) : null}
                      {attempt.browserSessionHandoff ? <small>{copy.attempts.handoffExpires}: {formatDateTime(locale, attempt.browserSessionHandoff.expiresAt)}</small> : null}
                    </div>
                  </td>
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
