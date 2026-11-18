import { csvObjects, isZip, readZip, ZipEntry } from './file-readers';
import { IndexingReasonGroup } from './entities/indexing-reason.entity';
import {
  IndexingReportKind,
  IndexingScope,
} from './entities/indexing-import.entity';

/**
 * Parser for Search Console "Page indexing" exports (Export → Download CSV). Search Console
 * delivers a ZIP of CSV files:
 *   overview : Chart.csv, Critical issues.csv, Non-critical issues.csv, Metadata.csv
 *   issue    : Chart.csv, Table.csv, Metadata.csv   (drill-down of one reason)
 * Columns are located by header name, not by position, and unknown reasons are kept verbatim.
 * Every failure raises ExportParseError naming the file and the missing column.
 */

export class ExportParseError extends Error {}

export interface ParsedReason {
  reason: string;
  source: string | null;
  validation: string | null;
  pages: number;
  group: IndexingReasonGroup;
}

export interface ParsedTrend {
  date: string;
  indexed: number | null;
  not_indexed: number | null;
  impressions: number | null;
}

export interface ParsedExample {
  url: string;
  last_crawled: string | null;
}

export interface ParsedExport {
  kind: IndexingReportKind;
  property: string | null;
  scope: IndexingScope;
  scope_detail: string | null;
  issue_reason: string | null;
  report_date: string;
  reasons: ParsedReason[];
  trend: ParsedTrend[];
  examples: ParsedExample[];
  examples_partial: boolean;
  metadata: Record<string, string>;
  files: string[];
}

/** Search Console caps the rows of an exported table at 1,000. */
export const GSC_EXPORT_ROW_CAP = 1000;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function findCol(header: string[], ...candidates: RegExp[]): string | null {
  for (const re of candidates) {
    const hit = header.find((h) => re.test(norm(h)));
    if (hit) return hit;
  }
  return null;
}

