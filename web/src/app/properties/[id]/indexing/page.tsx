"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ExternalLink, RefreshCw, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GscReport } from "@/components/indexing/GscReport";
import { Banner, Crumbs, SourceNote, tdCls, thCls } from "@/components/indexing/parts";
import { Button, Card, ErrorBox, KpiCard, Spinner } from "@/components/ui";
import { deleteIndexingImport, errorMessage, getPropertyIndexing, propertyExportUrl, refreshIndexing, uploadIndexingExport } from "@/lib/api";
import { formatDate, formatDateTime, formatInt } from "@/lib/format";
import { ALL_KNOWN, scopeFromKey, scopeFromSearch, scopeKey, scopeLabel, scopeQuery, STOP_REASON_LABELS } from "@/lib/indexing";
import type { IndexingImportResult, IndexingScopeRef, PropertyIndexing } from "@/lib/types";


export default function PropertyIndexingPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [scope, setScope] = useState<IndexingScopeRef | null>(null);
  const [data, setData] = useState<PropertyIndexing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<IndexingImportResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // "live" = rebuilt from URL Inspection (automatic); "export" = an uploaded Search Console report
  const [mode, setMode] = useState<"live" | "export">("live");
  const fileRef = useRef<HTMLInputElement>(null);

  // the scope lives in the URL so a link to this page always shows the same view
  useEffect(() => {
    setScope(scopeFromSearch(window.location.search));
  }, []);

  const firstLoad = useRef(true);
  const load = useCallback(async () => {
    if (!scope) return;
    try {
      const next = await getPropertyIndexing(id, scope);
      // open on the imported report only when nothing has been inspected yet, or the link asks for a view
      if (firstLoad.current) {
        firstLoad.current = false;
        if ((next.live.inspected_urls === 0 && next.report) || scope.scope !== "all_known") setMode("export");
      }
      setData(next);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  // poll while a refresh runs in the background
  const running = data?.inspection.running ?? false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [running, load]);

  const changeScope = (next: IndexingScopeRef) => {
    setScope(next);
    window.history.replaceState(null, "", `${window.location.pathname}${scopeQuery(next)}`);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      let last: IndexingImportResult | null = null;
      for (const file of Array.from(files)) {
        try {
          last = await uploadIndexingExport(id, file);
        } catch (err) {
          throw new Error(`${file.name}: ${errorMessage(err)}`);
        }
      }
      setLastImport(last);
      setMode("export");
      toast.success(files.length === 1 ? "Export imported" : `${files.length} exports imported`);
      // show the view that was just uploaded
      if (last && last.import.report_kind === "overview") changeScope({ scope: last.import.scope, scope_detail: last.import.scope_detail });
      else await load();
    } catch (err) {
      setUploadError(errorMessage(err));
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshIndexing(id);
      toast.info("Refresh started: sitemaps, URL inventory, then inspections.");
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const removeImport = async (importId: number) => {
    if (!window.confirm("Delete this import? Its counts, trend rows and examples are removed.")) return;
    try {
      await deleteIndexingImport(id, importId);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const q = scope ? scopeQuery(scope) : "";
  const insp = data?.inspection;
  const run = insp?.last_run ?? null;
  const partialExamples = data?.imports.some((i) => i.examples_partial) ?? false;
  const scopeOptions = data ? [ALL_KNOWN, ...data.scopes.filter((s) => s.scope !== "all_known")] : [ALL_KNOWN];
  // a scope from the URL that has no import yet still appears in the selector
  if (scope && !scopeOptions.some((s) => scopeKey(s) === scopeKey(scope))) scopeOptions.push(scope);

  return (
    <AppShell>
      <Crumbs items={[{ href: "/indexing", label: "Page indexing" }, { href: `/properties/${id}`, label: data?.property.display_name ?? "Property" }, { label: "Indexing" }]} />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Page indexing</h1>
          <p className="mt-1 text-sm text-muted">{data?.property.site_url ?? " "}</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-surface p-0.5" role="group" aria-label="Data source">
            {([["live", "Automatic"], ["export", "Imported report"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} className={`rounded px-3 py-1 text-sm ${mode === value ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
          <label className={`min-w-0 max-w-full text-sm ${mode === "export" ? "" : "hidden"}`}>
            <span className="sr-only">Report view</span>
            <select value={scope ? scopeKey(scope) : scopeKey(ALL_KNOWN)} onChange={(e) => changeScope(scopeFromKey(e.target.value))} className="w-full max-w-[18rem] rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary">
              {scopeOptions.map((s) => (
                <option key={scopeKey(s)} value={scopeKey(s)}>
                  {scopeLabel(s)}
                </option>
              ))}
            </select>
          </label>
          {data && (
            <a href={data.links.search_console} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Search Console <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
          {mode === "export" && data?.report && scope && (
            <a href={propertyExportUrl(id, "csv", "indexing", { scope: scope.scope, sitemap: scope.scope_detail ?? undefined })} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Export CSV
            </a>
          )}
        </div>
      </div>

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!data && !error && <Spinner />}

      {data && scope && (
        <>
          <div className="mt-4 flex flex-col gap-2">
            {mode === "export" && !data.report && (
              <Banner title={`No Page indexing report imported for “${scopeLabel(scope)}”.`}>
                In Search Console open Indexing → Pages{scope.scope !== "all_known" ? ", choose this view in the top-left filter" : ""}, click Export → Download CSV, and upload the ZIP below. Google offers no API for this report.
              </Banner>
            )}
            {mode === "export" && data.report?.stale && (
              <Banner tone="warning" title={`This report is ${data.report.days_old} days old (${data.report.report_date}).`}>
                Counts, deltas and alerts reflect that date. Upload a fresh export.
              </Banner>
            )}
            {mode === "export" && partialExamples && (
              <Banner title="Some example lists are partial.">
                Search Console exports at most 1,000 example URLs per reason. Page counts are complete; example lists are not.
              </Banner>
            )}
            {run?.stop_reason === "permission_denied" && (
              <Banner tone="danger" title="Search Console refused access during the last refresh.">
                Check that the service account still has access to this property. Earlier inspection results are kept.
              </Banner>
            )}
            {run?.stop_reason === "quota" && (
              <Banner tone="warning" title="The last refresh stopped at the URL Inspection quota.">
                {formatInt(insp?.used_today ?? 0)} of {formatInt(insp?.daily_budget ?? 0)} inspections used today. The remaining URLs are inspected on the next runs.
              </Banner>
            )}
            {run?.status === "failed" && (
              <Banner tone="danger" title="The last refresh failed.">{run.error ?? "No error message recorded."}</Banner>
            )}
          </div>

          {mode === "live" ? (
            data.live.inspected_urls === 0 ? (
              <Card className="mt-4 p-8 text-center">
                <div className="text-lg font-medium">No URL inspected yet</div>
                <p className="mt-2 text-sm text-muted">Click “Refresh now” below: Spider reads the sitemaps from Search Console and asks Google for the index status of each URL. It then runs every day at 05:00.</p>
              </Card>
            ) : (
              <GscReport
                lastUpdate={data.live.last_update}
                totals={data.live.totals}
                trend={data.live.trend}
                reasons={data.live.reasons}
                reasonHref={(r) => `/properties/${id}/indexing/urls?coverage=${encodeURIComponent(r.reason)}`}
                indexedHref={`/properties/${id}/indexing/urls?verdict=PASS`}
                footnote={<>Automatic · Google URL Inspection API · {formatInt(data.live.inspected_urls)} of {formatInt(data.live.tracked_urls)} tracked URLs inspected (sitemaps and pages with impressions). Search Console’s own report can list more pages, for example noindex or redirected URLs that are in no sitemap.</>}
                validationNote="Validation status is not available from Google’s API: it appears here only in an imported Search Console export."
              />
            )
          ) : data.report ? (
            <GscReport
              lastUpdate={data.report.report_date}
              totals={data.totals}
              trend={data.trend}
              reasons={data.reasons.map((r) => ({ ...r, trend: r.trend ?? [] }))}
              reasonHref={(r) => `/properties/${id}/indexing/reasons/${r.reason_hash}${q}`}
              footnote={<>Search Console Page indexing report (uploaded export) · view “{scopeLabel(scope)}” · file {data.report.filename}. Trend = pages in each imported report.</>}
            />
          ) : null}

          <Card className="mt-6 p-4">
            <h2 className="font-medium">Import a Search Console export</h2>
            <p className="mt-1 text-sm text-muted">
              Upload the ZIP (or CSV) from Indexing → Pages → Export. Use the main report for totals, reasons and the chart, and a reason’s own page for its example URLs. Uploading the same report again replaces it.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input ref={fileRef} id="indexing-file" type="file" multiple accept=".zip,.csv,application/zip,text/csv" className="sr-only" onChange={(e) => void upload(e.target.files)} />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4" aria-hidden />
                {uploading ? "Importing…" : "Choose files"}
              </Button>
              <span className="min-w-0 break-words text-xs text-muted">ZIP or CSV, 15 MB max per file. The export must be for {data.property.site_url}.</span>
            </div>
            {uploadError && <div className="mt-3"><ErrorBox message={uploadError} /></div>}
            {lastImport && !uploadError && (
              <div className="mt-3 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success" role="status">
                {lastImport.replaced ? "Replaced" : "Imported"} {lastImport.import.report_kind === "issue" ? `examples for “${lastImport.import.issue_reason}”` : `the ${scopeLabel(lastImport.import).toLowerCase()} report`} of {lastImport.import.report_date}: {formatInt(lastImport.import.reason_rows)} reasons, {formatInt(lastImport.import.trend_rows)} chart rows, {formatInt(lastImport.import.example_rows)} example URLs{lastImport.import.examples_partial ? " (partial: 1,000-row export limit)" : ""}.
                {lastImport.opportunities && <> Opportunities: {lastImport.opportunities.created} new, {lastImport.opportunities.updated} refreshed.</>}
              </div>
            )}
            {data.imports.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={thCls}>Report date</th>
                      <th className={thCls}>Content</th>
                      <th className={thCls}>View</th>
                      <th className={thCls}>File</th>
                      <th className={thCls}>Imported</th>
                      <th className={thCls}><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.imports.map((i) => (
                      <tr key={i.id} className="border-b border-border/60 last:border-0">
                        <td className={`${tdCls} tabular`}>{i.report_date}</td>
                        <td className={tdCls}>
                          {i.report_kind === "overview" ? `Report: ${formatInt(i.reason_rows)} reasons` : `Examples: ${i.issue_reason ?? "reason"} (${formatInt(i.example_rows)} URLs${i.examples_partial ? ", partial" : ""})`}
                        </td>
                        <td className={`${tdCls} text-muted`}>{scopeLabel(i)}</td>
                        <td className={`${tdCls} max-w-[16rem] truncate text-muted`} title={i.filename}>{i.filename}</td>
                        <td className={`${tdCls} text-muted`}>{formatDateTime(i.created_at)}</td>
                        <td className={`${tdCls} text-right`}>
                          <button type="button" onClick={() => void removeImport(i.id)} aria-label={`Delete import of ${i.report_date}`} title="Delete import" className="rounded-md p-1 text-muted hover:bg-danger-soft hover:text-danger">
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {insp && (
            <Card className="mt-6 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">URL Inspection</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted">
                    Google’s index status for the URLs Spider tracks: sitemap URLs, pages with impressions and URLs you add. This is not the full list of pages Google knows.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/properties/${id}/indexing/urls`} className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
                    Browse URLs
                  </Link>
                  <Button variant="secondary" onClick={refresh} disabled={refreshing || insp.running}>
                    <RefreshCw className={`h-4 w-4 ${insp.running ? "animate-spin" : ""}`} aria-hidden />
                    {insp.running ? "Refreshing…" : "Refresh now"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Tracked URLs" value={formatInt(insp.tracked_urls)} hint="sitemaps + pages with impressions + added" />
                <KpiCard label="Inspected" value={formatInt(insp.inspected_urls)} hint={insp.tracked_urls ? `${Math.round((insp.inspected_urls / insp.tracked_urls) * 100)}% of tracked URLs` : undefined} />
                <KpiCard label="Indexed (inspected)" value={formatInt(insp.indexed_urls)} hint="latest inspection per URL" />
                <KpiCard label="Quota today" value={`${formatInt(insp.used_today)} / ${formatInt(insp.daily_budget)}`} hint="URL Inspection calls for this property" />
              </div>

              {insp.by_coverage.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={thCls}>Google coverage state</th>
                        <th className={thCls}>Verdict</th>
                        <th className={`${thCls} text-right`}>Inspected URLs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insp.by_coverage.map((c) => (
                        <tr key={`${c.coverage_state}-${c.verdict}`} className="border-b border-border/60 last:border-0">
                          <td className={tdCls}>
                            <Link href={`/properties/${id}/indexing/urls?coverage=${encodeURIComponent(c.coverage_state)}`} className="hover:text-primary">
                              {c.coverage_state}
                            </Link>
                          </td>
                          <td className={`${tdCls} text-muted`}>{c.verdict ?? "—"}</td>
                          <td className={`${tdCls} tabular text-right`}>{formatInt(c.urls)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="mt-5 text-sm font-medium">Sitemaps submitted in Search Console</h3>
              {insp.sitemaps.length === 0 ? (
                <p className="mt-1 text-sm text-muted">{run ? "None. Submit a sitemap in Search Console so Google and Spider can discover the site’s URLs." : "Not fetched yet. Run a refresh."}</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={thCls}>Sitemap</th>
                        <th className={`${thCls} text-right`}>Submitted URLs</th>
                        <th className={`${thCls} text-right`}>Read by Spider</th>
                        <th className={thCls}>Last read by Google</th>
                        <th className={thCls}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insp.sitemaps.map((s) => (
                        <tr key={s.path} className="border-b border-border/60 last:border-0">
                          <td className={`${tdCls} break-all`}>{s.path}</td>
                          <td className={`${tdCls} tabular text-right`}>{formatInt(s.contents.reduce((a, c) => a + Number(c.submitted ?? 0), 0))}</td>
                          <td className={`${tdCls} tabular text-right`}>
                            {s.urls_read === null ? "—" : formatInt(s.urls_read)}
                            {s.urls_truncated && <div className="text-xs text-warning">truncated at the cap</div>}
                          </td>
                          <td className={`${tdCls} text-muted`}>{formatDate(s.last_downloaded)}</td>
                          <td className={tdCls}>
                            {s.errors > 0 ? <span className="text-danger">{formatInt(s.errors)} errors</span> : s.warnings > 0 ? <span className="text-warning">{formatInt(s.warnings)} warnings</span> : s.is_pending ? <span className="text-muted">Pending</span> : <span className="text-success">OK</span>}
                            {s.fetch_error && <div className="text-xs text-warning" title={s.fetch_error}>Spider could not read it</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4">
                <SourceNote source="url_inspection_api">
                  {run ? (
                    <>
                      last run {formatDateTime(run.finished_at ?? run.started_at)} ({run.status}
                      {run.stop_reason ? `, ${STOP_REASON_LABELS[run.stop_reason] ?? run.stop_reason}` : ""})
                    </>
                  ) : (
                    "no refresh has run yet; the daily job runs at 05:00"
                  )}
                </SourceNote>
              </div>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
