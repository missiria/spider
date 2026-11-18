import { reasonHash, reasonIntent } from '../indexing/reasons';
import { evaluateIndexing, IndexingScanInput } from './indexing.rules';
import { DEFAULT_RULES } from './rules.config';

const SITE = 'https://www.iptv-ott-france.com/';
const r = (reason: string, pages: number) => ({
  reason,
  reason_hash: reasonHash(reason),
  pages,
  source: 'Website',
  intent: reasonIntent(reason),
});

function input(over: Partial<IndexingScanInput>): IndexingScanInput {
  return {
    site_url: SITE,
    imports: [],
    latestTotals: null,
    previousTotals: null,
    sitemapUrls: [],
    otherUrls: [],
    examples: new Map(),
    ...over,
  };
}

describe('evaluateIndexing', () => {
  it('raises a new likely-defect reason with evidence (the 404 example)', () => {
    const f = evaluateIndexing(
      input({
        imports: [
          {
            id: 2,
            report_date: '2026-11-13',
            reasons: [r('Not found (404)', 10), r('Page with redirect', 4)],
          },
          {
            id: 1,
            report_date: '2026-10-30',
            reasons: [r('Page with redirect', 4)],
          },
        ],
        examples: new Map([
          [
            reasonHash('Not found (404)'),
            {
              urls: ['https://www.iptv-ott-france.com/old/'],
              partial: false,
              report_date: '2026-11-13',
            },
          ],
        ]),
      }),
      DEFAULT_RULES,
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      rule: 'indexing_new_reason',
      subject: 'property',
      key_text: 'Not found (404)',
      confidence: 'high',
    });
    expect(f[0].evidence).toMatchObject({
      pages: 10,
      source: 'gsc_export',
      report_date: '2026-11-13',
      examples: ['https://www.iptv-ott-france.com/old/'],
    });
  });

  it('never reports intentional exclusions, even when they grow', () => {
    const f = evaluateIndexing(
      input({
        imports: [
          {
            id: 2,
            report_date: '2026-11-13',
            reasons: [
              r('Alternate page with proper canonical tag', 900),
              r("Excluded by 'noindex' tag", 50),
            ],
          },
          {
            id: 1,
            report_date: '2026-10-30',
            reasons: [r('Alternate page with proper canonical tag', 100)],
          },
        ],
      }),
      DEFAULT_RULES,
    );
    expect(f).toEqual([]);
  });

  it('flags a spike, a persistent issue and a drop of indexed pages', () => {
    const f = evaluateIndexing(
      input({
        imports: [
          {
            id: 3,
            report_date: '2026-11-13',
            reasons: [r('Server error (5xx)', 40)],
          },
          {
            id: 2,
            report_date: '2026-11-06',
            reasons: [r('Server error (5xx)', 20)],
          },
          {
            id: 1,
            report_date: '2026-10-30',
            reasons: [r('Server error (5xx)', 5)],
          },
        ],
        latestTotals: { date: '2026-11-13', indexed: 700, not_indexed: 300 },
        previousTotals: { date: '2026-11-06', indexed: 900, not_indexed: 100 },
      }),
      DEFAULT_RULES,
    );
    expect(f.map((x) => x.rule).sort()).toEqual([
      'indexed_drop',
      'indexing_persistent',
      'indexing_spike',
    ]);
  });

  it('treats an unknown reason as review: alert when new, no spike or persistence', () => {
    const f = evaluateIndexing(
      input({
        imports: [
          {
            id: 2,
            report_date: '2026-11-13',
            reasons: [r('Totally new Google reason', 80)],
          },
          { id: 1, report_date: '2026-11-06', reasons: [] },
        ],
      }),
      DEFAULT_RULES,
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      rule: 'indexing_new_reason',
      confidence: 'medium',
    });
  });

  it('groups sitemap URLs Google does not index by coverage state, one finding each', () => {
    const url = (path: string, state: string, verdict = 'NEUTRAL') => ({
      url: `${SITE}${path}`,
      coverage_state: state,
      inspected_at: new Date('2026-11-17'),
      verdict,
      sitemap: `${SITE}sitemap.xml`,
    });
    const f = evaluateIndexing(
      input({
        sitemapUrls: [
          ...Array.from({ length: 12 }, (_, i) =>
            url(`p-${i}/`, 'URL is unknown to Google'),
          ),
          url('gone/', 'Not found (404)', 'FAIL'),
        ],
      }),
      DEFAULT_RULES,
    );
    expect(f).toHaveLength(2);
    const unknown = f.find((x) =>
      x.key_text.endsWith('URL is unknown to Google'),
    )!;
    expect(unknown).toMatchObject({
      rule: 'submitted_not_indexed',
      subject: 'property',
      title: '12 sitemap URLs not indexed: URL is unknown to Google',
    });
    expect(unknown.evidence).toMatchObject({
      source: 'url_inspection_api',
      pages: 12,
      examples_partial: true,
    });
    expect((unknown.evidence.examples as string[]).length).toBe(10);
    const notFound = f.find((x) => x.key_text.endsWith('Not found (404)'))!;
    expect(notFound.title).toBe('1 sitemap URL not indexed: Not found (404)');
    expect(notFound.score).toBeGreaterThan(50);
    // a threshold above the group size silences it
    const cfg = JSON.parse(JSON.stringify(DEFAULT_RULES));
    cfg.submitted_not_indexed.min_urls = 5;
    expect(
      evaluateIndexing(
        input({ sitemapUrls: [url('gone/', 'Not found (404)', 'FAIL')] }),
        cfg,
      ),
    ).toEqual([]);
  });

  it('raises one finding per critical reason for pages outside the sitemap (MISS-0194)', () => {
    const other = (
      path: string,
      state: string | null,
      verdict = 'NEUTRAL',
    ) => ({
      url: `${SITE}${path}`,
      coverage_state: state,
      inspected_at: new Date('2026-11-17'),
      verdict,
    });
    const otherUrls = [
      ...Array.from({ length: 12 }, (_, i) =>
        other(`old-${i}/`, 'Not found (404)', 'FAIL'),
      ),
      other('thin/', 'Crawled - currently not indexed'),
      // intentional or unknown reasons outside the sitemap are not defects
      other('moved/', 'Page with redirect'),
      other('private/', 'Excluded by ‘noindex’ tag'),
      other('odd/', 'Some future Google reason'),
      other('none/', null),
    ];
    const f = evaluateIndexing(
      input({
        otherUrls,
        sitemapUrls: [
          {
            ...other('in-map/', 'Not found (404)', 'FAIL'),
            sitemap: `${SITE}sitemap.xml`,
          },
        ],
      }),
      DEFAULT_RULES,
    ).filter((x) => x.rule === 'not_indexed_reason');
    expect(f.map((x) => x.key_text).sort()).toEqual([
      'Crawled - currently not indexed',
      'Not found (404)',
    ]);
    const notFound = f.find((x) => x.key_text === 'Not found (404)')!;
    expect(notFound).toMatchObject({
      subject: 'property',
      title: '12 pages not indexed: Not found (404)',
    });
    expect(notFound.reason).toContain('1 sitemap URL has the same reason');
    expect(notFound.evidence).toMatchObject({
      source: 'url_inspection_api',
      scope: 'not_in_sitemap',
      pages: 12,
      sitemap_pages: 1,
      examples_partial: true,
    });
    expect((notFound.evidence.examples as string[]).length).toBe(10);
    const thin = f.find((x) => x.key_text.startsWith('Crawled'))!;
    expect(thin.title).toBe(
      '1 page not indexed: Crawled - currently not indexed',
    );
    expect(notFound.score).toBeGreaterThan(thin.score);

    // threshold and switch
    const cfg = JSON.parse(JSON.stringify(DEFAULT_RULES));
    cfg.not_indexed_reason.min_pages = 5;
    expect(
      evaluateIndexing(input({ otherUrls }), cfg).map((x) => x.key_text),
    ).toEqual(['Not found (404)']);
    cfg.not_indexed_reason.enabled = false;
    expect(evaluateIndexing(input({ otherUrls }), cfg)).toEqual([]);
  });

  it('respects disabled rules', () => {
    const cfg = JSON.parse(JSON.stringify(DEFAULT_RULES));
    cfg.indexing_new_reason.enabled = false;
    const f = evaluateIndexing(
      input({
        imports: [
          {
            id: 2,
            report_date: '2026-11-13',
            reasons: [r('Not found (404)', 10)],
          },
          { id: 1, report_date: '2026-10-30', reasons: [] },
        ],
      }),
      cfg,
    );
    expect(f).toEqual([]);
  });
});