function toInt(v: string | undefined): number | null {
  if (v === undefined) return null;
  const t = v.replace(/[\s,  ]/g, '');
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** ISO, "M/D/YY(YY)", "Nov 13, 2026" or "13 Nov 2026" → YYYY-MM-DD; null when unreadable. */
export function toIsoDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, Number(m[1]), Number(m[2]));
  }
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()])
    return iso(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.? (\d{4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()])
    return iso(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fileKind(
  name: string,
): 'chart' | 'critical' | 'noncritical' | 'table' | 'metadata' | null {
  const n = norm(name.replace(/\.csv$/i, ''));
  if (n === 'chart') return 'chart';
  if (n.startsWith('non critical')) return 'noncritical';
  if (n.startsWith('critical')) return 'critical';
  if (n === 'table') return 'table';
  if (n === 'metadata') return 'metadata';
  return null;
}

export function parseIndexingExport(
  buf: Buffer,
  filename: string,
): ParsedExport {
  let entries: ZipEntry[];
  if (isZip(buf)) {
    try {
      entries = readZip(buf);
    } catch (err) {
      throw new ExportParseError(`${filename}: ${(err as Error).message}`);
    }
  } else {
    entries = [{ name: filename, data: buf }];
  }
  const csvs = entries.filter((e) => /\.csv$/i.test(e.name));
  if (!csvs.length) {
    throw new ExportParseError(
      `${filename}: no CSV file found. Use Search Console → Page indexing → Export → "Download CSV" and upload the ZIP as is.`,
    );
  }
  const byKind = new Map<string, { name: string; text: string }>();
  const unknown: string[] = [];
  for (const e of csvs) {
    const k = fileKind(e.name);
    if (k) byKind.set(k, { name: e.name, text: e.data.toString('utf8') });
    else unknown.push(e.name);
  }

  const metadata: Record<string, string> = {};
  const meta = byKind.get('metadata');
  if (meta) {
    const { header, rows } = csvObjects(meta.text);
    const kCol = header[0];
    const vCol = header[1];
    if (kCol && vCol) {
      // the header row itself can be the first pair
      metadata[kCol] = vCol;
      for (const r of rows) if (r[kCol]) metadata[r[kCol]] = r[vCol] ?? '';
    }
  }
  const metaGet = (...res: RegExp[]) => {
    for (const re of res) {
      const k = Object.keys(metadata).find((x) => re.test(norm(x)));
      if (k) return metadata[k];
    }
    return null;
  };

  const property =
    metaGet(/^property$/, /^site$/) ??
    Object.values(metadata).find((v) => /^(https?:\/\/|sc-domain:)/.test(v)) ??
    null;
  const issueReason = metaGet(/^issue$/, /^reason$/, /issue name/);
  const sitemapFilter = metaGet(/^sitemap$/, /sitemap filter/, /^filter$/);
  let scope: IndexingScope = 'all_known';
  let scopeDetail: string | null = null;
  if (sitemapFilter) {
    const f = norm(sitemapFilter);
    if (/^https?:/.test(sitemapFilter.trim())) {
      scope = 'sitemap';
      scopeDetail = sitemapFilter.trim();
    } else if (f.includes('submitted')) {
      scope = 'submitted';
    } else if (f.includes('unsubmitted')) {
      scope = 'all_known';
    }
  }

  const kind: IndexingReportKind =
    byKind.has('table') && !byKind.has('critical') ? 'issue' : 'overview';

  const reasons: ParsedReason[] = [];
  for (const [k, group] of [
    ['critical', 'not_indexed'],
    ['noncritical', 'improvement'],
  ] as const) {
    const f = byKind.get(k);
    if (!f) continue;
    const { header, rows } = csvObjects(f.text);
    const reasonCol = findCol(header, /^reason$/, /^issue$/, /reason|issue/);
    const pagesCol = findCol(
      header,
      /^pages$/,
      /affected pages/,
      /^urls?$/,
      /pages/,
    );
    if (!reasonCol || !pagesCol) {
      throw new ExportParseError(
        `${f.name}: expected columns "Reason" and "Pages", found ${JSON.stringify(header)}`,
      );
    }
    const sourceCol = findCol(header, /^source$/);
    const validationCol = findCol(header, /^validation$/, /validation/);
    for (const r of rows) {
      if (!r[reasonCol]) continue;
      const pages = toInt(r[pagesCol]);
      if (pages === null) {
        throw new ExportParseError(
          `${f.name}: "${r[reasonCol]}" has no readable page count`,
        );
      }
      reasons.push({
        reason: r[reasonCol],
        source: sourceCol ? r[sourceCol] || null : null,
        validation: validationCol ? r[validationCol] || null : null,
        pages,
        group,
      });
    }
  }

  const trend: ParsedTrend[] = [];
  const chart = byKind.get('chart');
  if (chart) {
    const { header, rows } = csvObjects(chart.text);
    const dateCol = findCol(header, /^date$/, /date/);
    if (!dateCol) {
      throw new ExportParseError(
        `${chart.name}: expected a "Date" column, found ${JSON.stringify(header)}`,
      );
    }
    const notIdxCol = findCol(header, /^not indexed$/, /not indexed/);
    const idxCol = findCol(header, /^indexed$/);
    const affectedCol = findCol(header, /affected pages/, /^pages$/);
    const imprCol = findCol(header, /^impressions$/);
    for (const r of rows) {
      const date = toIsoDate(r[dateCol]);
      if (!date) {
        throw new ExportParseError(
          `${chart.name}: unreadable date "${r[dateCol]}"`,
        );
      }
      trend.push({
        date,
        indexed: idxCol ? toInt(r[idxCol]) : null,
        not_indexed: notIdxCol
          ? toInt(r[notIdxCol])
          : affectedCol
            ? toInt(r[affectedCol])
            : null,
        impressions: imprCol ? toInt(r[imprCol]) : null,
      });
    }
    trend.sort((a, b) => a.date.localeCompare(b.date));
  }

  const examples: ParsedExample[] = [];
  const table = byKind.get('table');
  if (table) {
    const { header, rows } = csvObjects(table.text);
    const urlCol = findCol(header, /^url$/, /url/);
    if (!urlCol) {
      throw new ExportParseError(
        `${table.name}: expected a "URL" column, found ${JSON.stringify(header)}`,
      );
    }
    const crawlCol = findCol(header, /last crawled/, /crawl/);
    for (const r of rows) {
      if (!r[urlCol]) continue;
      examples.push({
        url: r[urlCol],
        last_crawled: crawlCol ? toIsoDate(r[crawlCol]) : null,
      });
    }
  }

  if (kind === 'issue' && !issueReason) {
    throw new ExportParseError(
      `${filename}: this looks like an issue export (Table.csv) but Metadata.csv names no issue. Export it again from the issue's detail page.`,
    );
  }
  if (!reasons.length && !trend.length && !examples.length) {
    throw new ExportParseError(
      `${filename}: no Page indexing data recognised. Files found: ${csvs.map((c) => c.name).join(', ')}${unknown.length ? ` (unrecognised: ${unknown.join(', ')})` : ''}`,
    );
  }

  const lastUpdated = toIsoDate(
    metaGet(/last updated/, /^updated$/) ?? undefined,
  );
  const reportDate = lastUpdated ?? trend[trend.length - 1]?.date ?? null;
  if (!reportDate) {
    throw new ExportParseError(
      `${filename}: cannot tell the report date (no chart dates and no "Last updated" in Metadata)`,
    );
  }

  return {
    kind,
    property,
    scope,
    scope_detail: scopeDetail,
    issue_reason: issueReason,
    report_date: reportDate,
    reasons,
    trend,
    examples,
    examples_partial: examples.length >= GSC_EXPORT_ROW_CAP,
    metadata,
    files: csvs.map((c) => c.name),
  };
}
