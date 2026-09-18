import type { RecommendJobResumesOutput } from '@job-harness/contracts';
import type { MessageCatalog } from '@/i18n';
import { prepareRecommendedApplicationAction } from '@/app/jobs/actions';

export function ResumeRecommendations({
  jobId,
  listingId,
  recommendations,
  messages,
}: {
  jobId: string;
  listingId: string | null;
  recommendations: RecommendJobResumesOutput;
  messages: MessageCatalog;
}) {
  const copy = messages.jobsWorkspace.recommendation;
  if (!recommendations.items.length) return null;
  return (
    <section className="detail-section resume-recommendations">
      <div className="section-title-row">
        <h3>{copy.title}</h3>
        <span>{copy.deterministic}</span>
      </div>
      <p className="muted-copy">{copy.hint}</p>
      <form action={prepareRecommendedApplicationAction}>
        <input type="hidden" name="jobId" value={jobId} />
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
        <button className="filter-submit" type="submit">{copy.prepare}</button>
      </form>
    </section>
  );
}
