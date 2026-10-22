/**
 * Report tables as shown on screen (MISS-0135): one model drives the preview, the Copy
 * action (tab-separated text) and matches the CSV columns of the API. Copy carries only
 * what the table shows: the rows the report returned for this workspace, nothing hidden.
 */
import { formatDelta, formatInt, formatPct, formatPosition } from "./format";
import type { ReportData } from "./types";

export type ColumnKind = "text" | "int" | "pct" | "pos" | "delta";
/** A value, or a number with its own kind (KPI tables mix counts, ratios and positions in a column). */
export type CellValue =
  string | number | null | { v: number | null; k: ColumnKind };

const unwrap = (
  value: CellValue,
  kind: ColumnKind,
): [string | number | null, ColumnKind] =>
  value !== null && typeof value === "object"
    ? [value.v, value.k]
    : [value, kind];

export interface ExportTable {
  /** report section the table belongs to: the CSV export of the same name has these rows */
  section: string;
  title: string;
  note: string | null;
  columns: { label: string; kind: ColumnKind }[];
  rows: CellValue[][];
}

/** On-screen text of a cell. */
export function displayCell(cell: CellValue, columnKind: ColumnKind): string {
  const [value, kind] = unwrap(cell, columnKind);
  if (kind === "text") return value === null ? "—" : String(value);
  const n = typeof value === "number" ? value : null;
  if (kind === "int") return formatInt(n);
  if (kind === "pct") return formatPct(n);
  if (kind === "pos") return formatPosition(n);
  return formatDelta(n);
}

/** Paste-friendly text of a cell: no thousands separators, blanks instead of dashes. */
export function copyCell(cell: CellValue, columnKind: ColumnKind): string {
  const [value, kind] = unwrap(cell, columnKind);
  if (value === null || value === undefined) return "";
  if (kind === "text") {
    const s = String(value)
      .replace(/[\t\r\n]+/g, " ")
      .trim();
    // a spreadsheet would run pasted text starting with these as a formula
    return /^[=+\-@]/.test(s) ? `'${s}` : s;
  }
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  if (kind === "int") return String(Math.round(value));
  if (kind === "pct") return `${(value * 100).toFixed(2)}%`;
  if (kind === "pos") return value ? value.toFixed(1) : "";
  return `${Math.round(value * 100)}%`;
}

/** Tab-separated text with a header row, one line per visible row. */
export function toTsv(table: Pick<ExportTable, "columns" | "rows">): string {
  const head = table.columns.map((c) => copyCell(c.label, "text")).join("\t");
  const body = table.rows.map((r) =>
    r.map((v, i) => copyCell(v, table.columns[i]?.kind ?? "text")).join("\t"),
  );
  return [head, ...body].join("\n");
}

/** The tables of a report, in the order the PDF prints them. */
export function reportTables(data: ReportData): ExportTable[] {
  const out: ExportTable[] = [];
  const o = data.overview;
  if (o) {
    const noPrev = o.comparison_available === false;
    const prev = (v: number) => (noPrev ? null : v);
    out.push({
      section: "overview",
      title: "Overview",
      note:
        [
          o.note,
          noPrev
            ? "No stored rows for the comparison period: previous values and changes are not shown."
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
      columns: [
        { label: "Metric", kind: "text" },
        { label: "Current", kind: "int" },
        { label: "Previous", kind: "int" },
        { label: "Δ", kind: "delta" },
      ],
      rows: (
        [
          ["Clicks", "clicks", "int"],
          ["Impressions", "impressions", "int"],
          ["CTR", "ctr", "pct"],
          ["Avg. position", "position", "pos"],
        ] as const
      ).map(([label, key, k]) => [
        label,
        { v: o.current[key], k },
        { v: prev(o.previous[key]), k },
        noPrev ? null : o.delta[key],
      ]),
    });
    if (o.properties) {
      out.push({
        section: "overview",
        title: "Per property",
        note: null,
        columns: [
          { label: "Site", kind: "text" },
          { label: "Clicks", kind: "int" },
          { label: "Clicks (previous)", kind: "int" },
          { label: "Δ clicks", kind: "delta" },
          { label: "Impressions", kind: "int" },
          { label: "Impressions (previous)", kind: "int" },
          { label: "Δ impressions", kind: "delta" },
          { label: "CTR", kind: "pct" },
          { label: "Position", kind: "pos" },
        ],
        rows: o.properties.map((p) => [
          p.display_name,
          p.current.clicks,
          prev(p.previous.clicks),
          p.delta.clicks,
          p.current.impressions,
          prev(p.previous.impressions),
          p.delta.impressions,
          p.current.ctr,
          p.current.position,
        ]),
      });
    }
  }
  for (const t of data.tables) {
    out.push({
      section: t.section,
      title: t.title,
      note: t.note,
      columns: [
        { label: t.keyLabel, kind: "text" },
        { label: "Clicks", kind: "int" },
        { label: "Impressions", kind: "int" },
        { label: "CTR", kind: "pct" },
        { label: "Position", kind: "pos" },
      ],
      rows: t.rows.map((r) => [
        r.key,
        r.clicks,
        r.impressions,
        r.ctr,
        r.position,
      ]),
    });
  }
  if (data.opportunities) {
    out.push({
      section: "opportunities",
      title: "Open opportunities",
      note: "Measured changes and heuristics from the stored Search Console data. Nothing here is a confirmed cause or a Google penalty.",
      columns: [
        { label: "Priority", kind: "text" },
        { label: "Finding", kind: "text" },
        { label: "Property", kind: "text" },
        { label: "Confidence", kind: "text" },
      ],
      rows: data.opportunities.map((x) => [
        x.priority,
        x.title,
        x.property,
        x.confidence,
      ]),
    });
  }
  return out;
}

export type CopyResult = { ok: true } | { ok: false; reason: string };

/**
 * Puts text on the clipboard: the async Clipboard API first, then the legacy selection copy
 * (http origins, older browsers). Never throws; the caller announces the result.
 */
export async function copyText(text: string): Promise<CopyResult> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch {
      // permission denied or document not focused: try the fallback
    }
  }
  if (typeof document === "undefined")
    return { ok: false, reason: "Clipboard is not available here." };
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.className = "fixed -left-[9999px] top-0 opacity-0";
  document.body.appendChild(area);
  try {
    area.select();
    const ok =
      typeof document.execCommand === "function" &&
      document.execCommand("copy");
    return ok
      ? { ok: true }
      : {
          ok: false,
          reason:
            "The browser blocked clipboard access. Select the table and copy it manually.",
        };
  } catch {
    return {
      ok: false,
      reason:
        "The browser blocked clipboard access. Select the table and copy it manually.",
    };
  } finally {
    area.remove();
  }
}
