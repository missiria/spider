"use client";

import type { Period } from "@/lib/types";

export const PRESETS = [7, 28, 90] as const;

export function PeriodPicker({
  days,
  onChange,
  period,
  previous,
}: {
  days: number;
  onChange: (days: number) => void;
  period?: Period;
  previous?: Period;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border border-border bg-surface p-0.5" role="group" aria-label="Period">
        {PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={days === d}
            className={`rounded px-3 py-1 text-sm ${days === d ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}
          >
            {d}d
          </button>
        ))}
      </div>
      {period && (
        <div className="text-xs text-muted">
          <span className="tabular">{period.start}</span> → <span className="tabular">{period.end}</span>
          {previous && (
            <>
              {" "}
              vs <span className="tabular">{previous.start}</span> → <span className="tabular">{previous.end}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
