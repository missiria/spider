"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Banner, Crumbs, IntentChip, SourceNote, tdCls, thCls, TrendChart } from "@/components/indexing/parts";
import { Card, ErrorBox, KpiCard, Spinner } from "@/components/ui";
import { errorMessage, getIndexingReason } from "@/lib/api";
import { formatInt } from "@/lib/format";
import { EXAMPLES_CAP, GROUP_LABELS, INTENT_HINTS, pagesDelta, scopeFromSearch, scopeLabel, scopeQuery } from "@/lib/indexing";
import type { IndexingReasonDetail, IndexingScopeRef } from "@/lib/types";

const PAGE = 100;

export default function IndexingReasonPage() {
  const params = useParams<{ id: string; hash: string }>();
  const id = Number(params.id);
  const [scope, setScope] = useState<IndexingScopeRef | null>(null);
  const [data, setData] = useState<IndexingReasonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    setScope(scopeFromSearch(window.location.search));
  }, []);

  useEffect(() => {
    if (!scope) return;
    getIndexingReason(id, params.hash, scope).then(setData).catch((err) => setError(errorMessage(err)));
  }, [id, params.hash, scope]);

  const examples = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.examples ?? []).filter((e) => !term || e.url.toLowerCase().includes(term));
  }, [data, search]);

  const q = scope ? scopeQuery(scope) : "";
  const latest = data?.history[data.history.length - 1] ?? null;
  const previous = data && data.history.length > 1 ? data.history[data.history.length - 2] : null;
  // the issue export carries Google's own daily chart; fall back to the counts of each imported report
  const chart = data ? (data.trend.length > 1 ? data.trend.map((t) => ({ date: t.date, pages: t.pages })) : data.history.map((h) => ({ date: h.report_date, pages: h.pages }))) : [];
  const validations = (data?.history ?? []).filter((h, i, all) => h.validation && (i === 0 || all[i - 1].validation !== h.validation));

  return (
    <AppShell>
      <Crumbs items={[{ href: "/indexing", label: "Page indexing" }, { href: `/properties/${id}/indexing${q}`, label: data?.property.display_name ?? "Property" }, { label: data?.reason ?? "Reason" }]} />

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!data && !error && <Spinner />}

      {data && scope && (
        <>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{data.reason}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                {data.group !== "indexed" && <IntentChip intent={data.intent} />}
                {data.group && <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-xs">{GROUP_LABELS[data.group]}</span>}
                {data.source && <span>Source: {data.source}</span>}
                <span>· {scopeLabel(scope)}</span>
              </div>
              {data.group !== "indexed" && <p className="mt-2 max-w-2xl text-sm text-muted">{INTENT_HINTS[data.intent]}</p>}
            </div>
            <a href={data.links.search_console} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Open in Search Console <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Affected pages" value={latest ? formatInt(latest.pages) : "—"} hint={latest ? `report of ${latest.report_date}` : "not in an imported report"} />
            <KpiCard label="Change" value={latest ? pagesDelta(latest.pages, previous?.pages ?? null) : "—"} hint={previous ? `vs ${formatInt(previous.pages)} on ${previous.report_date}` : "no earlier report to compare"} />
            <KpiCard label="First seen in Spider" value={data.first_seen ?? "—"} hint="earliest imported report listing it" />
            <KpiCard label="Validation" value={latest?.validation ?? "—"} hint="as exported by Search Console" />
          </div>

          <Card className="mt-6 p-4">
            <h2 className="mb-3 font-medium">Affected pages over time</h2>
            <TrendChart label={`Pages affected by ${data.reason} over time`} data={chart} series={[{ key: "pages", name: "Affected pages", color: "var(--danger)" }]} />
            <div className="mt-3">
              <SourceNote source="gsc_export">{data.trend.length > 1 ? `daily chart of the reason’s export (${data.issue_export?.report_date})` : "one point per imported report; upload this reason’s own export for Google’s daily chart"}</SourceNote>
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="overflow-x-auto">
              <div className="border-b border-border px-4 py-3">
                <h2 className="font-medium">Report history</h2>
              </div>
              {data.history.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted">No imported report lists this reason for this view.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={thCls}>Report date</th>
                      <th className={`${thCls} text-right`}>Pages</th>
                      <th className={thCls}>Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.history].reverse().map((h) => (
                      <tr key={h.report_date} className="border-b border-border/60 last:border-0">
                        <td className={`${tdCls} tabular`}>{h.report_date}</td>
                        <td className={`${tdCls} tabular text-right`}>{formatInt(h.pages)}</td>
                        <td className={`${tdCls} text-muted`}>{h.validation ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="font-medium">Validation</h2>
              {validations.length === 0 ? (
                <p className="mt-2 text-sm text-muted">The imported reports carry no validation status for this reason.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {validations.map((v) => (
                    <li key={v.report_date}>
                      <span className="tabular text-muted">{v.report_date}</span> · {v.validation}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-sm text-muted">
                Google’s API cannot start a validation or run a live test. After fixing the pages, click “Validate fix” for this reason in Search Console, then upload a new export to follow its progress here.
              </p>
              <a href={data.links.search_console} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Validate fix in Search Console <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </Card>
          </div>

          <Card className="mt-6 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-medium">Example URLs</h2>
                {data.issue_export && (
                  <p className="text-xs text-muted">
                    {formatInt(data.issue_export.example_rows)} URLs from the export of {data.issue_export.report_date}
                    {latest && latest.pages > data.issue_export.example_rows ? ` · ${formatInt(latest.pages)} pages affected in total` : ""}
                  </p>
                )}
              </div>
              {data.examples.length > 10 && (
                <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} placeholder="Filter URLs" aria-label="Filter example URLs" className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary" />
              )}
            </div>
            {data.issue_export?.examples_partial && (
              <div className="px-4 pt-3">
                <Banner tone="warning" title={`Partial list: Search Console exports at most ${formatInt(EXAMPLES_CAP)} example URLs.`}>
                  The page count above is complete; this list is a sample chosen by Google.
                </Banner>
              </div>
            )}
            {!data.issue_export ? (
              <div className="px-4 py-6 text-sm text-muted">
                No example URLs imported for this reason. In Search Console open this reason, click Export → Download CSV, and upload the file on the <Link href={`/properties/${id}/indexing${q}`} className="text-primary hover:underline">property’s indexing page</Link>.
              </div>
            ) : examples.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted">{search ? "No URL matches this filter." : "The export lists no example URLs."}</div>
            ) : (
              <>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={thCls}>URL</th>
                      <th className={thCls}>Last crawled</th>
                      <th className={thCls}><span className="sr-only">Links</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {examples.slice(0, shown).map((e) => (
                      <tr key={e.url} className="border-b border-border/60 last:border-0">
                        <td className={`${tdCls} break-all`}>
                          <a href={e.url} target="_blank" rel="noreferrer" className="hover:text-primary">{e.url}</a>
                        </td>
                        <td className={`${tdCls} tabular whitespace-nowrap text-muted`}>{e.last_crawled ?? "—"}</td>
                        <td className={`${tdCls} whitespace-nowrap text-right`}>
                          <a href={e.inspect_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            Inspect in Search Console <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {examples.length > shown && (
                  <div className="border-t border-border px-4 py-3 text-center">
                    <button type="button" onClick={() => setShown((n) => n + PAGE)} className="text-sm text-primary hover:underline">
                      Show {Math.min(PAGE, examples.length - shown)} more ({formatInt(examples.length - shown)} hidden)
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
