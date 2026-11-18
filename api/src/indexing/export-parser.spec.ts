import {
  ExportParseError,
  parseIndexingExport,
  toIsoDate,
} from './export-parser';
import { parseCsv, readZip } from './file-readers';
import { isIndexedCoverage, reasonHash, reasonIntent } from './reasons';
import { zip } from '../testing/zip.helper-spec';

const OVERVIEW = {
  'Chart.csv':
    'Date,Not indexed,Indexed,Impressions\n2026-11-11,120,850,4100\n2026-11-12,124,848,3900\n2026-11-13,130,845,4000\n',
  'Critical issues.csv':
    'Reason,Source,Validation,Pages\n"Not found (404)",Website,Not Started,10\nAlternate page with proper canonical tag,Website,N/A,85\n"Crawled - currently not indexed",Google systems,Not Started,30\n"Brand new reason Google invented",Google systems,Not Started,5\n',
  'Non-critical issues.csv':
    'Reason,Source,Validation,Pages\n"Indexed, though blocked by robots.txt",Website,Not Started,2\n',
  'Metadata.csv':
    'Property,Value\nProperty,https://www.iptv-ott-france.com/\nSitemap filter,All known pages\n',
};

describe('file readers', () => {
  it('parses quoted CSV with commas, escaped quotes, CRLF and a BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('reads stored and deflated ZIP entries', () => {
    for (const method of [0, 8] as const) {
      const entries = readZip(
        zip({ 'a.csv': 'x,y\n1,2\n', 'dir/b.csv': 'z\n' }, method),
      );
      expect(entries.map((e) => e.name)).toEqual(['a.csv', 'b.csv']);
      expect(entries[0].data.toString()).toBe('x,y\n1,2\n');
    }
  });
});

describe('parseIndexingExport', () => {
  it('reads an overview export: every reason verbatim, totals, scope, report date', () => {
    const p = parseIndexingExport(zip(OVERVIEW), 'iof-coverage.zip');
    expect(p.kind).toBe('overview');
    expect(p.property).toBe('https://www.iptv-ott-france.com/');
    expect(p.scope).toBe('all_known');
    expect(p.report_date).toBe('2026-11-13');
    expect(p.reasons).toHaveLength(5);
    const nf = p.reasons.find((r) => r.reason === 'Not found (404)');
    expect(nf).toMatchObject({
      pages: 10,
      source: 'Website',
      validation: 'Not Started',
      group: 'not_indexed',
    });
    // unknown reason kept as is, no code change needed
    expect(
      p.reasons.some((r) => r.reason === 'Brand new reason Google invented'),
    ).toBe(true);
    expect(
      p.reasons.find((r) => r.reason.startsWith('Indexed, though'))?.group,
    ).toBe('improvement');
    expect(p.trend[p.trend.length - 1]).toEqual({
      date: '2026-11-13',
      indexed: 845,
      not_indexed: 130,
      impressions: 4000,
    });
  });

  it('reads an issue drill-down export with examples and flags the 1,000-row cap', () => {
    const rows = Array.from(
      { length: 1000 },
      (_, i) => `https://www.iptv-ott-france.com/p-${i}/,11/1${i % 9}/2026`,
    ).join('\n');
    const p = parseIndexingExport(
      zip({
        'Chart.csv': 'Date,Affected pages\n11/12/2026,9\n11/13/2026,10\n',
        'Table.csv': `URL,Last crawled\n${rows}\n`,
        'Metadata.csv':
          'Property,Value\nProperty,https://www.iptv-ott-france.com/\nIssue,Not found (404)\nLast updated,"Nov 13, 2026"\n',
      }),
      'issue.zip',
    );
    expect(p.kind).toBe('issue');
    expect(p.issue_reason).toBe('Not found (404)');
    expect(p.report_date).toBe('2026-11-13');
    expect(p.examples).toHaveLength(1000);
    expect(p.examples_partial).toBe(true);
    expect(p.trend[1]).toMatchObject({ date: '2026-11-13', not_indexed: 10 });
  });

  it('detects a per-sitemap scope', () => {
    const p = parseIndexingExport(
      zip({
        ...OVERVIEW,
        'Metadata.csv':
          'Property,Value\nSitemap,https://www.x.com/sitemap.xml\n',
      }),
      'x.zip',
    );
    expect(p.scope).toBe('sitemap');
    expect(p.scope_detail).toBe('https://www.x.com/sitemap.xml');
  });

  it('explains what is wrong with a bad file', () => {
    expect(() =>
      parseIndexingExport(Buffer.from('not a zip or csv at all'), 'x.txt'),
    ).toThrow(ExportParseError);
    expect(() =>
      parseIndexingExport(
        zip({ 'Critical issues.csv': 'Foo,Bar\n1,2\n' }),
        'bad.zip',
      ),
    ).toThrow(/expected columns "Reason" and "Pages"/);
    expect(() =>
      parseIndexingExport(
        zip({ 'Chart.csv': 'Date,Indexed\nnotadate,1\n' }),
        'bad.zip',
      ),
    ).toThrow(/unreadable date/);
  });

  it('reads the date formats Search Console uses', () => {
    expect(toIsoDate('2026-11-13')).toBe('2026-11-13');
    expect(toIsoDate('11/13/2026')).toBe('2026-11-13');
    expect(toIsoDate('11/13/26')).toBe('2026-11-13');
    expect(toIsoDate('Nov 13, 2026')).toBe('2026-11-13');
    expect(toIsoDate('13 Nov 2026')).toBe('2026-11-13');
    expect(toIsoDate('soon')).toBeNull();
  });
});

describe('reason classification', () => {
  it('classifies known reasons and tolerates punctuation changes', () => {
    expect(reasonIntent('Not found (404)')).toBe('likely_defect');
    expect(reasonIntent('Excluded by ‘noindex’ tag')).toBe('intentional');
    expect(reasonIntent("Excluded by 'noindex' tag")).toBe('intentional');
    expect(reasonIntent('Alternate page with proper canonical tag')).toBe(
      'intentional',
    );
    expect(reasonIntent('Crawled - currently not indexed')).toBe(
      'likely_defect',
    );
    expect(reasonIntent('Something Google adds next year')).toBe('review');
    expect(reasonHash('Excluded by ‘noindex’ tag')).toBe(
      reasonHash("Excluded by 'noindex' tag"),
    );
  });

  it('recognises indexed coverage states', () => {
    expect(isIndexedCoverage('Submitted and indexed')).toBe(true);
    expect(isIndexedCoverage('Indexed, not submitted in sitemap')).toBe(true);
    expect(isIndexedCoverage('URL is unknown to Google')).toBe(false);
    expect(isIndexedCoverage('Crawled - currently not indexed')).toBe(false);
  });
});
