/** Pure helpers for reports: CSV, schedule timing, period keys. Unit-tested. */
import { ScheduleFrequency } from './entities/report-schedule.entity';

/** RFC 4180-ish CSV with UTF-8 BOM so Excel opens it correctly. */
export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s =
      typeof v === 'number'
        ? Number.isInteger(v)
          ? String(v)
          : v.toFixed(4)
        : String(v);
    // formula injection guard for spreadsheet consumers
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return (
    '﻿' +
    [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') +
    '\r\n'
  );
}

/** ISO week key 2026-W42 (Monday-based) or month key 2026-10 for a date. */
export function periodKey(frequency: ScheduleFrequency, at: Date): string {
  const d = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  if (frequency === 'monthly') {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  // ISO 8601 week number
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Next run strictly after `from` for a weekly (day 1..7, Monday = 1) or monthly (day 1..28)
 * schedule at `hour` (0..23), in the server's local time.
 */
export function nextRunAt(
  frequency: ScheduleFrequency,
  day: number,
  hour: number,
  from: Date,
): Date {
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, 0, 0, 0);
  if (frequency === 'weekly') {
    const want = ((day - 1) % 7) + 1; // 1..7
    const current = candidate.getDay() || 7;
    let delta = want - current;
    if (delta < 0 || (delta === 0 && candidate <= from)) delta += 7;
    candidate.setDate(candidate.getDate() + delta);
    return candidate;
  }
  const dom = Math.min(28, Math.max(1, day));
  candidate.setDate(dom);
  if (candidate <= from) {
    candidate.setMonth(candidate.getMonth() + 1, dom);
  }
  return candidate;
}

export function parseRecipients(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,;\s]+/)
      : [];
  const emails = list
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return [...new Set(emails)].slice(0, 20);
}
