"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { getPropertyIndexing } from "@/lib/api";
import { formatInt } from "@/lib/format";
import type { PropertyIndexing } from "@/lib/types";

/**
 * Critical Page indexing reasons of a property, in red, on its detail page (MITP-0833).
 * Uses the automatic URL Inspection data, or the imported report when nothing is inspected yet.
 * Renders nothing when there is no critical reason or the data cannot be read.
 */
export function IndexingAlert({ propertyId }: { propertyId: number }) {
  const [data, setData] = useState<PropertyIndexing | null>(null);

  useEffect(() => {
    getPropertyIndexing(propertyId).then(setData).catch(() => setData(null));
  }, [propertyId]);

  if (!data) return null;
  const live = data.live.inspected_urls > 0;
  const rows = (live ? data.live.reasons : data.reasons)
    .filter((r) => r.intent === "likely_defect" && r.group !== "indexed" && r.pages > 0)
    .sort((a, b) => b.pages - a.pages);
  if (rows.length === 0) return null;
  const total = rows.reduce((a, r) => a + r.pages, 0);
  const href = (r: (typeof rows)[number]) => (live ? `/properties/${propertyId}/indexing/urls?coverage=${encodeURIComponent(r.reason)}` : `/properties/${propertyId}/indexing/reasons/${r.reason_hash}`);

  return (
    <div className="mt-4 rounded-xl border border-danger/40 bg-danger-soft" role="alert">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 font-medium text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {formatInt(total)} page{total === 1 ? "" : "s"} not indexed for a critical reason
        </div>
        <Link href={`/properties/${propertyId}/indexing`} className="text-sm font-medium text-danger hover:underline">
          Open Page indexing
        </Link>
      </div>
      <ul className="border-t border-danger/20">
        {rows.map((r) => (
          <li key={r.reason_hash} className="border-b border-danger/10 last:border-0">
            <Link href={href(r)} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-danger/10">
              <span className="min-w-0 truncate font-medium text-danger">{r.reason}</span>
              <span className="flex shrink-0 items-center gap-2 text-danger">
                <span className="tabular font-semibold">{formatInt(r.pages)}</span>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-4 py-2 text-xs text-muted">
        {live ? `Google URL Inspection, ${formatInt(data.live.inspected_urls)} of ${formatInt(data.live.tracked_urls)} tracked URLs, last update ${data.live.last_update}.` : `Search Console export of ${data.report?.report_date ?? "—"}.`} Fix the pages, then request indexing in Search Console.
      </p>
    </div>
  );
}
