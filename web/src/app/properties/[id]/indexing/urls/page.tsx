"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ExternalLink, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Banner, Crumbs, SourceNote, tdCls, thCls, VerdictChip } from "@/components/indexing/parts";
import { Button, Card, ErrorBox, Spinner } from "@/components/ui";
import { errorMessage, getPropertyIndexing, inspectIndexingUrl, listIndexingUrls, type IndexingUrlFilter } from "@/lib/api";
import { formatDate, formatInt } from "@/lib/format";
import { isIndexedCoverage, pathOf } from "@/lib/indexing";
import type { IndexingUrlList, PropertyIndexing } from "@/lib/types";

export default function IndexingUrlsPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const [filter, setFilter] = useState<IndexingUrlFilter | null>(null);
  const [searchText, setSearchText] = useState("");
  const [data, setData] = useState<IndexingUrlList | null>(null);
  const [summary, setSummary] = useState<PropertyIndexing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectUrl, setInspectUrl] = useState("");
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setFilter({ coverage: p.get("coverage") ?? undefined, verdict: p.get("verdict") ?? undefined, in_sitemap: p.get("in_sitemap") === "1" ? "1" : undefined, page: 1 });
    getPropertyIndexing(id).then(setSummary).catch(() => undefined);
  }, [id]);

  const load = useCallback(async () => {
    if (!filter) return;
    try {
      setData(await listIndexingUrls(id, filter));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const inspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectUrl.trim()) return;
    setInspecting(true);
    try {
      const r = await inspectIndexingUrl(id, inspectUrl.trim());
      router.push(`/properties/${id}/indexing/urls/${r.url_hash}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setInspecting(false);
    }
  };

  const insp = summary?.inspection;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const selectCls = "min-w-0 max-w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary";

  return (
    <AppShell>
      <Crumbs items={[{ href: "/indexing", label: "Page indexing" }, { href: `/properties/${id}/indexing`, label: summary?.property.display_name ?? "Property" }, { label: "URLs" }]} />
      <div className="mt-2">
        <h1 className="text-2xl font-semibold tracking-tight">Inspected URLs</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Latest URL Inspection result for each URL Spider tracks on this property. Not the full list of pages Google knows: report-wide counts are on the property’s indexing page.
        </p>
      </div>

      <Card className="mt-4 p-4">
        <form onSubmit={inspect} className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 basis-64 text-sm">
            <span className="text-muted">Inspect a URL now</span>
            <input type="url" required value={inspectUrl} onChange={(e) => setInspectUrl(e.target.value)} placeholder={summary ? `${summary.property.site_url.replace(/^sc-domain:/, "https://").replace(/\/+$/, "")}/page/` : "https://"} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-primary" />
          </label>
          <Button type="submit" disabled={inspecting}>
            <Search className="h-4 w-4" aria-hidden />
            {inspecting ? "Asking Google…" : "Inspect"}
          </Button>
          {summary && (
            <a href={summary.links.search_console} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Fix in Search Console <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )}
        </form>
        <p className="mt-2 text-xs text-muted">
          Uses one URL Inspection call{insp ? ` (${formatInt(insp.used_today)} of ${formatInt(insp.daily_budget)} used today)` : ""}. The answer is Google’s indexed version, not a live test.
        </p>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={filter?.coverage ?? ""} onChange={(e) => setFilter((f) => ({ ...f, coverage: e.target.value || undefined, page: 1 }))} aria-label="Coverage state" className={`${selectCls} max-w-[20rem]`}>
          <option value="">Any coverage state</option>
          {(insp?.by_coverage ?? []).filter((c, i, all) => all.findIndex((x) => x.coverage_state === c.coverage_state) === i).map((c) => (
            <option key={c.coverage_state} value={c.coverage_state}>
              {c.coverage_state}
            </option>
          ))}
          {filter?.coverage && !(insp?.by_coverage ?? []).some((c) => c.coverage_state === filter.coverage) && <option value={filter.coverage}>{filter.coverage}</option>}
        </select>
        <select value={filter?.verdict ?? ""} onChange={(e) => setFilter((f) => ({ ...f, verdict: e.target.value || undefined, page: 1 }))} aria-label="Verdict" className={selectCls}>
          <option value="">Any verdict</option>
          <option value="PASS">PASS (indexed)</option>
          <option value="NEUTRAL">NEUTRAL (excluded)</option>
          <option value="FAIL">FAIL (error)</option>
          <option value="PARTIAL">PARTIAL</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filter?.in_sitemap === "1"} onChange={(e) => setFilter((f) => ({ ...f, in_sitemap: e.target.checked ? "1" : undefined, page: 1 }))} className="accent-primary" />
          In a sitemap
        </label>
        <form onSubmit={(e) => { e.preventDefault(); setFilter((f) => ({ ...f, search: searchText.trim() || undefined, page: 1 })); }} className="flex min-w-0 max-w-full items-center gap-2">
          <input type="search" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="URL contains" aria-label="URL contains" className={selectCls} />
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
        {data && <span className="ml-auto text-xs text-muted">{formatInt(data.total)} URL{data.total === 1 ? "" : "s"}</span>}
      </div>

      {filter?.coverage && !isIndexedCoverage(filter.coverage) && (
        <div className="mt-4">
          <Banner tone="warning" title={`${data ? formatInt(data.total) : "These"} URL${data?.total === 1 ? " is" : "s are"} “${filter.coverage}”.`}>
            Google’s API cannot submit a URL for indexing. Fix the pages if needed, then click “Fix in Search Console” above: it opens this property’s Page indexing report, where you open the reason and use Validate fix, or inspect a URL and click Request indexing (about 10 requests per day per property).
          </Banner>
        </div>
      )}

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!data && !error && <Spinner />}

      {data && (
        <Card className="mt-4 overflow-x-auto">
          {data.items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              {data.total === 0 && !filter?.coverage && !filter?.verdict && !filter?.search && !filter?.in_sitemap ? "No tracked URLs yet. Run a refresh on the property’s indexing page, or inspect a URL above." : "No URL matches these filters."}
            </div>
          ) : (
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={thCls}>URL</th>
                  <th className={thCls}>Verdict</th>
                  <th className={thCls}>Google coverage state</th>
                  <th className={thCls}>Last crawl</th>
                  <th className={thCls}>Inspected</th>
                  <th className={`${thCls} text-right`}>Impr. 28 d</th>
                  <th className={thCls}>Tracked from</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.url_hash} className="border-b border-border/60 last:border-0">
                    <td className={`${tdCls} max-w-[26rem]`}>
                      <Link href={`/properties/${id}/indexing/urls/${u.url_hash}`} title={u.url} className="block truncate font-medium hover:text-primary">
                        {pathOf(u.url)}
                      </Link>
                      {u.google_canonical && u.user_canonical && u.google_canonical !== u.user_canonical && <div className="text-xs text-warning">Google chose another canonical</div>}
                      {u.error && <div className="truncate text-xs text-danger" title={u.error}>Inspection failed: {u.error}</div>}
                    </td>
                    <td className={tdCls}><VerdictChip verdict={u.inspected_at ? u.verdict : null} /></td>
                    <td className={tdCls}>{u.coverage_state ?? <span className="text-muted">—</span>}</td>
                    <td className={`${tdCls} whitespace-nowrap text-muted`}>{formatDate(u.last_crawl_time)}</td>
                    <td className={`${tdCls} whitespace-nowrap text-muted`}>{formatDate(u.inspected_at)}</td>
                    <td className={`${tdCls} tabular text-right`}>{u.impressions_28d ? formatInt(u.impressions_28d) : "—"}</td>
                    <td className={`${tdCls} text-xs text-muted`}>{[Number(u.in_sitemap) ? "Sitemap" : null, Number(u.in_gsc_pages) ? "Search results" : null, Number(u.user_added) ? "Added" : null].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <SourceNote source="url_inspection_api">not-indexed URLs first, then by impressions</SourceNote>
            {pages > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <Button variant="secondary" disabled={data.page <= 1} onClick={() => setFilter((f) => ({ ...f, page: data.page - 1 }))}>Previous</Button>
                <span className="tabular text-muted">Page {data.page} of {pages}</span>
                <Button variant="secondary" disabled={data.page >= pages} onClick={() => setFilter((f) => ({ ...f, page: data.page + 1 }))}>Next</Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </AppShell>
  );
}
