import { aggregateByKey, coverage } from './dimension.math';

describe('aggregateByKey', () => {
  it('sums per key across days with weighted position and recomputed CTR', () => {
    const out = aggregateByKey([
      { key_text: 'iptv test', clicks: 10, impressions: 100, position: 5 },
      { key_text: 'iptv test', clicks: 30, impressions: 300, position: 9 },
      { key_text: 'epg', clicks: 5, impressions: 1000, position: 7 },
    ]);
    expect(out[0]).toEqual({ key: 'iptv test', clicks: 40, impressions: 400, ctr: 0.1, position: 8 });
    expect(out[1].key).toBe('epg');
  });

  it('breaks ties by impressions then key', () => {
    const out = aggregateByKey([
      { key_text: 'b', clicks: 1, impressions: 10, position: 1 },
      { key_text: 'a', clicks: 1, impressions: 10, position: 1 },
      { key_text: 'c', clicks: 1, impressions: 20, position: 1 },
    ]);
    expect(out.map((r) => r.key)).toEqual(['c', 'a', 'b']);
  });
});

describe('coverage', () => {
  it('reports the share of clicks explained by dimension rows', () => {
    expect(coverage({ clicks: 180, impressions: 7000 }, { clicks: 237, impressions: 8741 }).clicks).toBeCloseTo(0.7595, 3);
    expect(coverage({ clicks: 0, impressions: 0 }, { clicks: 0, impressions: 0 })).toEqual({ clicks: null, impressions: null });
  });
});
