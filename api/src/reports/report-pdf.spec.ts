import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { Brand, StoredLogo } from '../workspaces/brand';
import { solidPng } from '../testing/images.helper-spec';
import {
  LOGO_BOX,
  PDF_TABLE_ROWS,
  buildReportDocument,
  fitLogo,
  footerHeight,
  footerLines,
} from './report-pdf';
import { ReportData } from './reports.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsFonts = require('pdfmake/build/vfs_fonts');
const vfs = vfsFonts.pdfMake
  ? vfsFonts.pdfMake.vfs
  : (vfsFonts.vfs ?? vfsFonts);
const printer = new PdfPrinter({
  Roboto: {
    normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
    bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
});

const ENTITY: Brand = {
  name: 'MISSIRIA',
  accent_color: '#0f766e',
  footer: 'Prepared for the client',
  legal_name: 'MISSIRIA LTD',
  trading_name: 'MISSIRIA',
  company_number: '17494304',
  registered_address:
    'Unit A, 82 James Carter Road\nMildenhall IP28 7DE\nUnited Kingdom',
  contact_email: 'contact@missiria.dev',
  website: 'https://www.missiria.dev',
};

function logoOf(w: number, h: number): StoredLogo {
  const png = solidPng(w, h);
  return {
    mime: 'image/png',
    width: w,
    height: h,
    bytes: png.length,
    data: png.toString('base64'),
  };
}

function report(rowsPerTable: number): ReportData {
  const row = (i: number) => ({
    key: `https://example.com/a-fairly-long-page-path/number-${i}/with-more-segments`,
    clicks: 1000 - i,
    impressions: 20000 - i,
    ctr: 0.05,
    position: 4.2,
  });
  const period = { start: '2026-09-21', end: '2026-10-18' };
  return {
    report_id: 1,
    title: 'Client monthly',
    scope: 'property',
    property: {
      id: 1,
      display_name: 'example.com',
      site_url: 'https://example.com/',
    },
    generated_at: '2026-10-22T08:00:00.000Z',
    data_through: '2026-10-18',
    period,
    previousPeriod: { start: '2026-08-24', end: '2026-09-20' },
    notes: 'Notes printed at the top.',
    overview: {
      current: { clicks: 100, impressions: 1000, ctr: 0.1, position: 3 },
      previous: { clicks: 90, impressions: 900, ctr: 0.1, position: 3.2 },
      delta: { clicks: 0.11, impressions: 0.11, ctr: 0, position: -0.06 },
      comparison_available: true,
    },
    tables: (['pages', 'queries', 'countries'] as const).map((section) => ({
      section,
      title: section,
      keyLabel: 'Key',
      note: '2 days stored (2026-09-26 → 2026-10-05) · query rows explain 55% of clicks',
      rows: Array.from({ length: rowsPerTable }, (_, i) => row(i)),
    })),
    opportunities: null,
  };
}

interface Laid {
  pages: {
    pageSize: { height: number };
    items: { type: string; item: Record<string, unknown> }[];
  }[];
}

/** Lays the document out like the real export and returns pdfmake's positioned pages. */
async function layout(
  def: TDocumentDefinitions,
): Promise<{ laid: Laid; footerCalls: [number, number][]; bytes: number }> {
  const footerCalls: [number, number][] = [];
  const footer = def.footer as (p: number, n: number) => unknown;
  const doc = printer.createPdfKitDocument({
    ...def,
    footer: (p: number, n: number) => {
      footerCalls.push([p, n]);
      return footer(p, n);
    },
  });
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve());
    doc.on('error', reject);
    doc.end();
  });
  return {
    laid: { pages: doc._pdfMakePages },
    footerCalls,
    bytes: Buffer.concat(chunks).length,
  };
}

const top = (it: Record<string, unknown>) =>
  Number(it.y ?? (it as { y1?: number }).y1 ?? 0);
const bottom = (it: Record<string, unknown>) => {
  const y = top(it);
  if (typeof (it as { getHeight?: () => number }).getHeight === 'function')
    return y + (it as { getHeight: () => number }).getHeight();
  if (typeof it._height === 'number') return y + (it._height as number);
  if (typeof it.h === 'number') return y + (it.h as number);
  if (typeof (it as { y2?: number }).y2 === 'number')
    return (it as { y2: number }).y2;
  return y;
};

const lineText = (it: Record<string, unknown>) =>
  ((it.inlines as { text: string }[] | undefined) ?? [])
    .map((i) => i.text)
    .join('');

/**
 * Every positioned item sits wholly in the header band, the body band or the footer band, and
 * the header and footer were really laid out on every page (pdfmake silently drops a footer
 * that does not fit its margin instead of overflowing).
 */
function assertNoOverlap(
  laid: Laid,
  margins: [number, number, number, number],
  expectHeader: string,
  expectFooter: string[],
) {
  const [, topMargin, , bottomMargin] = margins;
  laid.pages.forEach((page, index) => {
    const h = page.pageSize.height;
    const headerText = page.items
      .filter(({ type, item }) => type === 'line' && top(item) < topMargin)
      .map(({ item }) => lineText(item))
      .join(' ');
    const footerText = page.items
      .filter(
        ({ type, item }) => type === 'line' && top(item) >= h - bottomMargin,
      )
      .map(({ item }) => lineText(item))
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(headerText).toContain(expectHeader);
    for (const f of expectFooter) expect(footerText).toContain(f);
    expect(footerText).toContain(`Page ${index + 1} of ${laid.pages.length}`);
    for (const { item } of page.items) {
      const t = top(item);
      const b = bottom(item);
      if (t < topMargin) expect(b).toBeLessThanOrEqual(topMargin + 0.5);
      else if (t >= h - bottomMargin) expect(b).toBeLessThanOrEqual(h);
      else expect(b).toBeLessThanOrEqual(h - bottomMargin + 0.5);
    }
  });
}

