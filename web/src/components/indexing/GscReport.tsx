"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui";
import { formatInt, shortDate } from "@/lib/format";
import type { ReasonGroup } from "@/lib/types";

/**
 * Search Console's "Page indexing" screen (MITP-0833): the Not indexed / Indexed tiles that
 * toggle the chart series, the Impressions overlay, then "Why pages aren't indexed" with
 * Reason, Source, Validation, Trend and Pages. The caller says where the numbers come from.
 */
export interface GscReasonRow {
  reason: string;
  reason_hash: string;
  source: string | null;
  group: ReasonGroup;
  validation: string | null;
  pages: number;
  trend: { date: string; pages: number }[];
  is_new?: boolean;
}

export interface GscTrendPoint {
  date: string;
  indexed: number | null;
  not_indexed: number | null;
  impressions: number | null;
}

const INDEXED = "var(--success)";
const NOT_INDEXED = "var(--chart-secondary)";
const IMPRESSIONS = "var(--primary)";

export function validationTone(v: string | null): string {
  const s = (v ?? "").toLowerCase();
  if (s === "failed") return "bg-danger-soft text-danger";
  if (s === "passed") return "bg-success-soft text-success";
  if (s === "started" || s === "looking good") return "bg-primary-soft text-primary";
  if (s === "not started") return "bg-warning-soft text-warning";
  return "bg-surface-muted text-muted";
}

