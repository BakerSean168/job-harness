import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getLocale, getMessages } from '@/i18n/server';
import { getJobHarnessClient } from '@/lib/job-harness-client';
import { formatDateTime } from '@/lib/format';
import { authorizeSubmitAction, resumeExecutionAttemptAction, revokeSubmitAuthorizationAction } from '../actions';

export default async function ExecutorAttemptDetailPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const client = getJobHarnessClient();
  const [messages, locale, detail, reviews, authorizations] = await Promise.all([
    getMessages(),
    getLocale(),
    client.apply.attempts.get(attemptId),
    client.apply.attempts.listReviewSnapshots(attemptId, 20),
    client.apply.attempts.listSubmitAuthorizations(attemptId, 20),
  ]);
  if (!detail) notFound();

  const copy = messages.executorsWorkspace;
  const attempt = detail.attempt;
  const latestReview = reviews.items[0] ?? null;
  const now = Date.now();
  const activeAuthorization = authorizations.items.find((item) => item.status === 'active' && Date.parse(item.expiresAt) > now) ?? null;
  const canAuthorize = Boolean(
    latestReview?.summary.readyForSubmit
    && attempt.state === 'waiting_for_user'
    && attempt.externalEffectState === 'not_crossed'
    && !activeAuthorization,
  );
  const handoffIsLive = Boolean(attempt.browserSessionHandoff && Date.parse(attempt.browserSessionHandoff.expiresAt) > now);
  const canResumeAuthorized = Boolean(
    activeAuthorization
    && attempt.state === 'waiting_for_user'
    && attempt.externalEffectState === 'not_crossed'
    && handoffIsLive,
  );
  const humanEntryReasons = new Set([
    'application_entry_required',
    'login_required',
    'security_challenge',
    'application_form_not_detected',
    'authentication_surface_detected',
  ]);
  const canResumeHumanEntry = Boolean(
    attempt.state === 'waiting_for_user'
    && attempt.externalEffectState === 'not_crossed'
    && handoffIsLive
    && !latestReview
    && !activeAuthorization
    && attempt.errorCode
    && humanEntryReasons.has(attempt.errorCode),
  );
  const decisionNonce = randomUUID();

  return (
    <div className="workspace-page management-page">
      <WorkspaceHeader
        title={attempt.bundle.title}
        description={`${attempt.bundle.company}${attempt.bundle.city ? ` · ${attempt.bundle.city}` : ''}`}
        actions={<Link className="filter-reset" href="/executors">← {copy.detail.back}</Link>}
      />
      <div className="management-content executor-attempt-detail">
        <section className="management-panel executor-review-card">
          <h2>{copy.detail.overview}</h2>
          <div className="executor-detail-grid">
            <div><span>{copy.attempts.state}</span><strong>{copy.states[attempt.state]}</strong></div>
            <div><span>{copy.attempts.effect}</span><strong>{copy.effects[attempt.externalEffectState]}</strong></div>
            <div><span>{copy.attempts.mode}</span><strong>{copy.modes[attempt.executionMode]}</strong></div>
            <div><span>{copy.attempts.adapter}</span><code>{attempt.adapterId ?? attempt.requiredAdapterId ?? '—'}</code></div>
            <div><span>{copy.attempts.backend}</span><code>{attempt.browserBackend ?? attempt.preferredBrowserBackend ?? '—'}</code></div>
            <div><span>{copy.attempts.checkpoint}</span><code>{attempt.checkpoint ?? '—'}</code></div>
          </div>
          {attempt.bundle.resumeArtifact ? (
            <div className="executor-evidence-line">
              <strong>{copy.detail.resumeEvidence}</strong>
              <code>{attempt.bundle.resumeArtifact.id}</code>
              <span>SHA-256 {attempt.bundle.resumeArtifact.sha256.slice(0, 16)}… · {attempt.bundle.resumeArtifact.byteSize} B</span>
            </div>
          ) : <p className="muted-copy">{copy.detail.noResume}</p>}
          {attempt.browserSessionHandoff ? (
            <div className="executor-review-actions">
              <div>
                <strong>{copy.detail.handoff}</strong>
                <p className="muted-copy">{copy.attempts.handoffExpires}: {formatDateTime(locale, attempt.browserSessionHandoff.expiresAt)}</p>
              </div>
              {attempt.browserSessionHandoff.humanControlUrl ? <a className="filter-submit" href={attempt.browserSessionHandoff.humanControlUrl} target="_blank" rel="noreferrer">{copy.attempts.openBrowser}</a> : null}
            </div>
          ) : null}
        </section>

        {attempt.state === 'waiting_for_user' && !latestReview && attempt.errorCode && humanEntryReasons.has(attempt.errorCode) ? (
          <section className="management-panel executor-review-card executor-human-action-card">
            <h2>{copy.detail.humanAction}</h2>
            <p>{copy.detail.humanActionDescription}</p>
            <div className="executor-detail-grid">
              <div><span>{copy.detail.waitingReason}</span><code>{attempt.errorCode}</code></div>
              <div><span>{copy.attempts.checkpoint}</span><code>{attempt.checkpoint ?? '—'}</code></div>
            </div>
            {attempt.errorSummary ? <p className="muted-copy">{attempt.errorSummary}</p> : null}
            {!handoffIsLive && attempt.browserSessionHandoff ? <p className="executor-boundary-note">{copy.detail.handoffExpired}</p> : null}
            {canResumeHumanEntry ? (
              <form action={resumeExecutionAttemptAction}>
                <input type="hidden" name="attemptId" value={attempt.id} />
                <button className="filter-submit" type="submit">{copy.detail.continueAfterHuman}</button>
              </form>
            ) : null}
          </section>
        ) : null}

        <section className="management-panel executor-review-card">
          <h2>{copy.detail.review}</h2>
          {latestReview ? (
            <>
              <div className="executor-review-actions">
                <strong>{latestReview.summary.readyForSubmit ? copy.detail.reviewReady : copy.detail.reviewBlocked}</strong>
                <time>{formatDateTime(locale, latestReview.createdAt)}</time>
              </div>
              <div className="executor-detail-grid">
                <div><span>{copy.detail.formHash}</span><code title={latestReview.formStateHash}>{latestReview.formStateHash.slice(0, 16)}…</code></div>
                <div><span>{copy.detail.reviewHash}</span><code title={latestReview.reviewHash}>{latestReview.reviewHash.slice(0, 16)}…</code></div>
                <div><span>{copy.detail.fieldSummary}</span><strong>{latestReview.summary.filled}/{latestReview.summary.fieldCount}</strong></div>
                <div><span>Required pending</span><strong>{latestReview.summary.requiredPending}</strong></div>
                <div><span>Manual</span><strong>{latestReview.summary.manual}</strong></div>
                <div><span>Failed</span><strong>{latestReview.summary.failed}</strong></div>
              </div>
              {latestReview.summary.blockingIssueCodes.length ? <p className="muted-copy">{latestReview.summary.blockingIssueCodes.join(' · ')}</p> : null}
              <p className="executor-boundary-note">{copy.detail.oneTimeWarning}</p>
              {canAuthorize ? (
                <form action={authorizeSubmitAction}>
                  <input type="hidden" name="attemptId" value={attempt.id} />
                  <input type="hidden" name="reviewSnapshotId" value={latestReview.id} />
                  <input type="hidden" name="decisionNonce" value={decisionNonce} />
                  <button className="filter-submit" type="submit">{copy.detail.authorize}</button>
                </form>
              ) : null}
            </>
          ) : <p className="management-empty">{copy.detail.noReview}</p>}
        </section>

        <section className="management-panel executor-review-card">
          <h2>{copy.detail.authorizations}</h2>
          {authorizations.items.length ? authorizations.items.map((authorization) => (
            <div className="executor-authorization-row" key={authorization.id}>
              <div>
                <strong>{authorization.status}</strong>
                <p className="muted-copy">{copy.detail.authorizationExpires}: {formatDateTime(locale, authorization.expiresAt)}</p>
              </div>
              <code title={authorization.reviewHash}>{authorization.reviewHash.slice(0, 16)}…</code>
              {authorization.status === 'active' && attempt.externalEffectState === 'not_crossed' ? (
                <form action={revokeSubmitAuthorizationAction}>
                  <input type="hidden" name="attemptId" value={attempt.id} />
                  <input type="hidden" name="authorizationId" value={authorization.id} />
                  <button className="filter-reset" type="submit">{copy.detail.revoke}</button>
                </form>
              ) : null}
            </div>
          )) : <p className="management-empty">{copy.detail.noAuthorization}</p>}
          {canResumeAuthorized ? (
            <form action={resumeExecutionAttemptAction}>
              <input type="hidden" name="attemptId" value={attempt.id} />
              <button className="filter-submit" type="submit">{copy.detail.resumeAuthorized}</button>
            </form>
          ) : null}
        </section>

        <section className="management-panel executor-review-card">
          <h2>{copy.detail.events}</h2>
          {detail.events.length ? <ol className="executor-event-list">{detail.events.map((event) => (
            <li key={event.id}><code>#{event.sequence}</code><strong>{event.type}</strong><span>{event.checkpoint ?? '—'}</span><time>{formatDateTime(locale, event.occurredAt)}</time></li>
          ))}</ol> : <p className="management-empty">—</p>}
        </section>
      </div>
    </div>
  );
}
