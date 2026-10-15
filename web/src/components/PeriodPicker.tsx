"use client";

import { useEffect, useState } from "react";
import { isValidCustom, type PeriodSelection } from "@/lib/period";
import type { Period } from "@/lib/types";

export const PRESETS = [7, 28, 90] as const;

export function PeriodPicker({
  value,
  onChange,
  period,
  previous,
}: {
  value: PeriodSelection;
  onChange: (p: PeriodSelection) => void;
  period?: Period;
  previous?: Period;
}) {
  const [start, setStart] = useState(value.kind === "custom" ? value.start : (period?.start ?? ""));
  const [end, setEnd] = useState(value.kind === "custom" ? value.end : (period?.end ?? ""));
  const custom = value.kind === "custom";

  // inputs follow the selection: a custom value directly, a preset via the resolved period
  useEffect(() => {
    if (value.kind === "custom") {
      setStart(value.start);
      setEnd(value.end);
    } else if (period) {
      setStart(period.start);
      setEnd(period.end);
    }
  }, [value, period]);

  const valid = isValidCustom(start, end);
  const apply = () => {
    if (valid) onChange({ kind: "custom", start, end });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border border-border bg-surface p-0.5" role="group" aria-label="Period">
        {PRESETS.map((d) => {
          const active = value.kind === "preset" && value.days === d;
          return (
            <button key={d} type="button" onClick={() => onChange({ kind: "preset", days: d })} aria-pressed={active} className={`rounded px-3 py-1 text-sm ${active ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>
              {d}d
            </button>
          );
        })}
        <span className={`rounded px-3 py-1 text-sm ${custom ? "bg-primary text-white" : "text-muted"}`} aria-pressed={custom} role="button" tabIndex={-1}>
          Custom
        </span>
      </div>
      <form
        className="flex items-center gap-1 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        aria-label="Custom date range"
      >
        <input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} aria-label="Start date" className="rounded-md border border-border px-2 py-1 outline-none focus:border-primary" />
        <span className="text-muted">→</span>
        <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} aria-label="End date" className="rounded-md border border-border px-2 py-1 outline-none focus:border-primary" />
        <button type="submit" disabled={!valid || (custom && start === value.start && end === value.end)} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50">
          Apply
        </button>
      </form>
      {period && previous && (
        <div className="text-xs text-muted">
          vs <span className="tabular">{previous.start}</span> → <span className="tabular">{previous.end}</span>
        </div>
      )}
    </div>
  );
}