/** Inline trend line of one reason, like the Trend column in Search Console. */
export function Sparkline({ points, label }: { points: number[]; label: string }) {
  const w = 96;
  const h = 24;
  if (points.length < 2) return <span className="text-xs text-muted" title="Needs at least two dates">—</span>;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const coords = points.map((p, i) => `${((i / (points.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((p - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="inline-block align-middle">
      <polyline points={coords} fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Tile({ label, value, hint, color, active, onToggle }: { label: string; value: string; hint?: string; color: string; active: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={active} className={`min-w-0 flex-1 basis-40 rounded-lg border border-border px-4 py-3 text-left transition-opacity ${active ? "bg-surface" : "bg-surface-muted opacity-60"}`}>
      <span className="flex items-center gap-2 text-sm text-muted">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: active ? color : "transparent", boxShadow: `inset 0 0 0 2px ${color}` }} aria-hidden />
        {label}
      </span>
      <span className="tabular mt-1 block text-2xl font-semibold">{value}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </button>
  );
}

function ReasonsTable({ rows, href }: { rows: GscReasonRow[]; href: (r: GscReasonRow) => string }) {
  const th = "px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>Reason</th>
            <th className={th}>Source</th>
            <th className={th}>Validation</th>
            <th className={th}>Trend</th>
            <th className={`${th} text-right`}>Pages</th>
            <th className={th}><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.reason_hash} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
              <td className="px-4 py-3">
                <Link href={href(r)} className="font-medium hover:text-primary">
                  {r.reason}
                </Link>
                {r.is_new && <span className="ml-2 rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">New</span>}
              </td>
              <td className="px-4 py-3 text-muted">{r.source ?? "—"}</td>
              <td className="px-4 py-3">
                <span className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${validationTone(r.validation)}`}>{r.validation ?? "N/A"}</span>
              </td>
              <td className="px-4 py-3">
                <Sparkline points={r.trend.map((t) => t.pages)} label={`Trend of ${r.reason}`} />
              </td>
              <td className="tabular px-4 py-3 text-right font-medium">{formatInt(r.pages)}</td>
              <td className="px-2 py-3 text-right text-muted">
                <Link href={href(r)} aria-label={`Open ${r.reason}`} className="inline-flex rounded p-1 hover:text-primary">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GscReport({
  lastUpdate,
  totals,
  trend,
  reasons,
  reasonHref,
  indexedHref,
  footnote,
  validationNote,
}: {
  lastUpdate: string | null;
  totals: { indexed: number | null; not_indexed: number | null } | null;
  trend: GscTrendPoint[];
  reasons: GscReasonRow[];
  reasonHref: (r: GscReasonRow) => string;
  indexedHref?: string;
  /** provenance line under the chart */
  footnote: React.ReactNode;
  /** shown under the table when the source has no validation data */
  validationNote?: string;
}) {
  const [show, setShow] = useState({ not_indexed: true, indexed: true, impressions: false });
  const hasImpressions = trend.some((t) => t.impressions !== null);
  const notIndexed = reasons.filter((r) => r.group === "not_indexed");
  const improvement = reasons.filter((r) => r.group === "improvement");
  const toggle = (k: keyof typeof show) => setShow((s) => ({ ...s, [k]: !s[k] }));

  return (
    <>
      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Page indexing</h2>
          <span className="text-xs text-muted">Last update: {lastUpdate ?? "—"}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Tile label="Not indexed" value={totals?.not_indexed == null ? "—" : formatInt(totals.not_indexed)} hint={`${notIndexed.length} reason${notIndexed.length === 1 ? "" : "s"}`} color={NOT_INDEXED} active={show.not_indexed} onToggle={() => toggle("not_indexed")} />
          <Tile label="Indexed" value={totals?.indexed == null ? "—" : formatInt(totals.indexed)} color={INDEXED} active={show.indexed} onToggle={() => toggle("indexed")} />
          {hasImpressions && (
            <label className="flex basis-40 cursor-pointer items-center gap-2 self-center text-sm">
              <input type="checkbox" checked={show.impressions} onChange={() => toggle("impressions")} className="accent-primary" />
              Impressions
            </label>
          )}
        </div>

        {trend.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">No chart data yet.</div>
        ) : (
          <div className="mt-4 h-64 w-full" role="img" aria-label="Indexed and not indexed pages over time">
            <ResponsiveContainer>
              <ComposedChart data={trend} margin={{ top: 8, right: show.impressions ? 0 : 16, left: 0, bottom: 0 }} barCategoryGap={trend.length > 45 ? 0 : "10%"}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" minTickGap={28} />
                <YAxis yAxisId="pages" tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" tickFormatter={(v: number) => formatInt(v)} width={52} allowDecimals={false} />
                {show.impressions && <YAxis yAxisId="impr" orientation="right" tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" tickFormatter={(v: number) => formatInt(v)} width={52} allowDecimals={false} />}
                <Tooltip formatter={(v) => formatInt(Number(v))} labelFormatter={(l) => String(l)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} cursor={{ fill: "var(--surface-muted)" }} />
                {show.indexed && <Bar yAxisId="pages" dataKey="indexed" name="Indexed" stackId="pages" fill={INDEXED} isAnimationActive={false} />}
                {show.not_indexed && <Bar yAxisId="pages" dataKey="not_indexed" name="Not indexed" stackId="pages" fill={NOT_INDEXED} isAnimationActive={false} />}
                {show.impressions && <Line yAxisId="impr" type="monotone" dataKey="impressions" name="Impressions" stroke={IMPRESSIONS} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">{footnote}</p>
          {indexedHref && (
            <Link href={indexedHref} className="text-sm text-primary hover:underline">
              View data about indexed pages
            </Link>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium">Why pages aren’t indexed</h2>
          <p className="text-xs text-muted">Pages that aren’t indexed can’t be served on Google</p>
        </div>
        {notIndexed.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted">No reason reported: every page in this view is indexed.</div> : <ReasonsTable rows={notIndexed} href={reasonHref} />}
        {validationNote && <p className="border-t border-border px-4 py-3 text-xs text-muted">{validationNote}</p>}
      </Card>

      {improvement.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-medium">Improve page appearance</h2>
            <p className="text-xs text-muted">Indexed pages with an issue that can affect how they appear on Google</p>
          </div>
          <ReasonsTable rows={improvement} href={reasonHref} />
        </Card>
      )}
    </>
  );
}
