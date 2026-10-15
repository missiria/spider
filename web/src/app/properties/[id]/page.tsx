"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PeriodPicker } from "@/components/PeriodPicker";
import { SavedViews } from "@/components/SavedViews";
import { Button, Card, ErrorBox, KpiCard, Spinner, StatusChip } from "@/components/ui";
import { checkProperty, errorMessage, getProperty, getSettings, resyncProperty } from "@/lib/api";
import { formatDate, formatDateTime, formatInt, formatPct, formatPosition, shortDate } from "@/lib/format";
import { appearanceName, countryName, deviceName } from "@/lib/countries";
import { DEFAULT_PERIOD, periodFromConfig, periodParams, type PeriodSelection } from "@/lib/period";
import { applyTopState, DEFAULT_TOP_STATE, toggleTopSort, type TopSortKey, type TopTableState } from "@/lib/topTable";
import type { DimensionBreakdown, KeyFilters, PropertyDetail, TopRow } from "@/lib/types";

function hostOf(siteUrl: string): string {
  return siteUrl.replace(/^https?:\/\//, "").replace(/^sc-domain:/, "").replace(/\/+$/, "");
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

function googleSiteSearch(host: string, keyword: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${host} "${keyword}"`)}`;
}

const TOP_COLUMNS: { key: TopSortKey; label: (kind: "page" | "query" | "country" | "device" | "search_appearance") => string; align: "left" | "right"; title?: string }[] = [
  { key: "key_text", label: (k) => ({ page: "Page", query: "Query", country: "Country", device: "Device", search_appearance: "Search appearance" })[k], align: "left" },
  { key: "clicks", label: () => "Clicks", align: "right" },
  { key: "impressions", label: () => "Impr.", align: "right" },
  { key: "ctr", label: () => "CTR", align: "right" },
  { key: "position", label: () => "Pos.", align: "right", title: "Average position (lower is better)" },
];

type Kind = "page" | "query" | "country" | "device" | "search_appearance";

function labelFor(kind: Kind, key: string): string {
  if (kind === "page") return pathOf(key);
  if (kind === "country") return `${countryName(key)} (${key.toUpperCase()})`;
  if (kind === "device") return deviceName(key);
  if (kind === "search_appearance") return appearanceName(key);
  return key;
}

function toRows(b: DimensionBreakdown | undefined): TopRow[] {
  return (b?.rows ?? []).map((r) => ({ id: r.key, key_text: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
}

function CoverageNote({ b, kind }: { b: DimensionBreakdown | undefined; kind: Kind }) {
  if (!b || !b.stored) return <span className="text-xs text-muted">No stored rows for this period yet. Run a sync.</span>;
  const cov = b.coverage.clicks;
  return (
    <span className="text-xs text-muted">
      {b.days} day{b.days === 1 ? "" : "s"} stored ({b.stored.start} → {b.stored.end})
      {cov !== null && kind === "query" && <> · query rows explain {Math.round(cov * 100)}% of clicks; Google hides low-volume queries</>}
      {cov !== null && kind === "search_appearance" && <> · {Math.round(cov * 100)}% of clicks came from results with a special appearance (plain blue links are not listed)</>}
      {cov !== null && kind !== "query" && kind !== "search_appearance" && cov < 0.98 && <> · rows explain {Math.round(cov * 100)}% of clicks</>}
    </span>
  );
}

function RegexFilters({ value, onApply }: { value: { include?: string; exclude?: string }; onApply: (v: { include?: string; exclude?: string }) => void }) {
  const [inc, setInc] = useState(value.include ?? "");
  const [exc, setExc] = useState(value.exclude ?? "");
  useEffect(() => {
    setInc(value.include ?? "");
    setExc(value.exclude ?? "");
  }, [value.include, value.exclude]);
  const dirty = inc !== (value.include ?? "") || exc !== (value.exclude ?? "");
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ include: inc.trim() || undefined, exclude: exc.trim() || undefined });
      }}
      aria-label="Regex filters"
    >
      <input value={inc} onChange={(e) => setInc(e.target.value)} placeholder="Include regex, e.g. ^iptv (test|essai)" aria-label="Include regex" className="w-56 rounded-md border border-border px-2 py-1.5 font-mono text-xs outline-none focus:border-primary" />
      <input value={exc} onChange={(e) => setExc(e.target.value)} placeholder="Exclude regex" aria-label="Exclude regex" className="w-40 rounded-md border border-border px-2 py-1.5 font-mono text-xs outline-none focus:border-primary" />
      <button type="submit" disabled={!dirty} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted disabled:opacity-50">
        Apply
      </button>
      {(value.include || value.exclude) && (
        <button type="button" onClick={() => onApply({})} className="text-xs text-primary hover:underline">
          Clear regex
        </button>
      )}
    </form>
  );
}

