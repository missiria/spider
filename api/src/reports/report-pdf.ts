/**
 * Readable PDF for a report (pdfmake, pure JS — no browser). Sections mirror the data
 * endpoint; every table carries definitions, period, freshness and coverage notes.
 */
import type {
  TDocumentDefinitions,
  Content,
  TableCell,
} from 'pdfmake/interfaces';
import { ReportData } from './reports.service';

export interface Brand {
  name?: string;
  accent_color?: string;
  footer?: string;
}

const fmtInt = (n: number) =>
  new Intl.NumberFormat('en-US').format(Math.round(n));
const fmtPct = (r: number) => `${(r * 100).toFixed(2)}%`;
const fmtPos = (p: number) => (p ? p.toFixed(1) : '—');
const fmtDelta = (d: number | null) =>
  d === null
    ? '—'
    : `${Math.round(d * 100) > 0 ? '+' : ''}${Math.round(d * 100)}%`;

export function buildReportDocument(
  data: ReportData,
  brand: Brand = {},
): TDocumentDefinitions {
  const accent = /^#[0-9a-f]{6}$/i.test(brand.accent_color ?? '')
    ? (brand.accent_color as string)
    : '#4f46e5';
  const content: Content[] = [];

  content.push({
    text: brand.name
      ? `${brand.name} · Search performance report`
      : 'Search performance report',
    style: 'brand',
    color: accent,
  });
  content.push({ text: data.title, style: 'h1' });
  content.push({
    text: `${data.period.start} → ${data.period.end}  vs  ${data.previousPeriod.start} → ${data.previousPeriod.end}`,
    style: 'muted',
  });
  content.push({
    text: `Generated ${data.generated_at.slice(0, 16).replace('T', ' ')} UTC · GSC data through ${data.data_through ?? 'n/a'} · Source: Google Search Console (web search)`,
    style: 'muted',
    margin: [0, 0, 0, 12],
  });
  if (data.notes) content.push({ text: data.notes, margin: [0, 0, 0, 10] });

  if (data.overview) {
    const o = data.overview;
    const noPrev = o.comparison_available === false;
    content.push({ text: 'Overview', style: 'h2', color: accent });
    if (o.note) content.push({ text: o.note, style: 'muted' });
    if (noPrev)
      content.push({
        text: 'No stored rows for the comparison period: previous values and changes are not shown.',
        style: 'muted',
      });
    content.push(
      kpiTable([
        [
          'Clicks',
          fmtInt(o.current.clicks),
          noPrev ? '—' : fmtInt(o.previous.clicks),
          fmtDelta(o.delta.clicks),
        ],
        [
          'Impressions',
          fmtInt(o.current.impressions),
          noPrev ? '—' : fmtInt(o.previous.impressions),
          fmtDelta(o.delta.impressions),
        ],
        [
          'CTR',
          fmtPct(o.current.ctr),
          noPrev ? '—' : fmtPct(o.previous.ctr),
          fmtDelta(o.delta.ctr),
        ],
        [
          'Avg. position',
          fmtPos(o.current.position),
          noPrev ? '—' : fmtPos(o.previous.position),
          fmtDelta(o.delta.position),
        ],
      ]),
    );
    if (o.properties) {
      content.push({ text: 'Per property', style: 'h3' });
      content.push(
        dataTable(
          ['Site', 'Clicks', 'Δ', 'Impressions', 'Δ', 'CTR', 'Position'],
          o.properties.map((p) => [
            p.display_name,
            fmtInt(p.current.clicks),
            fmtDelta(p.delta.clicks),
            fmtInt(p.current.impressions),
            fmtDelta(p.delta.impressions),
            fmtPct(p.current.ctr),
            fmtPos(p.current.position),
          ]),
          ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
        ),
      );
    }
  }

  for (const section of data.tables) {
    content.push({
      text: section.title,
      style: 'h2',
      color: accent,
      pageBreak: section.rows.length > 20 ? 'before' : undefined,
    });
    if (section.note) content.push({ text: section.note, style: 'muted' });
    if (!section.rows.length) {
      content.push({
        text: 'No rows for this period.',
        style: 'muted',
        margin: [0, 0, 0, 8],
      });
      continue;
    }
    content.push(
      dataTable(
        [section.keyLabel, 'Clicks', 'Impressions', 'CTR', 'Position'],
        section.rows
          .slice(0, 50)
          .map((r) => [
            r.key,
            fmtInt(r.clicks),
            fmtInt(r.impressions),
            fmtPct(r.ctr),
            fmtPos(r.position),
          ]),
        ['*', 'auto', 'auto', 'auto', 'auto'],
      ),
    );
  }

  if (data.opportunities) {
    content.push({
      text: 'Open opportunities',
      style: 'h2',
      color: accent,
      pageBreak: 'before',
    });
    content.push({
      text: 'Measured changes and heuristics from the stored Search Console data. Nothing here is a confirmed cause or a Google penalty.',
      style: 'muted',
    });
    if (!data.opportunities.length)
      content.push({ text: 'None open.', style: 'muted' });
    else
      content.push(
        dataTable(
          ['Priority', 'Finding', 'Property', 'Confidence'],
          data.opportunities
            .slice(0, 50)
            .map((o) => [o.priority, o.title, o.property, o.confidence]),
          ['auto', '*', 'auto', 'auto'],
        ),
      );
  }

  content.push({
    text: 'Definitions',
    style: 'h2',
    color: accent,
    pageBreak: 'before',
  });
  content.push({
    ul: [
      'Clicks / impressions: sums over the period as reported by Google Search Console for the property.',
      'CTR: Σ clicks / Σ impressions over the period (not an average of daily CTRs).',
      'Average position: impressions-weighted mean of daily average positions; lower is better.',
      'Δ: change versus the previous period of the same length ending the day before the period starts; "—" when the previous value is 0.',
      'Query tables cover only queries Google reports; low-volume ("anonymised") queries are omitted, so query rows explain less than 100 % of clicks — the coverage note under each table states how much.',
      'Search appearance rows exist only for results with a special appearance (rich results, AMP…).',
      'Data freshness: Google finalises data about three days late; the report ends at "data through".',
    ],
    style: 'small',
  });

  return {
    pageSize: 'A4',
    pageMargins: [36, 40, 36, 48],
    footer: (page: number, pages: number) => ({
      columns: [
        { text: brand.footer ?? 'Generated by Spider', style: 'footer' },
        { text: `${page} / ${pages}`, alignment: 'right', style: 'footer' },
      ],
      margin: [36, 12, 36, 0],
    }),
    content,
    styles: {
      brand: { fontSize: 10, bold: true, margin: [0, 0, 0, 4] },
      h1: { fontSize: 20, bold: true, margin: [0, 0, 0, 4] },
      h2: { fontSize: 14, bold: true, margin: [0, 14, 0, 6] },
      h3: { fontSize: 11, bold: true, margin: [0, 10, 0, 4] },
      muted: { fontSize: 9, color: '#64748b', margin: [0, 0, 0, 6] },
      small: { fontSize: 9 },
      th: { bold: true, fontSize: 9, fillColor: '#f1f5f9' },
      td: { fontSize: 9 },
      footer: { fontSize: 8, color: '#94a3b8' },
    },
    defaultStyle: { fontSize: 10 },
  };
}

function kpiTable(rows: string[][]): Content {
  return {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        cells(['Metric', 'Current', 'Previous', 'Δ'], 'th'),
        ...rows.map((r) => cells(r, 'td')),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 8],
  };
}

function dataTable(
  headers: string[],
  rows: string[][],
  widths: (string | number)[],
): Content {
  return {
    table: {
      headerRows: 1,
      widths,
      body: [cells(headers, 'th'), ...rows.map((r) => cells(r, 'td'))],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 8],
  };
}

function cells(values: string[], style: string): TableCell[] {
  return values.map((v, i) => ({
    text: v,
    style,
    alignment: i === 0 ? 'left' : 'right',
    noWrap: false,
  }));
}
