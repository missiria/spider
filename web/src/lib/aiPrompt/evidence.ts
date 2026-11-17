import { formatInt, formatPct, formatPosition } from "../format";
import type { Period } from "../types";
import type { PromptStrings } from "./strings";

type Totals = {
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

interface CompetingPage {
  page: string;
  clicks: number;
  impressions: number;
  share: number;
  position: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isPeriod = (v: unknown): v is Period =>
  isRecord(v) && typeof v.start === "string" && typeof v.end === "string";

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

function totals(v: unknown): Totals | null {
  if (!isRecord(v)) return null;
  const t: Totals = {
    clicks: num(v.clicks),
    impressions: num(v.impressions),
    ctr: num(v.ctr),
    position: num(v.position),
  };
  return Object.values(t).some((x) => x !== undefined) ? t : null;
}

/** One Markdown table cell: no pipes or line breaks that would break the row. */
export function mdCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

export function mdTable(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map(mdCell).join(" | ")} |`;
  return [
    line(headers),
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}

/**
 * The Evidence card of the opportunity page as Markdown lines. The API stores `previous`
 * either as the comparison period ({start, end}) or, for the drop rules, as the previous
 * metric totals: both are handled, and no dates are invented when the period is absent.
 */
export function evidenceLines(
  evidence: Record<string, unknown>,
  s: PromptStrings,
): string[] {
  const f = s.fields;
  const out: string[] = [];

  const period = isPeriod(evidence.period) ? evidence.period : null;
  const prevPeriod = isPeriod(evidence.previous) ? evidence.previous : null;
  if (period) {
    out.push(
      `- ${f.period}: ${period.start} → ${period.end}` +
        (prevPeriod
          ? ` (${f.comparedWith} ${prevPeriod.start} → ${prevPeriod.end})`
          : ""),
    );
  }

  const current = totals(evidence.current);
  const previous = prevPeriod ? null : totals(evidence.previous);
  if (current) {
    const metrics: [keyof Totals, string, (n: number | undefined) => string][] =
      [
        ["clicks", f.clicks, formatInt],
        ["impressions", f.impressions, formatInt],
        ["ctr", f.ctr, (n) => formatPct(n)],
        ["position", f.position, formatPosition],
      ];
    const rows = metrics
      .filter(([key]) => current[key] !== undefined)
      .map(([key, label, fmt]) => {
        const row = [label, fmt(current[key])];
        if (previous)
          row.push(previous[key] !== undefined ? fmt(previous[key]) : "—");
        return row;
      });
    if (rows.length) {
      out.push(
        "",
        mdTable(
          previous ? [f.metric, f.current, f.previous] : [f.metric, f.current],
          rows,
        ),
        "",
      );
    }
  }

  const drop = num(evidence.drop);
  if (drop !== undefined) out.push(`- ${f.drop}: ${formatPct(drop, 0)}`);

  const potential = num(evidence.potential_clicks);
  if (potential !== undefined)
    out.push(`- ${f.potential.replace("{n}", formatInt(potential))}`);

  const competing = Array.isArray(evidence.competing)
    ? (evidence.competing.filter(
        (c) => isRecord(c) && typeof c.page === "string",
      ) as CompetingPage[])
    : [];
  if (competing.length) {
    const total = num(evidence.query_impressions);
    out.push(
      `- ${f.competing}` +
        (total !== undefined
          ? ` (${f.queryImpressions.replace("{n}", formatInt(total))})`
          : "") +
        ":",
      "",
      mdTable(
        ["URL", f.share, f.clicks, f.impressions, f.position],
        competing.map((c) => [
          c.page,
          formatPct(num(c.share), 0),
          formatInt(num(c.clicks)),
          formatInt(num(c.impressions)),
          formatPosition(num(c.position)),
        ]),
      ),
      "",
    );
  }

  if (isRecord(evidence.threshold))
    out.push(`- ${f.threshold}: \`${JSON.stringify(evidence.threshold)}\``);

  if (!out.length) out.push(f.noEvidence);
  // no blank line at either end, no doubled blank lines
  return out.filter(
    (l, i) =>
      !(l === "" && (i === 0 || i === out.length - 1 || out[i - 1] === "")),
  );
}