function TopTable({ title, breakdown, kind, host, regex, onRegex }: { title: string; breakdown: DimensionBreakdown | undefined; kind: Kind; host: string; regex?: { include?: string; exclude?: string }; onRegex?: (v: { include?: string; exclude?: string }) => void }) {
  const rows = useMemo(() => toRows(breakdown), [breakdown]);
  const [state, setState] = useState<TopTableState>(DEFAULT_TOP_STATE);
  const visible = useMemo(() => applyTopState(rows, state), [rows, state]);
  const filtered = state.search !== "" || state.minClicks > 0;
  const wide = kind === "page" || kind === "query";
  const regexBar = wide && onRegex ? <div className="border-b border-border px-4 py-2"><RegexFilters value={regex ?? {}} onApply={onRegex} /></div> : null;
  const noun = kind === "page" ? "pages" : kind === "query" ? "queries" : kind === "country" ? "countries" : kind === "device" ? "devices" : "appearances";

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          <CoverageNote b={breakdown} kind={kind} />
          {breakdown?.filters && (
            <div className="mt-1 text-xs text-muted">
              Server filter: {breakdown.filters.include && <code className="rounded bg-surface-muted px-1">/{breakdown.filters.include}/</code>}
              {breakdown.filters.include && breakdown.filters.exclude && " and not "}
              {breakdown.filters.exclude && <code className="rounded bg-surface-muted px-1">/{breakdown.filters.exclude}/</code>}
            </div>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={state.search}
              onChange={(e) => setState((s) => ({ ...s, search: e.target.value }))}
              placeholder={`Filter ${noun}…`}
              aria-label={`Filter ${noun}`}
              className={`${wide ? "w-52" : "w-36"} rounded-md border border-border py-1.5 pl-8 pr-2 outline-none focus:border-primary`}
            />
          </label>
          <select
            value={state.minClicks}
            onChange={(e) => setState((s) => ({ ...s, minClicks: Number(e.target.value) }))}
            aria-label="Minimum clicks"
            className="rounded-md border border-border bg-surface px-2 py-1.5 outline-none focus:border-primary"
          >
            <option value={0}>Any clicks</option>
            <option value={1}>≥ 1 click</option>
            <option value={5}>≥ 5 clicks</option>
            <option value={10}>≥ 10 clicks</option>
            <option value={50}>≥ 50 clicks</option>
          </select>
          <span className="text-xs text-muted">
            {visible.length} of {rows.length}
            {filtered && (
              <button type="button" onClick={() => setState((s) => ({ ...DEFAULT_TOP_STATE, sortKey: s.sortKey, sortDir: s.sortDir }))} className="ml-2 text-primary hover:underline">
                Clear
              </button>
            )}
          </span>
        </div>
      </div>
      {regexBar}
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted">{breakdown?.filters ? "No row matches the regex filter." : "No rows yet."}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${wide ? "table-fixed" : ""}`}>
            {wide && (
              <colgroup>
                <col />
                <col className="w-24" />
                <col className="w-24" />
                <col className="w-20" />
                <col className="w-16" />
                <col className="w-36" />
              </colgroup>
            )}
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                {TOP_COLUMNS.map((col) => {
                  const active = state.sortKey === col.key;
                  const Icon = active ? (state.sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th key={col.key} scope="col" className={`px-4 py-2 font-medium ${col.align === "right" ? "text-right" : "text-left"}`} aria-sort={active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <button type="button" title={col.title} onClick={() => setState((s) => toggleTopSort(s, col.key))} className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground ${active ? "text-foreground" : ""} ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                        {col.label(kind)}
                        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden />
                      </button>
                    </th>
                  );
                })}
                {wide && (
                  <th className="px-4 py-2 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={wide ? 6 : 5} className="px-4 py-8 text-center text-muted">
                    No row matches these filters.
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-surface-muted/60">
                  <td className={`px-4 py-1.5 ${wide ? "break-all" : "whitespace-nowrap"}`} title={r.key_text}>
                    {labelFor(kind, r.key_text)}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-1.5 text-right">{formatInt(r.clicks)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-1.5 text-right">{formatInt(r.impressions)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-1.5 text-right">{formatPct(r.ctr)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-1.5 text-right">{formatPosition(r.position)}</td>
                  {wide && <td className="px-4 py-1.5 text-right">
                    {kind === "page" && (
                      <a href={r.key_text} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-primary hover:underline">
                        View page <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                    {kind === "query" && (
                      <a href={googleSiteSearch(host, r.key_text)} target="_blank" rel="noreferrer" title={`site:${host} "${r.key_text}"`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-primary hover:underline">
                        View in Google <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function PropertyPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [period, setPeriod] = useState<PeriodSelection>(DEFAULT_PERIOD);
  const [filters, setFilters] = useState<KeyFilters>({});
  const [data, setData] = useState<PropertyDetail | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getProperty(id, periodParams(period), filters));
      setError(null);
    } catch (err) {
      const msg = errorMessage(err);
      // a bad regex must not blank the page: keep the last data, surface the message
      if (/regular expression|filter/i.test(msg)) toast.error(msg);
      else setError(msg);
    }
  }, [id, period, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  // poll while a sync is running or access is pending
  useEffect(() => {
    if (!data || (!data.property.syncing && data.property.status === "connected")) return;
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [data, load]);

  useEffect(() => {
    getSettings().then((s) => setEmail(s.serviceAccountEmail)).catch(() => undefined);
  }, []);

  const check = async () => {
    setBusy(true);
    try {
      const res = await checkProperty(id);
      toast[res.justConnected ? "success" : "info"](res.justConnected ? "Access confirmed. Backfill started." : `Status: ${res.property.status}`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resync = async (kind?: "backfill") => {
    setBusy(true);
    try {
      const res = await resyncProperty(id, kind);
      toast[res.started ? "success" : "info"](res.started ? `${res.kind} sync started` : (res.reason ?? "Not started"));
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <AppShell>
        <ErrorBox message={error} />
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell>
        <Spinner />
      </AppShell>
    );
  }

  const p = data.property;

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{p.display_name}</h1>
            <StatusChip status={p.status} />
            {p.syncing && <span className="text-xs text-muted">syncing…</span>}
          </div>
          <p className="mt-1 font-mono text-xs text-muted">{p.site_url}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={busy} onClick={check}>Check access</Button>
          <Button variant="secondary" disabled={busy || p.status !== "connected" || p.syncing} onClick={() => resync()}>Sync now</Button>
          <Button variant="secondary" disabled={busy || p.status !== "connected" || p.syncing} onClick={() => resync("backfill")} title="Re-pull 16 months of daily totals and the full dimensional history">Full resync</Button>
        </div>
      </div>

      {p.status === "pending" && (
        <Card className="mt-4 border-warning/30 bg-warning-soft p-4 text-sm">
          Not shared yet. In Search Console → Settings → Users and permissions, add <code className="rounded bg-surface px-1">{email}</code> as a Full user, then press Check access. Spider also re-checks every 10 minutes.
        </Card>
      )}
      {p.status === "revoked" && (
        <Card className="mt-4 border-danger/30 bg-danger-soft p-4 text-sm">The service account no longer sees this property. Stored data is kept; re-share it in Search Console to resume the sync.</Card>
      )}
      {p.last_error && p.status !== "pending" && <div className="mt-4"><ErrorBox message={p.last_error} /></div>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} period={data.period} previous={data.previousPeriod} />
        <SavedViews
          scope="property"
          propertyId={id}
          current={{ period: periodParams(period), filters }}
          onLoad={(c) => {
            setPeriod(periodFromConfig(c.period));
            const f = (c.filters ?? {}) as KeyFilters;
            setFilters({ include_query: f.include_query, exclude_query: f.exclude_query, include_page: f.include_page, exclude_page: f.exclude_page });
          }}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Clicks" value={formatInt(data.kpi.current.clicks)} delta={data.kpi.delta.clicks} hint={`prev ${formatInt(data.kpi.previous.clicks)}`} />
        <KpiCard label="Impressions" value={formatInt(data.kpi.current.impressions)} delta={data.kpi.delta.impressions} hint={`prev ${formatInt(data.kpi.previous.impressions)}`} />
        <KpiCard label="CTR" value={formatPct(data.kpi.current.ctr)} delta={data.kpi.delta.ctr} hint={`prev ${formatPct(data.kpi.previous.ctr)}`} />
        <KpiCard label="Avg. position" value={formatPosition(data.kpi.current.position)} delta={data.kpi.delta.position} lowerIsBetter hint={`prev ${formatPosition(data.kpi.previous.position)}`} />
      </div>

      <Card className="mt-6 p-4">
        <h2 className="mb-3 font-medium">Daily clicks and impressions</h2>
        {data.series.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted">No daily data in this period yet.</div>
        ) : (
          <div className="h-72 w-full" role="img" aria-label="Daily clicks and impressions">
            <ResponsiveContainer>
              <LineChart data={data.series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" minTickGap={24} />
                <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" width={48} tickFormatter={(v: number) => formatInt(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--chart-grid)" width={56} tickFormatter={(v: number) => formatInt(v)} />
                <Tooltip formatter={(v) => formatInt(Number(v))} />
                <Line yAxisId="left" type="monotone" dataKey="clicks" name="Clicks" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="impressions" name="Impressions" stroke="var(--chart-secondary)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="mt-6 flex flex-col gap-6">
        <TopTable
          title={`Top pages · ${data.period.start} → ${data.period.end}`}
          breakdown={data.breakdowns.page}
          kind="page"
          host={hostOf(p.site_url)}
          regex={{ include: filters.include_page, exclude: filters.exclude_page }}
          onRegex={(v) => setFilters((f) => ({ ...f, include_page: v.include, exclude_page: v.exclude }))}
        />
        <TopTable
          title={`Top queries · ${data.period.start} → ${data.period.end}`}
          breakdown={data.breakdowns.query}
          kind="query"
          host={hostOf(p.site_url)}
          regex={{ include: filters.include_query, exclude: filters.exclude_query }}
          onRegex={(v) => setFilters((f) => ({ ...f, include_query: v.include, exclude_query: v.exclude }))}
        />
        <div className="grid gap-6 xl:grid-cols-3">
          <TopTable title="Countries" breakdown={data.breakdowns.country} kind="country" host={hostOf(p.site_url)} />
          <TopTable title="Devices" breakdown={data.breakdowns.device} kind="device" host={hostOf(p.site_url)} />
          <TopTable title="Search appearance" breakdown={data.breakdowns.search_appearance} kind="search_appearance" host={hostOf(p.site_url)} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>Data since {formatDate(p.data_since)}</span>
        <span>Last sync {formatDateTime(p.last_sync_at)}</span>
        <span>Last access check {formatDateTime(p.last_checked_at)}</span>
        {p.last_run && <span>Last run: {p.last_run.kind} · {p.last_run.status} · {p.last_run.rows_upserted} rows</span>}
      </div>
    </AppShell>
  );
}
