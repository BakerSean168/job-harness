import Link from 'next/link';
import type { MessageCatalog } from '@/i18n';
import { one, type WorkspaceSearchParams } from './query';

export function JobsFilters({
  mode,
  pathname,
  params,
  messages,
}: {
  mode: 'jobs' | 'inbox';
  pathname: string;
  params: WorkspaceSearchParams;
  messages: MessageCatalog;
}) {
  const copy = messages.jobsWorkspace;
  return (
    <form className="jobs-filter-bar" method="get" action={pathname}>
      <label className="filter-field filter-field-wide">
        <span>{copy.filters.title}</span>
        <input name="title" defaultValue={one(params.title) ?? ''} placeholder={copy.filters.title} />
      </label>
      <label className="filter-field">
        <span>{copy.filters.company}</span>
        <input name="company" defaultValue={one(params.company) ?? ''} placeholder={copy.filters.company} />
      </label>
      <label className="filter-field filter-field-city">
        <span>{copy.filters.city}</span>
        <input name="city" defaultValue={one(params.city) ?? ''} placeholder={copy.filters.city} />
      </label>
      {mode === 'jobs' ? (
        <label className="filter-field">
          <span>{copy.filters.state}</span>
          <select name="state" defaultValue={one(params.state) ?? ''}>
            <option value="">{copy.filters.any}</option>
            {Object.entries(copy.states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      ) : null}
      <label className="filter-field">
        <span>{copy.filters.source}</span>
        <select name="source" defaultValue={one(params.source) ?? ''}>
          <option value="">{copy.filters.any}</option>
          {Object.entries(copy.sourceKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="filter-field">
        <span>{copy.filters.applied}</span>
        <select name="applied" defaultValue={one(params.applied) ?? ''}>
          <option value="">{copy.filters.any}</option>
          <option value="yes">{copy.filters.yes}</option>
          <option value="no">{copy.filters.no}</option>
        </select>
      </label>
      <div className="filter-actions">
        <button className="filter-submit" type="submit">{copy.filters.apply}</button>
        <Link className="filter-reset" href={pathname}>{copy.filters.reset}</Link>
      </div>
    </form>
  );
}
