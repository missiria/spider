"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ChartLegend, IndexRing, ReasonBars, SplitBar } from "@/components/indexing/charts";
import { Banner, tdCls, thCls } from "@/components/indexing/parts";
import { Button, Card, EmptyState, ErrorBox, KpiCard, Spinner } from "@/components/ui";
import { errorMessage, getIndexingFleet, refreshAllIndexing } from "@/lib/api";
import { formatDate, formatDateTime, formatInt } from "@/lib/format";
import { STOP_REASON_LABELS } from "@/lib/indexing";
import type { IndexingFleet } from "@/lib/types";

export default function IndexingFleetPage() {
  const [data, setData] = useState<IndexingFleet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getIndexingFleet());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // follow a refresh in progress (all properties, or one started from its own page)
  const busy = !!data && (data.batch !== null || data.items.some((r) => r.running));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [busy, load]);

  const refreshAll = async () => {
    setStarting(true);
    try {
      const r = await refreshAllIndexing();
      toast.info(`Refresh started for ${r.properties} properties. They run one after the other.`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const totals = useMemo(() => {
    const items = data?.items ?? [];
    const withData = items.filter((r) => r.live);
    return {
      withData: withData.length,
      indexed: withData.reduce((a, r) => a + (r.live?.indexed ?? 0), 0),
      notIndexed: withData.reduce((a, r) => a + (r.live?.not_indexed ?? 0), 0),
      critical: withData.reduce((a, r) => a + (r.live?.critical ?? 0), 0),
      tracked: items.reduce((a, r) => a + r.tracked_urls, 0),
      inspected: items.reduce((a, r) => a + r.inspected_urls, 0),
    };
  }, [data]);

  // most critical first, then the properties still waiting for their first inspection
  const rows = useMemo(() => [...(data?.items ?? [])].sort((a, b) => Number(!!b.live) - Number(!!a.live) || (b.live?.critical ?? 0) - (a.live?.critical ?? 0) || (b.live?.not_indexed ?? 0) - (a.live?.not_indexed ?? 0) || a.property.display_name.localeCompare(b.property.display_name)), [data]);
  const waiting = data ? data.items.length - totals.withData : 0;

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Page indexing</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">What Google says about the pages of every property: indexed, not indexed and why. Filled automatically from Google’s URL Inspection for the URLs in your sitemaps and the pages that get impressions.</p>
        </div>
        {data && data.items.length > 0 && (
          <div className="text-right">
            <Button onClick={refreshAll} disabled={starting || data.batch !== null}>
              <RefreshCw className={`h-4 w-4 ${data.batch ? "animate-spin" : ""}`} aria-hidden />
              {data.batch ? `Refreshing ${Math.min(data.batch.done + 1, data.batch.total)} of ${data.batch.total}…` : "Refresh all properties"}
            </Button>
            <div className="mt-1 text-xs text-muted">Up to {formatInt(data.daily_budget)} URL inspections per property per day. Also runs daily at 05:00.</div>
          </div>
        )}
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
          {waiting > 0 && (
            <div className="mt-4">
              <Banner tone={totals.withData === 0 ? "warning" : "info"} title={`${waiting} of ${data.items.length} properties have not been inspected yet.`}>
                {data.batch ? "The refresh in progress is filling them one after the other; this page updates by itself." : "Click “Refresh all properties”. Totals below only count the properties already inspected."}
              </Banner>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Indexed pages" value={formatInt(totals.indexed)} hint={`${totals.withData} of ${data.items.length} properties inspected`} />
            <KpiCard label="Not indexed" value={formatInt(totals.notIndexed)} hint="all reasons, intended ones included" />
            <Card className={`p-4 ${totals.critical > 0 ? "border-danger/40 bg-danger-soft" : ""}`}>
              <div className={`text-xs font-medium uppercase tracking-wide ${totals.critical > 0 ? "text-danger" : "text-muted"}`}>Critical</div>
              <div className={`tabular mt-1 text-2xl font-semibold ${totals.critical > 0 ? "text-danger" : ""}`}>{formatInt(totals.critical)}</div>
              <div className="mt-1 text-xs text-muted">pages Google could not index because of an error or a quality signal</div>
            </Card>
            <KpiCard label="URLs inspected" value={`${formatInt(totals.inspected)} / ${formatInt(totals.tracked)}`} hint="inspected / tracked (sitemaps + pages with impressions)" />
          </div>

          {totals.withData > 0 && (
            <div className="mt-6 grid gap-6 lg:grid-cols-5">
              <Card className="p-4 lg:col-span-2">
                <h2 className="font-medium">Index rate</h2>
                <div className="mt-4 flex items-center gap-5">
                  <IndexRing indexed={totals.indexed} total={totals.indexed + totals.notIndexed} />
                  <div className="min-w-0 flex-1 space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><span className="text-muted">Indexed</span><span className="tabular font-medium text-success">{formatInt(totals.indexed)}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted">Critical</span><span className="tabular font-medium text-danger">{formatInt(totals.critical)}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted">Other not indexed</span><span className="tabular font-medium">{formatInt(totals.notIndexed - totals.critical)}</span></div>
                    <SplitBar indexed={totals.indexed} critical={totals.critical} other={totals.notIndexed - totals.critical} />
                  </div>
                </div>
              </Card>
              <Card className="p-4 lg:col-span-3">
                <h2 className="font-medium">Why pages aren’t indexed, all properties</h2>
                <p className="mb-3 text-xs text-muted">Red = needs a fix. Grey = usually intended (redirects, noindex, canonical).</p>
                <ReasonBars rows={data.reasons.map((r) => ({ reason: r.reason, pages: r.pages, critical: r.intent === "likely_defect" }))} empty="Every inspected page is indexed." />
              </Card>
            </div>
          )}

          <Card className="mt-6 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="font-medium">Per property</h2>
              <ChartLegend />
            </div>
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={thCls}>Property</th>
                  <th className={`${thCls} w-[22%]`}>Pages</th>
                  <th className={`${thCls} text-right`}>Indexed</th>
                  <th className={`${thCls} text-right`}>Not indexed</th>
                  <th className={`${thCls} text-right`}>Critical</th>
                  <th className={thCls}>Top critical reason</th>
                  <th className={thCls}>Inspected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.property.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className={tdCls}>
                      <Link href={`/properties/${r.property.id}/indexing`} className="font-medium hover:text-primary">
                        {r.property.display_name}
                      </Link>
                      <div className="text-xs text-muted">{r.property.site_url}</div>
                    </td>
                    {r.live ? (
                      <>
                        <td className={`${tdCls} align-middle`}>
                          <SplitBar indexed={r.live.indexed} critical={r.live.critical} other={r.live.not_indexed - r.live.critical} />
                        </td>
                        <td className={`${tdCls} tabular text-right`}>{formatInt(r.live.indexed)}</td>
                        <td className={`${tdCls} tabular text-right`}>{formatInt(r.live.not_indexed)}</td>
                        <td className={`${tdCls} tabular text-right font-semibold ${r.live.critical > 0 ? "text-danger" : "text-muted"}`}>{formatInt(r.live.critical)}</td>
                        <td className={tdCls}>
                          {r.live.top_critical ? (
                            <Link href={`/properties/${r.property.id}/indexing/urls?coverage=${encodeURIComponent(r.live.top_critical.reason)}`} className="text-danger hover:underline">
                              {r.live.top_critical.reason} <span className="tabular">· {formatInt(r.live.top_critical.pages)}</span>
                            </Link>
                          ) : (
                            <span className="text-success">None</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td className={`${tdCls} text-muted`} colSpan={5}>
                        {r.running ? "First inspection in progress…" : "Not inspected yet. Use Refresh all properties, or open the property and click Refresh now."}
                      </td>
                    )}
                    <td className={tdCls}>
                      {r.running ? (
                        <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">Running…</span>
                      ) : r.last_inspection_run ? (
                        <>
                          <span className="tabular">{formatInt(r.inspected_urls)} / {formatInt(r.tracked_urls)}</span>
                          <div className="text-xs text-muted" title={formatDateTime(r.last_inspection_run)}>
                            {formatDate(r.last_inspection_run)}
                            {r.last_run_status === "partial" && <span className="ml-1 text-warning" title={r.stop_reason ? STOP_REASON_LABELS[r.stop_reason] : undefined}>· {r.stop_reason === "permission_denied" ? "no access" : r.stop_reason === "quota" ? "quota reached" : "partial"}</span>}
                            {r.last_run_status === "failed" && <span className="ml-1 text-danger">· failed</span>}
                          </div>
                          {r.sitemaps === 0 && <div className="text-xs text-warning">No sitemap in Search Console</div>}
                        </>
                      ) : (
                        <span className="text-muted">Never</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-xs text-muted">
            Source: Google URL Inspection API, latest result per tracked URL. Tracked URLs are not every page Google knows, so Search Console’s own totals can be higher. Upload a Search Console export on a property’s page to see Google’s full report and validation status.
          </p>
        </>
      )}
    </AppShell>
  );
}
