"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatInt, shortDate } from "@/lib/format";
import type { FleetSeries } from "@/lib/types";

const PALETTE = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#e11d48", "#7c3aed", "#0ea5e9", "#16a34a", "#f59e0b", "#db2777", "#6366f1", "#14b8a6", "#f97316", "#84cc16", "#a855f7", "#64748b"];

export function FleetChart({ series, topIds }: { series: FleetSeries; topIds: number[] }) {
  // default: fleet total + the top 5 properties by clicks; others toggle on via legend
  const [visible, setVisible] = useState<Set<string>>(() => new Set(["total", ...topIds.slice(0, 5).map(String)]));

  const lines = useMemo(
    () => [
      { key: "total", name: "Fleet total", color: "var(--chart-total)", width: 2.5 },
      ...series.properties.map((p, i) => ({ key: String(p.id), name: p.display_name, color: PALETTE[i % PALETTE.length], width: 1.5 })),
    ],
    [series.properties],
  );

  const toggle = (key: string) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (series.points.length === 0) {
    return <div className="py-16 text-center text-sm text-muted">No daily data in this period yet.</div>;
  }

  return (
    <div>
      <div className="h-72 w-full" role="img" aria-label="Daily clicks per property">
        <ResponsiveContainer>
          <LineChart data={series.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" minTickGap={24} />
            <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" tickFormatter={(v: number) => formatInt(v)} width={48} />
            <Tooltip formatter={(v) => formatInt(Number(v))} labelFormatter={(l) => String(l)} />
            <Legend content={() => null} />
            {lines
              .filter((l) => visible.has(l.key))
              .map((l) => (
                <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={l.width} dot={false} isAnimationActive={false} connectNulls />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Toggle series">
        {lines.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => toggle(l.key)}
            aria-pressed={visible.has(l.key)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${
              visible.has(l.key) ? "border-border bg-surface" : "border-transparent bg-surface-muted text-muted line-through"
            }`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} aria-hidden />
            {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}
