/**
 * Pure metric helpers shared by the API (and mirrored in web/src/lib/metrics.ts).
 * Definitions: docs/PLAN-MVP-1.md §5.
 */

export interface Period {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
}

export interface MetricTotals {
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number; // impressions-weighted average, 0 when no impressions
}

export interface DailyPoint {
  date: string;
  clicks: number;
  impressions: number;
  position: number;
}

const DAY_MS = 86_400_000;

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return toIsoDate(new Date(d.getTime() + days * DAY_MS));
}

export function daysBetween(period: Period): number {
  const a = new Date(`${period.start}T00:00:00Z`).getTime();
  const b = new Date(`${period.end}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS) + 1;
}

/** Last `days` days ending on `end` (inclusive). */
export function periodEndingOn(end: string, days: number): Period {
  return { start: addDays(end, -(days - 1)), end };
}

/** Same length, ending the day before `period.start`. */
export function previousPeriod(period: Period): Period {
  const length = daysBetween(period);
  const end = addDays(period.start, -1);
  return { start: addDays(end, -(length - 1)), end };
}

/**
 * GSC data is final ~3 days late; the default "end" is today − 3 so the last
 * days of a window are never half-empty.
 */
export function defaultEndDate(today = new Date()): string {
  return addDays(toIsoDate(today), -3);
}

export function aggregate(rows: DailyPoint[]): MetricTotals {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    weightedPosition += r.position * r.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

/** Signed ratio (0.25 = +25 %); null when the previous value is 0. */
export function delta(current: number, previous: number): number | null {
  if (!previous) {
    return null;
  }
  return (current - previous) / previous;
}

export function formatDelta(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const pct = Math.round(value * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
