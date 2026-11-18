"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ExternalLink, Radio, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Banner, Crumbs, SourceNote, tdCls, thCls, VerdictChip } from "@/components/indexing/parts";
import { Button, Card, ErrorBox, Spinner } from "@/components/ui";
import { errorMessage, getIndexingUrl, inspectIndexingUrl, liveCheckIndexingUrl } from "@/lib/api";
import { formatDateTime, formatInt } from "@/lib/format";
import type { IndexingLiveCheck, IndexingUrlDetail } from "@/lib/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

const dash = (v: string | null | undefined) => v || <span className="text-muted">—</span>;

export default function IndexingUrlPage() {
  const params = useParams<{ id: string; hash: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<IndexingUrlDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [live, setLive] = useState<IndexingLiveCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getIndexingUrl(id, params.hash));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id, params.hash]);

  useEffect(() => {
    void load();
  }, [load]);

  const inspect = async () => {
    if (!data) return;
    setInspecting(true);
    try {
      setData(await inspectIndexingUrl(id, data.url));
      toast.success("Inspection stored");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setInspecting(false);
    }
  };

  const liveCheck = async () => {
    setChecking(true);
    try {
      setLive(await liveCheckIndexingUrl(id, params.hash));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const l = data?.latest ?? null;
  const canonicalMismatch = !!l?.google_canonical && !!l.user_canonical && l.google_canonical !== l.user_canonical;

  return (
    <AppShell>
      <Crumbs items={[{ href: "/indexing", label: "Page indexing" }, { href: `/properties/${id}/indexing`, label: data?.property.display_name ?? "Property" }, { href: `/properties/${id}/indexing/urls`, label: "URLs" }, { label: "URL" }]} />

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!data && !error && <Spinner />}

      {data && (
        <>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="break-all text-xl font-semibold tracking-tight">{data.url}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                <VerdictChip verdict={l ? l.verdict : null} />
                {l?.coverage_state && <span className="text-foreground">{l.coverage_state}</span>}
                {data.tracked && <span>· {[data.tracked.in_sitemap ? "in a sitemap" : null, data.tracked.in_gsc_pages ? `${formatInt(data.tracked.impressions_28d ?? 0)} impressions in 28 days` : null, data.tracked.user_added ? "added manually" : null].filter(Boolean).join(" · ") || "tracked"}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={data.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
                Open page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              <Button onClick={inspect} disabled={inspecting}>
                <RefreshCw className={`h-4 w-4 ${inspecting ? "animate-spin" : ""}`} aria-hidden />
                {inspecting ? "Asking Google…" : "Inspect now"}
              </Button>
            </div>
          </div>

          <Card className="mt-6 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Google’s indexed version</h2>
              {l && <span className="text-xs text-muted">Inspected {formatDateTime(l.inspected_at)}</span>}
            </div>
            {!l ? (
              <p className="mt-3 text-sm text-muted">Not inspected yet. Click “Inspect now”, or wait for the daily run.</p>
            ) : l.error ? (
              <div className="mt-3"><ErrorBox message={`The last inspection failed: ${l.error}`} /></div>
            ) : (
              <>
                {canonicalMismatch && (
                  <div className="mt-3">
                    <Banner tone="warning" title="Google selected a different canonical than the page declares.">
                      Google indexes the URL it selected, not this one.
                    </Banner>
                  </div>
                )}
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Verdict">{dash(l.verdict)}</Field>
                  <Field label="Coverage state">{dash(l.coverage_state)}</Field>
                  <Field label="Indexing allowed">{dash(l.indexing_state)}</Field>
                  <Field label="Last crawl">{l.last_crawl_time ? formatDateTime(l.last_crawl_time) : dash(null)}</Field>
                  <Field label="Crawled as">{dash(l.crawled_as)}</Field>
                  <Field label="Page fetch">{dash(l.page_fetch_state)}</Field>
                  <Field label="robots.txt">{dash(l.robots_txt_state)}</Field>
                  <Field label="Google-selected canonical">{dash(l.google_canonical)}</Field>
                  <Field label="User-declared canonical">{dash(l.user_canonical)}</Field>
                </dl>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Sitemaps listing this URL (per Google)">
                    {l.sitemaps?.length ? (
                      <ul className="space-y-0.5">{l.sitemaps.map((s) => <li key={s} className="break-all">{s}</li>)}</ul>
                    ) : (
                      <span className="text-muted">None reported</span>
                    )}
                  </Field>
                  <Field label="Referring URLs (per Google)">
                    {l.referring_urls?.length ? (
                      <ul className="space-y-0.5">{l.referring_urls.map((s) => <li key={s} className="break-all">{s}</li>)}</ul>
                    ) : (
                      <span className="text-muted">None reported</span>
                    )}
                  </Field>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-primary">Raw API response</summary>
                  <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-surface-muted p-3 text-xs">{JSON.stringify(l.raw, null, 2)}</pre>
                </details>
              </>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <SourceNote source="url_inspection_api">reflects Google’s last crawl, not the page as it is now</SourceNote>
              <a href={data.links.inspect} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Live test and Request indexing in Search Console <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </div>
          </Card>

          <Card className="mt-6 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">Live HTTP check</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">Spider fetches the page now and reports status, redirects, canonical and robots signals. Separate from Google’s view above: a CDN or bot protection can answer Google differently.</p>
              </div>
              <Button variant="secondary" onClick={liveCheck} disabled={checking || !data.tracked}>
                <Radio className="h-4 w-4" aria-hidden />
                {checking ? "Fetching…" : "Check now"}
              </Button>
            </div>
            {live && (
              <div className="mt-4">
                {live.error ? (
                  <ErrorBox message={`The fetch failed: ${live.error}`} />
                ) : (
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Final status">
                      <span className={`tabular font-medium ${live.final_status && live.final_status < 400 ? "text-success" : "text-danger"}`}>{live.final_status ?? "—"}</span>
                    </Field>
                    <Field label="Final URL">{dash(live.final_url)}</Field>
                    <Field label="Canonical tag">{dash(live.canonical)}</Field>
                    <Field label="Robots (header | meta)">{dash(live.robots)}</Field>
                  </dl>
                )}
                {live.hops.length > 1 && (
                  <ol className="mt-3 space-y-1 text-sm">
                    {live.hops.map((h, i) => (
                      <li key={`${h.url}-${i}`} className="break-all">
                        <span className="tabular font-medium">{h.status}</span> {h.url}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="mt-3">
                  <SourceNote source="live_http">checked {formatDateTime(live.checked_at)}{live.ms ? ` in ${formatInt(live.ms)} ms` : ""}</SourceNote>
                </div>
              </div>
            )}
          </Card>

          <Card className="mt-6 overflow-x-auto">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-medium">Inspection history</h2>
            </div>
            {data.history.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted">No inspection stored yet.</div>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className={thCls}>Inspected</th>
                    <th className={thCls}>Verdict</th>
                    <th className={thCls}>Coverage state</th>
                    <th className={thCls}>Last crawl</th>
                    <th className={thCls}>Google canonical</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.inspected_at} className="border-b border-border/60 last:border-0">
                      <td className={`${tdCls} whitespace-nowrap`}>{formatDateTime(h.inspected_at)}</td>
                      <td className={tdCls}><VerdictChip verdict={h.verdict} /></td>
                      <td className={tdCls}>{h.error ? <span className="text-danger">Failed: {h.error}</span> : dash(h.coverage_state)}</td>
                      <td className={`${tdCls} whitespace-nowrap text-muted`}>{h.last_crawl_time ? formatDateTime(h.last_crawl_time) : "—"}</td>
                      <td className={`${tdCls} break-all text-muted`}>{dash(h.google_canonical)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
