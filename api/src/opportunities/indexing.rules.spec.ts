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

  it('lists sitemap URLs Google does not index, from URL Inspection', () => {
    const f = evaluateIndexing(
      input({
        sitemapUrls: [
          {
            url: `${SITE}pricing/`,
            coverage_state: 'URL is unknown to Google',
            inspected_at: new Date('2026-11-17'),
            verdict: 'NEUTRAL',
            sitemap: `${SITE}sitemap.xml`,
          },
        ],
      }),
      DEFAULT_RULES,
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      rule: 'submitted_not_indexed',
      subject: 'page',
      key_text: `${SITE}pricing/`,
    });
    expect(f[0].evidence).toMatchObject({ source: 'url_inspection_api' });
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
