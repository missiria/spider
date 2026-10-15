import {
  aggregate,
  daysBetween,
  delta,
  formatDelta,
  periodEndingOn,
  previousPeriod,
} from './metrics.math';

describe('metrics.math', () => {
  it('builds the 28-day window used on 2026-10-15', () => {
    const p = periodEndingOn('2026-10-12', 28);
    expect(p).toEqual({ start: '2026-09-15', end: '2026-10-12' });
    expect(daysBetween(p)).toBe(28);
  });

  it('previous period is the same length ending the day before', () => {
    const prev = previousPeriod({ start: '2026-09-15', end: '2026-10-12' });
    expect(prev).toEqual({ start: '2026-08-18', end: '2026-09-14' });
  });

  it('aggregates clicks, impressions, CTR and weighted position', () => {
    const totals = aggregate([
      { date: '2026-10-01', clicks: 10, impressions: 100, position: 5 },
      { date: '2026-10-02', clicks: 30, impressions: 300, position: 9 },
    ]);
    expect(totals.clicks).toBe(40);
    expect(totals.impressions).toBe(400);
    expect(totals.ctr).toBeCloseTo(0.1);
    // (5*100 + 9*300) / 400 = 8
    expect(totals.position).toBeCloseTo(8);
  });

  it('matches the fleet deltas posted on 2026-10-15', () => {
    expect(formatDelta(delta(545, 436))).toBe('+25%');
    expect(formatDelta(delta(461, 109))).toBe('+323%');
    expect(formatDelta(delta(238, 366))).toBe('-35%');
    expect(formatDelta(delta(237, 98))).toBe('+142%');
    expect(formatDelta(delta(144, 200))).toBe('-28%');
    expect(formatDelta(delta(17, 15))).toBe('+13%');
    expect(formatDelta(delta(6, 8))).toBe('-25%');
    expect(formatDelta(delta(779, 107))).toBe('+628%');
  });

  it('shows a dash when the previous period is empty', () => {
    expect(delta(5, 0)).toBeNull();
    expect(formatDelta(null)).toBe('—');
  });

  it('empty input aggregates to zeros, not NaN', () => {
    expect(aggregate([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });
});
