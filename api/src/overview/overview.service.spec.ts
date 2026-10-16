import { BadRequestException } from '@nestjs/common';
import {
  resolveFilters,
  resolvePeriod,
  seriesFromRows,
} from './overview.service';
import { serializeConfig, MAX_CONFIG_BYTES } from '../views/views.controller';

describe('resolvePeriod', () => {
  it('accepts valid ranges and day counts', () => {
    expect(resolvePeriod({ start: '2026-02-01', end: '2026-02-28' })).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(resolvePeriod({ end: '2026-10-10', days: 7 })).toEqual({
      start: '2026-10-04',
      end: '2026-10-10',
    });
  });

  it.each([
    [{ end: '2026-99-99' }],
    [{ end: '2026-02-30' }],
    [{ start: '2026-13-01', end: '2026-12-01' }],
    [{ end: '20261010' }],
    [{ start: '2026-10-10', end: '2026-10-01' }],
    [{ start: '2024-01-01', end: '2026-10-01' }],
    [{ days: 0 }],
    [{ days: 1.5 }],
    [{ days: Number.NaN }],
    [{ days: 9999 }],
  ])('rejects %j with a 400', (q) => {
    expect(() => resolvePeriod(q)).toThrow(BadRequestException);
  });
});

describe('resolveFilters', () => {
  it('reduces filter state to one dimension', () => {
    expect(resolveFilters({})).toBeNull();
    expect(resolveFilters({ include_query: '^iptv' })).toMatchObject({
      dimension: 'query',
      include: '^iptv',
    });
    expect(resolveFilters({ country: 'FRA, esp' })).toEqual({
      dimension: 'country',
      keys: ['fra', 'esp'],
    });
    expect(resolveFilters({ device: 'mobile' })).toEqual({
      dimension: 'device',
      keys: ['MOBILE'],
    });
  });

  it('rejects cross-dimension combinations and bad values instead of applying them partially', () => {
    expect(() =>
      resolveFilters({ include_query: 'a', include_page: 'b' }),
    ).toThrow(/cannot be combined/);
    expect(() =>
      resolveFilters({ include_query: 'a', device: 'MOBILE' }),
    ).toThrow(BadRequestException);
    expect(() => resolveFilters({ country: 'FR' })).toThrow(/alpha-3/);
    expect(() => resolveFilters({ device: 'WATCH' })).toThrow(/one of/);
    expect(() => resolveFilters({ include_page: '(' })).toThrow(/invalid/);
  });
});

describe('seriesFromRows', () => {
  it('sums keys per date with impressions-weighted position', () => {
    expect(
      seriesFromRows([
        {
          key_text: 'a',
          date: '2026-10-02',
          clicks: 1,
          impressions: 10,
          position: 2,
        },
        {
          key_text: 'b',
          date: '2026-10-01',
          clicks: 2,
          impressions: 30,
          position: 4,
        },
        {
          key_text: 'c',
          date: '2026-10-02',
          clicks: 3,
          impressions: 30,
          position: 6,
        },
      ]),
    ).toEqual([
      {
        date: '2026-10-01',
        clicks: 2,
        impressions: 30,
        ctr: 2 / 30,
        position: 4,
      },
      { date: '2026-10-02', clicks: 4, impressions: 40, ctr: 0.1, position: 5 },
    ]);
  });
});

describe('serializeConfig', () => {
  it('round-trips valid configs without loss', () => {
    const cfg = { period: { days: 28 }, filters: { include_query: 'é€😀' } };
    expect(JSON.parse(serializeConfig(cfg))).toEqual(cfg);
  });

  it('rejects by UTF-8 bytes, not characters', () => {
    // 4-byte emoji: under the limit in characters, over it in bytes
    const big = { note: '😀'.repeat(Math.ceil(MAX_CONFIG_BYTES / 4) + 10) };
    expect(JSON.stringify(big).length).toBeLessThan(MAX_CONFIG_BYTES);
    expect(() => serializeConfig(big)).toThrow(BadRequestException);
  });
});
