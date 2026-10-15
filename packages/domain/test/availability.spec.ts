import { describe, expect, it } from 'vitest';
import { assessOpportunityAvailability, deadlinePassed, listingApplyability } from '../src';

const dateDeadline = {
  precision: 'date' as const,
  date: '2026-10-30',
  timeZone: 'Asia/Shanghai',
};
const instantDeadline = { precision: 'datetime' as const, at: '2026-10-30T18:00:00+08:00' };

describe('recruiting lifecycle availability', () => {
  it('treats a date-only deadline as inclusive in its published time zone', () => {
    expect(deadlinePassed(dateDeadline, '2026-10-30T15:59:59.000Z')).toBe(false);
    expect(deadlinePassed(dateDeadline, '2026-10-30T16:00:00.000Z')).toBe(true);
    expect(deadlinePassed(instantDeadline, '2026-10-30T09:59:59.000Z')).toBe(false);
    expect(deadlinePassed(instantDeadline, '2026-10-30T10:00:01.000Z')).toBe(true);
  });

  it('does not treat an unverified search result as confirmed open', () => {
    expect(listingApplyability({ status: 'active' }, '2026-10-20T00:00:00Z')).toBe('unverified');
  });

  it('recognizes an explicit deadline without inventing an employer closure', () => {
    const result = assessOpportunityAvailability(
      [{ status: 'active', applicationDeadline: dateDeadline }],
      '2026-10-31T00:00:00Z',
    );
    expect(result).toMatchObject({ applyability: 'deadline_passed', archiveEligible: false });
  });

  it('archives only after the conservative grace period; blocks a verified extension conflict', () => {
    expect(assessOpportunityAvailability(
      [{ status: 'active', applicationDeadline: dateDeadline }],
      '2026-11-02T00:00:00Z',
    )).toMatchObject({ archiveEligible: true, archiveReason: 'deadline_elapsed' });
    expect(assessOpportunityAvailability(
      [{ status: 'active', applicationDeadline: dateDeadline, lastVerifiedOpenAt: '2026-11-01T02:00:00Z' }],
      '2026-11-02T00:00:00Z',
    )).toMatchObject({ applyability: 'conflict', archiveEligible: false });
  });

  it('lets newer verified closure override an old deadline-extension conflict', () => {
    expect(listingApplyability({
      status: 'closed', applicationDeadline: dateDeadline,
      lastVerifiedOpenAt: '2026-11-01T00:00:00Z',
      lastVerifiedAt: '2026-11-02T00:00:00Z',
    }, '2026-11-06T00:00:00Z')).toBe('closed');
    expect(assessOpportunityAvailability([{
      status: 'closed', applicationDeadline: dateDeadline,
      lastVerifiedOpenAt: '2026-11-01T00:00:00Z',
      lastVerifiedAt: '2026-11-02T00:00:00Z',
    }], '2026-11-06T00:00:00Z')).toMatchObject({
      archiveEligible: true, archiveReason: 'verified_closed',
    });
  });

  it('does not archive when another platform remains unverified/open', () => {
    expect(assessOpportunityAvailability([
      { status: 'closed', lastVerifiedAt: '2026-10-25T00:00:00Z' },
      { status: 'active' },
    ], '2026-11-01T00:00:00Z').archiveEligible).toBe(false);
    expect(assessOpportunityAvailability([
      { status: 'closed', lastVerifiedAt: '2026-10-25T00:00:00Z' },
      { status: 'closed', lastVerifiedAt: '2026-10-24T00:00:00Z' },
    ], '2026-11-01T00:00:00Z').archiveEligible).toBe(true);
  });

  it('never closes a job only because its last verified open signal went stale', () => {
    expect(listingApplyability(
      { status: 'active', lastVerifiedOpenAt: '2026-09-01T00:00:00Z' },
      '2026-11-01T00:00:00Z',
    )).toBe('unverified');
  });
});