describe('report PDF (MISS-0135)', () => {
  it('fits the logo inside its header box without changing its aspect ratio', () => {
    expect(fitLogo(240, 60)).toEqual({ width: 112, height: 28 });
    expect(fitLogo(1400, 100)).toEqual({ width: LOGO_BOX.width, height: 10 });
    expect(fitLogo(100, 100)).toEqual({ width: 28, height: 28 });
    const f = fitLogo(613, 157);
    expect(f.width / f.height).toBeCloseTo(613 / 157, 1);
  });

  it('header carries the logo (fitted, no effects) and the brand name', () => {
    const def = buildReportDocument(report(3), ENTITY, logoOf(240, 60));
    const header = JSON.stringify((def.header as () => unknown)());
    expect(header).toContain('data:image/png;base64,');
    expect(header).toContain('"width":112');
    expect(header).toContain('"height":28');
    expect(header).toContain('MISSIRIA');
    expect(header).not.toMatch(/opacity|fillColor/);
  });

  it('falls back to a clean text-only header without a logo, and to a neutral title without any name', () => {
    const named = JSON.stringify(
      (
        buildReportDocument(report(3), { name: 'Acme' }).header as () => unknown
      )(),
    );
    expect(named).toContain('Acme');
    expect(named).not.toContain('image');
    const bare = JSON.stringify(
      (buildReportDocument(report(3), {}).header as () => unknown)(),
    );
    expect(bare).toContain('Search performance report');
  });

  it('footer prints the legal entity, the generation date and page x of y on every page', async () => {
    const def = buildReportDocument(
      report(PDF_TABLE_ROWS),
      ENTITY,
      logoOf(240, 60),
    );
    const { laid, footerCalls } = await layout(def);
    expect(laid.pages.length).toBeGreaterThan(2);
    expect(footerCalls.map(([p]) => p)).toEqual(
      laid.pages.map((_, i) => i + 1),
    );
    const footer = def.footer as (p: number, n: number) => unknown;
    for (const [p, n] of footerCalls) {
      const text = JSON.stringify(footer(p, n));
      expect(text).toContain(
        'MISSIRIA LTD (trading as MISSIRIA) · Company no. 17494304',
      );
      expect(text).toContain(
        'Registered office: Unit A, 82 James Carter Road, Mildenhall IP28 7DE, United Kingdom',
      );
      expect(text).toContain('contact@missiria.dev · www.missiria.dev');
      expect(text).toContain('Generated 2026-10-22');
      expect(text).toContain(`Page ${p} of ${n}`);
    }
  });

  it('without legal details the footer is the footer line (or "Generated by Spider"), date and page', () => {
    expect(footerLines({})).toEqual(['Generated by Spider']);
    expect(footerLines({ footer: 'Confidential' })).toEqual(['Confidential']);
    expect(footerLines({ company_number: '123' })).toEqual([
      'Generated by Spider',
    ]);
  });

  it('long reports paginate with header and footer never overlapping tables or notes', async () => {
    const def = buildReportDocument(
      report(PDF_TABLE_ROWS),
      ENTITY,
      logoOf(240, 60),
    );
    const { laid } = await layout(def);
    assertNoOverlap(
      laid,
      def.pageMargins as [number, number, number, number],
      'MISSIRIA',
      ['Company no. 17494304', 'United Kingdom', 'Generated 2026-10-22'],
    );
  });

  it('a 300-character address wraps: the bottom margin grows and still nothing overlaps', async () => {
    const longAddress: Brand = {
      ...ENTITY,
      registered_address: Array.from(
        { length: 10 },
        (_, i) => `Building ${i}, Some Very Long Industrial Estate Road`,
      )
        .join('\n')
        .slice(0, 300),
    };
    const short = buildReportDocument(report(5), ENTITY)
      .pageMargins as number[];
    const def = buildReportDocument(
      report(PDF_TABLE_ROWS),
      longAddress,
      logoOf(80, 80),
    );
    const margins = def.pageMargins as [number, number, number, number];
    expect(margins[3]).toBeGreaterThan(short[3]);
    expect(margins[3]).toBe(footerHeight(footerLines(longAddress)));
    const { laid } = await layout(def);
    assertNoOverlap(laid, margins, 'MISSIRIA', [
      'Building 0',
      'Generated 2026-10-22',
    ]);
  });

  it('caps PDF tables and says where the full list is', () => {
    const json = JSON.stringify(buildReportDocument(report(120), {}).content);
    expect(json).toContain(
      `First ${PDF_TABLE_ROWS} of 120 rows; the CSV export has all of them.`,
    );
    expect(json.match(/number-119\//g)).toBeNull();
  });

  it('keeps the period comparison, freshness, coverage notes and definitions', () => {
    const json = JSON.stringify(buildReportDocument(report(3), ENTITY).content);
    // Roboto has no → glyph: ranges print with an en dash
    expect(json).toContain(
      '2026-09-21 – 2026-10-18  vs  2026-08-24 – 2026-09-20',
    );
    expect(json).not.toContain('→');
    expect(json).toContain('GSC data through 2026-10-18');
    expect(json).toContain('query rows explain 55% of clicks');
    expect(json).toContain('Definitions');
  });
});
