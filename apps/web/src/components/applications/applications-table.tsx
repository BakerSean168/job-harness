import Link from 'next/link';
import type { ApplicationBoardItem } from '@job-harness/contracts';
import type { Locale, MessageCatalog } from '@/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import { StatusBadge } from '@/components/jobs/status-badge';
import { applicationsHref, type ApplicationsSearchParams } from './query';

function stageAgeDays(now: string, enteredAt: string): number {
  return Math.max(0, Math.floor((new Date(now).getTime() - new Date(enteredAt).getTime()) / 86_400_000));
}

export function ApplicationsTable({
  items,
  params,
  selectedApplicationId,
  generatedAt,
  locale,
  messages,
}: {
  items: readonly ApplicationBoardItem[];
  params: ApplicationsSearchParams;
  selectedApplicationId?: string;
  generatedAt: string;
  locale: Locale;
  messages: MessageCatalog;
}) {
  const copy = messages.applicationsWorkspace;
  return (
    <div className="applications-table-scroll">
      <table className="applications-table">
        <thead>
          <tr>
            <th>{copy.table.opportunity}</th>
            <th>{copy.table.stage}</th>
            <th>{copy.table.appliedAt}</th>
            <th>{copy.table.resume}</th>
            <th>{copy.table.campaign}</th>
            <th>{copy.table.stageAge}</th>
            <th className="numeric-cell">{copy.table.submissions}</th>
            <th>{copy.table.updated}</th>
          </tr>
        </thead>
        <tbody>
          {items.length ? items.map((item) => {
            const href = applicationsHref(params, { application: item.application.id });
            const age = stageAgeDays(generatedAt, item.stageEnteredAt);
            return (
              <tr key={item.application.id} data-selected={selectedApplicationId === item.application.id ? 'true' : undefined}>
                <td className="application-opportunity-cell">
                  <Link href={href} scroll={false} className="opportunity-link">
                    <strong>{item.title}</strong>
                    <span>{item.companyName}{item.city ? ` · ${item.city}` : ''}</span>
                  </Link>
                </td>
                <td><StatusBadge value={item.application.currentStage} label={messages.jobsWorkspace.applicationStages[item.application.currentStage]} /></td>
                <td className="nowrap-cell">{formatDate(locale, item.application.appliedAt)}</td>
                <td className="resume-cell">{item.resume?.name ?? <span className="empty-value">—</span>}</td>
                <td className="resume-cell">{item.campaigns[0]?.name ?? <span className="empty-value">—</span>}</td>
                <td className="nowrap-cell">{age === 0 ? copy.board.today : `${age} ${copy.board.days}`}</td>
                <td className="numeric-cell">{item.submissionCount}</td>
                <td className="nowrap-cell muted-cell">{formatDateTime(locale, item.application.updatedAt)}</td>
              </tr>
            );
          }) : (
            <tr><td colSpan={8} className="table-empty">{copy.table.noResults}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
