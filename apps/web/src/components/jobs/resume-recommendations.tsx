import { randomUUID } from 'node:crypto';
import type { JobDetail, RecommendJobResumesOutput } from '@job-harness/contracts';
import type { MessageCatalog } from '@/i18n';
import { prepareRecommendedApplicationAction } from '@/app/jobs/actions';

export function ResumeRecommendations({
  jobId,
  listingId,
  recommendations,
  messages,
  sourceKind,
}: {
  jobId: string;
  listingId: string | null;
  recommendations: RecommendJobResumesOutput;
  messages: MessageCatalog;
  sourceKind: JobDetail['job']['listings'][number]['sourceKind'] | null;
}) {
  const copy = messages.jobsWorkspace.recommendation;
  if (!recommendations.items.length) return null;
  const formalFillSupported = sourceKind !== 'boss' && sourceKind !== 'email';
  const decisionNonce = randomUUID();
  return (
    <section className="detail-section resume-recommendations">
      <div className="section-title-row">
        <h3>{copy.title}</h3>
        <span>{copy.deterministic}</span>
      </div>
      <p className="muted-copy">{copy.hint}</p>
      <form action={prepareRecommendedApplicationAction}>
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="decisionNonce" value={decisionNonce} />
        {listingId ? <input type="hidden" name="listingId" value={listingId} /> : null}
        <div className="listing-list">
          {recommendations.items.map((item, index) => {
            const selected = item.profileId === recommendations.recommendedProfileId;
            return (
              <label className="listing-item resume-recommendation-item" key={item.profileId}>
                <input type="radio" name="preferredProfileId" value={item.profileId} defaultChecked={selected} />
                <div className="listing-item-main">
                  <strong>{item.profileName}{selected ? ` · ${copy.recommended}` : ''}</strong>
                  <span>{item.targetRole || item.profileId}</span>
                  <span>{copy.signals}: {item.positiveSignals.slice(0, 5).map((signal) => signal.keyword).join(' · ') || '—'}</span>
                  {item.riskSignals.length ? <span>{copy.risks}: {item.riskSignals.slice(0, 3).map((signal) => signal.keyword).join(' · ')}</span> : null}
                </div>
                <div className="listing-time"><strong>{item.score}/100</strong><br />{copy.decisions[item.decision]}</div>
                <span className="detail-meta-chip">{item.executable ? copy.frozenReady : copy.freezeOnPrepare}</span>
              </label>
            );
          })}
        </div>
        <p className="muted-copy">{copy.delta.replace('{delta}', String(recommendations.recommendationDelta))}</p>
        {formalFillSupported ? (
          <button className="filter-submit" type="submit">{copy.prepare}</button>
        ) : (
          <p className="executor-boundary-note">{sourceKind === 'boss' ? copy.bossOutreach : copy.emailExecutor}</p>
        )}
      </form>
    </section>
  );
}
