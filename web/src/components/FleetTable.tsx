"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { formatDate, formatInt, formatPct, formatPosition } from "@/lib/format";
import { applyTableState, DEFAULT_TABLE_STATE, toggleSort, type SortKey, type TableState } from "@/lib/table";
import type { PropertyKpi, PropertyStatus } from "@/lib/types";
import { DeltaBadge, StatusChip } from "./ui";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; title?: string }[] = [
  { key: "display_name", label: "Site", align: "left" },
  { key: "clicks", label: "Clicks", align: "right" },
  { key: "clicks_delta", label: "Δ", align: "right", title: "Clicks vs previous period" },
  { key: "impressions", label: "Impressions", align: "right" },
  { key: "impressions_delta", label: "Δ", align: "right", title: "Impressions vs previous period" },
  { key: "ctr", label: "CTR", align: "right" },
  { key: "position", label: "Position", align: "right", title: "Impressions-weighted average position (lower is better)" },
  { key: "position_delta", label: "Δ", align: "right", title: "Position vs previous period (green = improved)" },
  { key: "data_since", label: "Data since", align: "left" },
  { key: "status", label: "Status", align: "left" },
];

const STATUS_OPTIONS: { value: PropertyStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "connected", label: "Connected" },
  { value: "pending", label: "Pending access" },
  { value: "revoked", label: "Access revoked" },
  { value: "error", label: "Error" },
];

export function FleetTable({ items }: { items: PropertyKpi[] }) {
  const [state, setState] = useState<TableState>(DEFAULT_TABLE_STATE);
  const rows = useMemo(() => applyTableState(items, state), [items, state]);

  const header = (col: (typeof COLUMNS)[number]) => {
    const active = state.sortKey === col.key;
    const Icon = active ? (state.sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th key={col.key} scope="col" className={`px-3 py-2 font-medium ${col.align === "right" ? "text-right" : "text-left"}`} aria-sort={active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          title={col.title}
          onClick={() => setState((s) => toggleSort(s, col.key))}
          className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""} ${col.align === "right" ? "flex-row-reverse" : ""}`}
        >
          {col.label}
          <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 text-sm">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={state.search}
            onChange={(e) => setState((s) => ({ ...s, search: e.target.value }))}
            placeholder="Filter sites…"
            aria-label="Filter sites"
            className="w-56 rounded-md border border-border py-1.5 pl-8 pr-2 outline-none focus:border-primary"
          />
        </label>
        <select
          value={state.status}
          onChange={(e) => setState((s) => ({ ...s, status: e.target.value as TableState["status"] }))}
          aria-label="Filter by status"
          className="rounded-md border border-border bg-surface px-2 py-1.5 outline-none focus:border-primary"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" checked={state.hideEmpty} onChange={(e) => setState((s) => ({ ...s, hideEmpty: e.target.checked }))} className="accent-primary" />
          Hide sites with no traffic
        </label>
        <span className="ml-auto text-xs text-muted">
          {rows.length} of {items.length} sites
          {(state.search || state.status !== "all" || state.hideEmpty) && (
            <button type="button" onClick={() => setState((s) => ({ ...DEFAULT_TABLE_STATE, sortKey: s.sortKey, sortDir: s.sortDir }))} className="ml-2 text-primary hover:underline">
              Clear filters
            </button>
          )}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">{COLUMNS.map(header)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-muted">
                  No site matches these filters.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border/60 hover:bg-surface-muted/60">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/properties/${p.id}`} className="hover:text-primary">
                    {p.display_name}
                  </Link>
                </td>
                <td className="tabular px-3 py-2 text-right">{formatInt(p.current.clicks)}</td>
                <td className="px-3 py-2 text-right">
                  <DeltaBadge value={p.delta.clicks} />
                </td>
                <td className="tabular px-3 py-2 text-right">{formatInt(p.current.impressions)}</td>
                <td className="px-3 py-2 text-right">
                  <DeltaBadge value={p.delta.impressions} />
                </td>
                <td className="tabular px-3 py-2 text-right">{formatPct(p.current.ctr)}</td>
                <td className="tabular px-3 py-2 text-right">{formatPosition(p.current.position)}</td>
                <td className="px-3 py-2 text-right">
                  <DeltaBadge value={p.delta.position} lowerIsBetter />
                </td>
                <td className="tabular px-3 py-2 text-muted">{formatDate(p.data_since)}</td>
                <td className="px-3 py-2">
                  <StatusChip status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
