"use client";

import Link from "next/link";
import { formatInt } from "@/lib/format";

/**
 * Small dependency-free charts for the indexing pages (MITP-0833). Each takes plain rows, so a
 * later AI summary or another page can feed them the same data the API returns.
 */

/** Horizontal bars, one per reason: red for critical reasons, grey for the others. */
export function ReasonBars({ rows, href, empty }: { rows: { reason: string; pages: number; critical: boolean }[]; href?: (reason: string) => string; empty: string }) {
  const shown = rows.filter((r) => r.pages > 0);
  if (shown.length === 0) return <div className="py-8 text-center text-sm text-muted">{empty}</div>;
  const max = Math.max(...shown.map((r) => r.pages));
  return (
    <ul className="space-y-2">
      {shown.map((r) => {
        const label = (
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className={`min-w-0 truncate ${r.critical ? "font-medium text-danger" : ""}`}>{r.reason}</span>
            <span className={`tabular shrink-0 font-medium ${r.critical ? "text-danger" : ""}`}>{formatInt(r.pages)}</span>
          </span>
        );
        return (
          <li key={r.reason}>
            {href ? (
              <Link href={href(r.reason)} className="block hover:opacity-80">
                {label}
              </Link>
            ) : (
              label
            )}
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
              <div className={`h-full rounded-full ${r.critical ? "bg-danger" : "bg-[var(--chart-secondary)]"}`} style={{ width: `${Math.max(2, (r.pages / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One bar split in indexed (green), critical (red) and other not indexed (grey). */
export function SplitBar({ indexed, critical, other, className = "h-2.5" }: { indexed: number; critical: number; other: number; className?: string }) {
  const total = indexed + critical + other;
  if (total === 0) return <div className={`${className} w-full rounded-full bg-surface-muted`} aria-hidden />;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className={`${className} flex w-full overflow-hidden rounded-full bg-surface-muted`} role="img" aria-label={`${formatInt(indexed)} indexed, ${formatInt(critical)} critical, ${formatInt(other)} other not indexed`}>
      <div className="bg-success" style={{ width: pct(indexed) }} />
      <div className="bg-danger" style={{ width: pct(critical) }} />
      <div className="bg-[var(--chart-secondary)]" style={{ width: pct(other) }} />
    </div>
  );
}

/** Ring showing the share of indexed pages. */
export function IndexRing({ indexed, total, size = 132 }: { indexed: number; total: number; size?: number }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? indexed / total : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(share * 100)}% of inspected pages are indexed`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="12" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--success)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-2xl font-semibold">{total > 0 ? `${Math.round(share * 100)}%` : "—"}</span>
        <span className="text-xs text-muted">indexed</span>
      </div>
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-success" aria-hidden />Indexed</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-danger" aria-hidden />Critical (needs a fix)</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--chart-secondary)]" aria-hidden />Other not indexed (usually intended)</span>
    </div>
  );
}
