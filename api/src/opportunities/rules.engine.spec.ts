import { DEFAULT_RULES, mergeRules } from './rules.config';
import { evaluate, fingerprint, priorityFromScore, ScanInput } from './rules.engine';

const period = { start: '2026-09-15', end: '2026-10-12' };
const previous = { start: '2026-08-18', end: '2026-09-14' };
const t = (key: string, clicks: number, impressions: number, position: number) => ({ key, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });

const base = (over: Partial<ScanInput> = {}): ScanInput => ({
  period,
  previous,
  property: { current: { clicks: 100, impressions: 1000, ctr: 0.1, position: 8 }, previous: { clicks: 100, impressions: 1000, ctr: 0.1, position: 8 } },
  pages: { current: [], previous: [] },
  queries: { current: [], previous: [] },
  queryPages: [],
  ...over,
});

describe('rules engine', () => {
  it('flags the IPE homepage-style drop as a possible page drop, high confidence', () => {
    const f = evaluate(base({ pages: { current: [t('https://x/', 0, 0, 0)], previous: [t('https://x/', 364, 2600, 1.2)] } }), DEFAULT_RULES);
    const drop = f.find((x) => x.rule === 'clicks_drop' && x.subject === 'page');
    expect(drop).toBeDefined();
    expect(drop!.title).toMatch(/^Possible clicks drop: −100%/);
    expect(drop!.confidence).toBe('high');
    expect(priorityFromScore(drop!.score)).toBe('high');
  });

  it('does not flag small bases or small drops', () => {
    const f = evaluate(base({ pages: { current: [t('a', 10, 100, 5)], previous: [t('a', 15, 100, 5)] } }), DEFAULT_RULES);
    expect(f.filter((x) => x.rule === 'clicks_drop')).toHaveLength(0);
  });

  it('flags low CTR only in the top 10 with enough impressions', () => {
    const f = evaluate(base({ pages: { current: [t('p1', 1, 337, 9.5), t('p2', 1, 337, 14), t('p3', 0, 50, 3)], previous: [] } }), DEFAULT_RULES);
    expect(f.filter((x) => x.rule === 'low_ctr').map((x) => x.key_text)).toEqual(['p1']);
  });

  it('flags queries near page one', () => {
    const f = evaluate(base({ queries: { current: [t('iptv premium', 48, 449, 15.4), t('brand', 20, 60, 1.1)], previous: [] } }), DEFAULT_RULES);
    expect(f.filter((x) => x.rule === 'near_page_one').map((x) => x.key_text)).toEqual(['iptv premium']);
  });

  it('flags cannibalization when two pages each take 25% of a query', () => {
    const f = evaluate(
      base({
        queryPages: [
          { query: 'iptv premium', page: 'https://x/tarifs/', clicks: 30, impressions: 300, position: 6 },
          { query: 'iptv premium', page: 'https://x/', clicks: 10, impressions: 200, position: 9 },
          { query: 'iptv premium', page: 'https://x/blog/', clicks: 0, impressions: 20, position: 30 },
          { query: 'other', page: 'https://x/a/', clicks: 5, impressions: 500, position: 4 },
        ],
      }),
      DEFAULT_RULES,
    );
    const c = f.filter((x) => x.rule === 'cannibalization');
    expect(c).toHaveLength(1);
    expect((c[0].evidence.competing as unknown[]).length).toBe(2);
    expect(c[0].confidence).toBe('low');
    expect(c[0].title).toMatch(/^Possible cannibalization/);
  });

  it('fingerprints are stable per rule/property/subject/key', () => {
    const a = fingerprint(4, { rule: 'low_ctr', subject: 'page', key_text: 'https://x/' });
    expect(a).toBe(fingerprint(4, { rule: 'low_ctr', subject: 'page', key_text: 'https://x/' }));
    expect(a).not.toBe(fingerprint(5, { rule: 'low_ctr', subject: 'page', key_text: 'https://x/' }));
  });

  it('merges partial rule config over defaults and ignores junk', () => {
    const cfg = mergeRules({ window_days: 14, clicks_drop: { drop_ratio: 0.5, bogus: 1 }, low_ctr: { enabled: false }, nope: true });
    expect(cfg.window_days).toBe(14);
    expect(cfg.clicks_drop.drop_ratio).toBe(0.5);
    expect(cfg.clicks_drop.min_previous_clicks).toBe(20);
    expect(cfg.low_ctr.enabled).toBe(false);
    expect(mergeRules({ window_days: 999 }).window_days).toBe(28);
  });
});
