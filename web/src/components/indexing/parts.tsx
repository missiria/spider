"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleDashed, Info, MinusCircle, PlayCircle, XCircle } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatInt, shortDate } from "@/lib/format";
import { INTENT_HINTS, INTENT_LABELS, intentTone } from "@/lib/indexing";
import type { ReasonIntent } from "@/lib/types";

export function Banner({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger"; title: string; children?: React.ReactNode }) {
  const cls = tone === "danger" ? "border-danger/30 bg-danger-soft text-danger" : tone === "warning" ? "border-warning/30 bg-warning-soft text-warning" : "border-border bg-surface-muted text-foreground";
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${cls}`} role={tone === "info" ? "note" : "alert"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <span className="font-medium">{title}</span>
        {children && <span className="text-foreground"> {children}</span>}
      </div>
    </div>
  );
}

export function IntentChip({ intent }: { intent: ReasonIntent }) {
  return (
    <span title={INTENT_HINTS[intent]} className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${intentTone(intent)}`}>
      {INTENT_LABELS[intent]}
    </span>
  );
}

type StatusLook = { cls: string; Icon: typeof CheckCircle2; label: string };

/** Google's URL Inspection verdict: PASS = indexed (green), FAIL = error (red), NEUTRAL = excluded (grey). */
function verdictLook(verdict: string | null | undefined): StatusLook {
  if (verdict === "PASS") return { cls: "bg-success-soft text-success", Icon: CheckCircle2, label: "Pass" };
  if (verdict === "FAIL") return { cls: "bg-danger-soft text-danger", Icon: XCircle, label: "Fail" };
  if (verdict === "PARTIAL") return { cls: "bg-warning-soft text-warning", Icon: AlertTriangle, label: "Partial" };
  if (verdict === "NEUTRAL") return { cls: "bg-surface-muted text-muted", Icon: MinusCircle, label: "Excluded" };
  return { cls: "bg-surface-muted text-muted", Icon: CircleDashed, label: verdict ?? "Not inspected" };
}

export function VerdictChip({ verdict }: { verdict: string | null | undefined }) {
  const { cls, Icon, label } = verdictLook(verdict);
  return (
    <span title={verdict ? `Google verdict: ${verdict}` : undefined} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** Validation status of a reason, as in Search Console: Passed green, Started blue, Failed red. */
function validationLook(v: string | null): StatusLook {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "passed") return { cls: "bg-success-soft text-success", Icon: CheckCircle2, label: "Passed" };
  if (s === "failed") return { cls: "bg-danger-soft text-danger", Icon: XCircle, label: "Failed" };
  if (s === "started" || s === "looking good") return { cls: "bg-primary-soft text-primary", Icon: PlayCircle, label: v as string };
  if (s === "not started") return { cls: "bg-surface-muted text-muted", Icon: CircleDashed, label: "Not started" };
  return { cls: "bg-surface-muted text-muted", Icon: MinusCircle, label: v && s !== "n/a" ? v : "N/A" };
}

export function ValidationChip({ value }: { value: string | null }) {
  const { cls, Icon, label } = validationLook(value);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** Says where a block's numbers come from: the two sources are never added together. */
export function SourceNote({ source, children }: { source: "gsc_export" | "url_inspection_api" | "live_http"; children?: React.ReactNode }) {
  const label = source === "gsc_export" ? "Source: Search Console Page indexing report (uploaded export)" : source === "url_inspection_api" ? "Source: Search Console URL Inspection API (Google index, tracked URLs only)" : "Source: live HTTP check by Spider (not Google’s view)";
  return (
    <p className="text-xs text-muted">
      {label}
      {children && <> · {children}</>}
    </p>
  );
}

export function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          {it.href ? (
            <Link href={it.href} className="truncate hover:text-primary">
              {it.label}
            </Link>
          ) : (
            <span className="truncate text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export interface TrendSeries {
  key: string;
  name: string;
  color: string;
}

export function TrendChart({ data, series, label }: { data: object[]; series: TrendSeries[]; label: string }) {
  if (data.length === 0) return <div className="py-12 text-center text-sm text-muted">The imported report has no chart rows.</div>;
  return (
    <div>
      <div className="h-64 w-full" role="img" aria-label={label}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" minTickGap={24} />
            <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" tickFormatter={(v: number) => formatInt(v)} width={56} allowDecimals={false} />
            <Tooltip formatter={(v) => formatInt(Number(v))} labelFormatter={(l) => String(l)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={data.length < 3} isAnimationActive={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export const thCls = "px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
export const tdCls = "px-4 py-2 align-top";
