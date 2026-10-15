"use client";

import Link from "next/link";
import { formatDate, formatInt, formatPct, formatPosition } from "@/lib/format";
import type { PropertyKpi } from "@/lib/types";
import { DeltaBadge, StatusChip } from "./ui";

export function FleetTable({ items }: { items: PropertyKpi[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-medium">Site</th>
            <th className="px-3 py-2 text-right font-medium">Clicks</th>
            <th className="px-3 py-2 text-right font-medium">Δ</th>
            <th className="px-3 py-2 text-right font-medium">Impressions</th>
            <th className="px-3 py-2 text-right font-medium">Δ</th>
            <th className="px-3 py-2 text-right font-medium">CTR</th>
            <th className="px-3 py-2 text-right font-medium">Position</th>
            <th className="px-3 py-2 text-right font-medium">Δ</th>
            <th className="px-3 py-2 font-medium">Data since</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
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
  );
}
