/**
 * Derived recruiting availability. Search discovery alone never establishes an open
 * application channel, and the absence of a listing never proves closure.
 */
export type ListingDeadline =
  | { readonly precision: 'date'; readonly date: string; readonly timeZone: string }
  | { readonly precision: 'datetime'; readonly at: string };

export interface ListingLifecycleEvidence {
  readonly status: 'active' | 'closed' | 'unknown';
  readonly applicationDeadline?: ListingDeadline | null;
  readonly lastVerifiedAt?: string | null;
  readonly lastVerifiedOpenAt?: string | null;
}

export type ListingApplyability = 'confirmed_open' | 'unverified' | 'deadline_passed' | 'closed' | 'conflict';

function dateInZone(at: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
  }).formatToParts(new Date(at));
  const value = (key: string) => parts.find((part) => part.type === key)?.value ?? '';
  return [value('year'), value('month'), value('day')].join('-');
}

export function deadlinePassed(deadline: ListingDeadline, at: string): boolean {
  if (deadline.precision === 'datetime') return Date.parse(at) > Date.parse(deadline.at);
  // A date without a time is inclusive until the end of that local calendar day.
  return dateInZone(at, deadline.timeZone) > deadline.date;
}

function openAfterDeadline(deadline: ListingDeadline, verifiedOpenAt: string | null | undefined): boolean {
  if (!verifiedOpenAt) return false;
  return deadline.precision === 'datetime'
    ? Date.parse(verifiedOpenAt) > Date.parse(deadline.at)
    : dateInZone(verifiedOpenAt, deadline.timeZone) > deadline.date;
}

function deadlineMatured(deadline: ListingDeadline, at: string, graceHours: number): boolean {
  if (!deadlinePassed(deadline, at)) return false;
  if (deadline.precision === 'datetime') {
    return Date.parse(at) - Date.parse(deadline.at) >= graceHours * 3_600_000;
  }
  const localDate = dateInZone(at, deadline.timeZone);
  // Conservatively require whole extra local dates: never archive at the opening
  // of the first day after an inclusive date-only deadline.
  const days = (Date.parse(localDate + 'T00:00:00Z') - Date.parse(deadline.date + 'T00:00:00Z')) / 86_400_000;
  return days > Math.ceil(graceHours / 24);
}

export function listingApplyability(
  listing: ListingLifecycleEvidence,
  at: string,
  freshOpenHours = 168,
): ListingApplyability {
  // A newer, explicit closure supersedes an earlier "open after deadline"
  // conflict. Do not keep a definitely closed listing perpetually unarchivable.
  if (listing.status === 'closed' && listing.lastVerifiedAt
    && (!listing.lastVerifiedOpenAt
      || Date.parse(listing.lastVerifiedAt) >= Date.parse(listing.lastVerifiedOpenAt))) {
    return 'closed';
  }
  const deadline = listing.applicationDeadline;
  if (deadline && deadlinePassed(deadline, at)) {
    return openAfterDeadline(deadline, listing.lastVerifiedOpenAt) ? 'conflict' : 'deadline_passed';
  }
  if (listing.status === 'closed') {
    return listing.lastVerifiedAt ? 'closed' : 'unverified';
  }
  if (listing.status === 'active' && listing.lastVerifiedOpenAt
    && Date.parse(listing.lastVerifiedOpenAt) <= Date.parse(at)
    && Date.parse(at) - Date.parse(listing.lastVerifiedOpenAt) <= freshOpenHours * 3_600_000) {
    return 'confirmed_open';
  }
  return 'unverified';
}

export interface OpportunityAvailability {
  readonly applyability: ListingApplyability;
  readonly archiveEligible: boolean;
  readonly archiveReason: 'verified_closed' | 'deadline_elapsed' | null;
}

export function assessOpportunityAvailability(
  listings: readonly ListingLifecycleEvidence[],
  at: string,
  graceHours = 48,
): OpportunityAvailability {
  if (listings.length === 0) return { applyability: 'unverified', archiveEligible: false, archiveReason: null };
  const verdicts = listings.map((listing) => listingApplyability(listing, at));
  const applyability: ListingApplyability =
    verdicts.includes('confirmed_open') ? 'confirmed_open'
      : verdicts.includes('conflict') ? 'conflict'
      : verdicts.includes('unverified') ? 'unverified'
      : verdicts.includes('deadline_passed') ? 'deadline_passed'
      : 'closed';
  const archiveEligible = listings.every((listing, index) => {
    const verdict = verdicts[index];
    if (verdict === 'deadline_passed') {
      return !!listing.applicationDeadline && deadlineMatured(listing.applicationDeadline, at, graceHours);
    }
    if (verdict === 'closed') {
      return !!listing.lastVerifiedAt && Date.parse(at) - Date.parse(listing.lastVerifiedAt) >= graceHours * 3_600_000;
    }
    return false;
  });
  return {
    applyability,
    archiveEligible,
    archiveReason: archiveEligible
      ? (verdicts.includes('deadline_passed') ? 'deadline_elapsed' : 'verified_closed')
      : null,
  };
}
