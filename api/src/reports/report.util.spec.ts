import { nextRunAt, parseRecipients, periodKey, toCsv } from './report.util';

describe('report.util', () => {
  it('builds CSV with BOM, quoting and formula guard', () => {
    const csv = toCsv(
      ['page', 'clicks', 'ctr'],
      [
        ['https://x/a,b', 10, 0.12345],
        ['=cmd()', 0, 0],
      ],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"https://x/a,b",10,0.1235');
    expect(csv).toContain(`'=cmd(),0,0`);
  });

  it('period keys: ISO week and month', () => {
    expect(periodKey('weekly', new Date('2026-10-15T08:00:00Z'))).toBe(
      '2026-W42',
    );
    expect(periodKey('weekly', new Date('2026-01-01T08:00:00Z'))).toBe(
      '2026-W01',
    );
    expect(periodKey('monthly', new Date('2026-10-15T08:00:00Z'))).toBe(
      '2026-10',
    );
  });

  it('weekly next run lands on the requested weekday after now', () => {
    const from = new Date(2026, 9, 15, 10, 0, 0); // Thu 15 Oct 2026 10:00 local
    const next = nextRunAt('weekly', 1, 7, from); // Monday 07:00
    expect(next.getDay()).toBe(1);
    expect(next.getHours()).toBe(7);
    expect(next > from).toBe(true);
    expect(next.getDate()).toBe(19);
    // same weekday later today → today
    const sameDay = nextRunAt('weekly', 4, 18, from);
    expect(sameDay.getDate()).toBe(15);
    expect(sameDay.getHours()).toBe(18);
  });

  it('monthly next run rolls into next month when the slot passed', () => {
    const from = new Date(2026, 9, 15, 10, 0, 0);
    expect(nextRunAt('monthly', 1, 7, from).toDateString()).toBe(
      new Date(2026, 10, 1, 7).toDateString(),
    );
    expect(nextRunAt('monthly', 20, 7, from).toDateString()).toBe(
      new Date(2026, 9, 20, 7).toDateString(),
    );
    expect(nextRunAt('monthly', 31, 7, from).getDate()).toBe(28);
  });

  it('parses recipients from arrays or strings, dedupes, drops junk', () => {
    expect(parseRecipients('A@x.com, b@y.org; nope a@x.com')).toEqual([
      'a@x.com',
      'b@y.org',
    ]);
    expect(parseRecipients(['c@z.io'])).toEqual(['c@z.io']);
    expect(parseRecipients(42)).toEqual([]);
  });
});
