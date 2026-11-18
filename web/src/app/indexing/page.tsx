"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Banner, tdCls, thCls } from "@/components/indexing/parts";
import { Card, DeltaBadge, EmptyState, ErrorBox, KpiCard, Spinner } from "@/components/ui";
import { errorMessage, getIndexingFleet } from "@/lib/api";
import { formatDate, formatDateTime, formatInt } from "@/lib/format";
import { ratioDelta, STOP_REASON_LABELS } from "@/lib/indexing";
import type { IndexingFleet } from "@/lib/types";

export default function IndexingFleetPage() {
  const [data, setData] = useState<IndexingFleet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIndexingFleet().then(setData).catch((err) => setError(errorMessage(err)));
  }, []);

  const totals = useMemo(() => {
    const withReport = (data?.items ?? []).filter((r) => r.report_date);
    return {
      withReport: withReport.length,
      indexed: withReport.reduce((a, r) => a + (r.indexed ?? 0), 0),
      notIndexed: withReport.reduce((a, r) => a + (r.not_indexed ?? 0), 0),
      defects: withReport.reduce((a, r) => a + r.defect_pages, 0),
      stale: withReport.filter((r) => r.stale).length,
      inspected: (data?.items ?? []).reduce((a, r) => a + r.inspected_urls, 0),
    };
  }, [data]);

  const missing = data ? data.items.length - totals.withReport : 0;

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Page indexing</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Indexed and not-indexed pages per property, from the Search Console Page indexing report you upload, plus URL Inspection results for tracked URLs. Google has no API for the full report, so report numbers are as recent as the last export.
        </p>
      </div>

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!data && !error && <Spinner />}

      {data && data.items.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No properties yet">Add a Search Console property first.</EmptyState>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Indexed pages" value={formatInt(totals.indexed)} hint={`${totals.withReport} of ${data.items.length} properties have a report`} />
            <KpiCard label="Not indexed" value={formatInt(totals.notIndexed)} hint="all reasons, intentional ones included" />
            <KpiCard label="Likely defects" value={formatInt(totals.defects)} hint="pages under a reason classified as a defect" />
            <KpiCard label="URLs inspected" value={formatInt(totals.inspected)} hint="URL Inspection API, latest result per URL" />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {missing > 0 && (
              <Banner title={`${missing} ${missing === 1 ? "property has" : "properties have"} no Page indexing report yet.`}>
                Open the property and upload the export from Search Console → Indexing → Pages → Export. Totals above only count properties with a report.
              </Banner>
            )}
            {totals.stale > 0 && (
              <Banner tone="warning" title={`${totals.stale} ${totals.stale === 1 ? "report is" : "reports are"} older than ${data.stale_days} days.`}>
                Upload a fresh export to keep counts and alerts current.
              </Banner>
            )}
          </div>

          <Card className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={thCls}>Property</th>
                  <th className={`${thCls} text-right`}>Indexed</th>
                  <th className={`${thCls} text-right`}>Not indexed</th>
                  <th className={thCls}>Top likely defect</th>
                  <th className={thCls}>Report date</th>
                  <th className={`${thCls} text-right`}>Inspected URLs</th>
                  <th className={thCls}>Last inspection run</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.property.id} className="border-b border-border/60 last:border-0">
                    <td className={tdCls}>
                      <Link href={`/properties/${r.property.id}/indexing`} className="font-medium hover:text-primary">
                        {r.property.display_name}
                      </Link>
                      <div className="text-xs text-muted">{r.property.site_url}</div>
                    </td>
                    <td className={`${tdCls} tabular text-right`}>
                      {r.indexed === null ? "—" : formatInt(r.indexed)}
                      {ratioDelta(r.indexed, r.previous_indexed) !== null && (
                        <div className="mt-0.5"><DeltaBadge value={ratioDelta(r.indexed, r.previous_indexed)} /></div>
                      )}
                    </td>
                    <td className={`${tdCls} tabular text-right`}>
                      {r.not_indexed === null ? "—" : formatInt(r.not_indexed)}
                      {ratioDelta(r.not_indexed, r.previous_not_indexed) !== null && (
                        <div className="mt-0.5"><DeltaBadge value={ratioDelta(r.not_indexed, r.previous_not_indexed)} lowerIsBetter /></div>
                      )}
                    </td>
                    <td className={tdCls}>
                      {r.top_defect ? (
                        <Link href={`/properties/${r.property.id}/indexing/reasons/${r.top_defect.reason_hash}`} className="hover:text-primary">
                          {r.top_defect.reason} <span className="tabular text-muted">· {formatInt(r.top_defect.pages)}</span>
                        </Link>
                      ) : r.report_date ? (
                        <span className="text-muted">None</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {r.report_date ? (
                        <>
                          <span className="tabular">{r.report_date}</span>
                          {r.stale && <span className="ml-2 rounded-md bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning">Stale</span>}
                        </>
                      ) : (
                        <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-xs text-muted">No report</span>
                      )}
                    </td>
                    <td className={`${tdCls} tabular text-right`}>
                      {r.inspected_urls ? (
                        <>
                          {formatInt(r.inspected_urls)}
                          <div className="text-xs text-muted">{formatInt(r.indexed_urls)} indexed</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={tdCls}>
                      {r.last_inspection_run ? (
                        <>
                          <span title={formatDateTime(r.last_inspection_run)}>{formatDate(r.last_inspection_run)}</span>
                          {r.last_run_status === "partial" && <span className="ml-2 rounded-md bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning" title={r.stop_reason ? STOP_REASON_LABELS[r.stop_reason] : undefined}>{r.stop_reason === "permission_denied" ? "No access" : r.stop_reason === "quota" ? "Quota" : "Partial"}</span>}
                          {r.last_run_status === "failed" && <span className="ml-2 rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">Failed</span>}
                          {r.last_run_status === "running" && <span className="ml-2 rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">Running</span>}
                        </>
                      ) : (
                        <span className="text-muted">Never</span>
                      )}
                      {r.sitemaps === 0 && r.last_inspection_run && <div className="text-xs text-warning">No sitemap submitted in Search Console</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-xs text-muted">
            Report columns: “All known pages” view of each property’s latest uploaded export. Inspection columns: Spider’s tracked URLs only (sitemaps and pages with impressions), not Google’s full list of known pages.
          </p>
        </>
      )}
    </AppShell>
  );
}
