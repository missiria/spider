"use client";

import { useMemo, useState } from "react";
import { formatInt, formatPct } from "@/lib/format";
import type { DimensionBreakdown } from "@/lib/types";
import { worldPaths } from "@/lib/worldPaths";

type CountryRow = DimensionBreakdown["rows"][number];

const MAP_LEVELS = [
  "fill-border",
  "fill-primary/20",
  "fill-primary/35",
  "fill-primary/55",
  "fill-primary/75",
  "fill-primary",
];
const LEGEND_LEVELS = [
  "bg-primary/20",
  "bg-primary/35",
  "bg-primary/55",
  "bg-primary/75",
  "bg-primary",
];

function mapLevel(impressions: number, maximum: number): number {
  if (impressions <= 0 || maximum <= 0) return 0;
  return Math.max(
    1,
    Math.ceil((Math.log1p(impressions) / Math.log1p(maximum)) * 5),
  );
}

export function CountryMap({
  rows,
  selected = [],
  onSelect,
}: {
  rows: CountryRow[];
  selected?: string[];
  onSelect?: (key: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const byCountry = useMemo(
    () => new Map(rows.map((row) => [row.key.toLowerCase(), row])),
    [rows],
  );
  const selectedCountries = useMemo(
    () => new Set(selected.map((key) => key.toLowerCase())),
    [selected],
  );
  const maximum = Math.max(0, ...rows.map((row) => row.impressions));
  const activeShape = worldPaths.find((country) => country.id === activeId);
  const activeRow = activeId ? byCountry.get(activeId) : undefined;

  return (
    <div className="border-b border-border px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-sm font-medium">Performance by country</p>
          <p className="text-xs text-muted">
            Shading shows impressions. Hover or focus a country for details;
            select it to filter the page.
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-xs text-muted"
          aria-label="Impressions scale"
        >
          <span>Fewer</span>
          {LEGEND_LEVELS.map((level, index) => (
            <span
              key={index}
              className={`h-3 w-4 rounded-sm ${level}`}
              aria-hidden="true"
            />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface-muted/40">
        <svg
          viewBox="0 0 1000 500"
          className="block h-auto max-h-[460px] w-full"
          role="group"
          aria-label="World map of search performance by country"
          onMouseLeave={() => setActiveId(null)}
        >
          {worldPaths.map((country) => {
            const row = byCountry.get(country.id);
            const isSelected = selectedCountries.has(country.id);
            const level = mapLevel(row?.impressions ?? 0, maximum);
            const label = `${country.name}: ${formatInt(row?.clicks ?? 0)} clicks, ${formatInt(row?.impressions ?? 0)} impressions, ${formatPct(row?.ctr ?? 0)} CTR`;
            return (
              <path
                key={country.id}
                d={country.path}
                className={`stroke-surface stroke-[0.65] transition-colors hover:fill-primary-hover focus:fill-primary-hover focus:outline-none ${isSelected ? "fill-primary" : MAP_LEVELS[level]} ${row ? "cursor-pointer" : ""}`}
                role={row ? "button" : undefined}
                tabIndex={row ? 0 : undefined}
                aria-label={row ? label : undefined}
                aria-pressed={row ? isSelected : undefined}
                onMouseEnter={() => setActiveId(country.id)}
                onFocus={() => setActiveId(country.id)}
                onBlur={() => setActiveId(null)}
                onClick={
                  row && onSelect ? () => onSelect(country.id) : undefined
                }
                onKeyDown={
                  row && onSelect
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(country.id);
                        }
                      }
                    : undefined
                }
              >
                <title>{label}</title>
              </path>
            );
          })}
        </svg>
      </div>
      <div
        className="mt-3 grid min-h-12 grid-cols-2 items-center gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(6rem,auto))]"
        aria-live="polite"
      >
        <div className="col-span-2 min-w-0 font-medium sm:col-span-1">
          {activeShape?.name ?? "Hover over a country"}
          {activeShape && !activeRow && (
            <span className="ml-2 text-xs font-normal text-muted">
              No stored data
            </span>
          )}
        </div>
        <div className="tabular">
          <span className="mr-2 text-xs text-muted">Clicks</span>
          {activeShape ? formatInt(activeRow?.clicks ?? 0) : "—"}
        </div>
        <div className="tabular">
          <span className="mr-2 text-xs text-muted">Impr.</span>
          {activeShape ? formatInt(activeRow?.impressions ?? 0) : "—"}
        </div>
        <div className="tabular">
          <span className="mr-2 text-xs text-muted">CTR</span>
          {activeShape ? formatPct(activeRow?.ctr ?? 0) : "—"}
        </div>
      </div>
    </div>
  );
}
