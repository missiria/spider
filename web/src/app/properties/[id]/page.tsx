"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Button, Card, ErrorBox, KpiCard, Spinner, StatusChip } from "@/components/ui";
import { checkProperty, errorMessage, getProperty, getSettings, resyncProperty } from "@/lib/api";
import { formatDate, formatDateTime, formatInt, formatPct, formatPosition, shortDate } from "@/lib/format";
import type { PropertyDetail, TopRow } from "@/lib/types";

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

function TopTable({ title, rows, kind, host }: { title: string; rows: TopRow[]; kind: "page" | "query"; host: string }) {
  return (
    <Card>
      <div className="border-b border-border px-4 py-3 font-medium">{title}</div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted">No rows yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-20" />
              <col className="w-16" />
              <col className="w-36" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">{kind === "page" ? "Page" : "Query"}</th>
                <th className="px-4 py-2 text-right font-medium">Clicks</th>
                <th className="px-4 py-2 text-right font-medium">Impr.</th>
                <th className="px-4 py-2 text-right font-medium">CTR</th>
                <th className="px-4 py-2 text-right font-medium">Pos.</th>
                <th className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-surface-muted/60">
                  <td className="px-4 py-1.5 break-all" title={r.key_text}>
                    {kind === "page" ? pathOf(r.key_text) : r.key_text}
                  </td>
                  <td className="tabular px-4 py-1.5 text-right">{formatInt(r.clicks)}</td>
                  <td className="tabular px-4 py-1.5 text-right">{formatInt(r.impressions)}</td>
                  <td className="tabular px-4 py-1.5 text-right">{formatPct(r.ctr)}</td>
                  <td className="tabular px-4 py-1.5 text-right">{formatPosition(r.position)}</td>
                  <td className="px-4 py-1.5 text-right">
                    {kind === "page" ? (
                      <a href={r.key_text} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-primary hover:underline">
                        View page <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : (
                      <a href={googleSiteSearch(host, r.key_text)} target="_blank" rel="noreferrer" title={`site:${host} "${r.key_text}"`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-primary hover:underline">
                        View in Google <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </td>
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
  const [days, setDays] = useState(28);
  const [data, setData] = useState<PropertyDetail | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getProperty(id, { days }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id, days]);

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

  const resync = async () => {
    setBusy(true);
    try {
      const res = await resyncProperty(id);
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
          <Button variant="secondary" disabled={busy || p.status !== "connected" || p.syncing} onClick={resync}>Sync now</Button>
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

      <div className="mt-6">
        <PeriodPicker days={days} onChange={setDays} period={data.period} previous={data.previousPeriod} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} width={48} tickFormatter={(v: number) => formatInt(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} width={56} tickFormatter={(v: number) => formatInt(v)} />
                <Tooltip formatter={(v) => formatInt(Number(v))} />
                <Line yAxisId="left" type="monotone" dataKey="clicks" name="Clicks" stroke="#4f46e5" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="impressions" name="Impressions" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="mt-6 flex flex-col gap-6">
        <TopTable title={`Top pages${data.topPeriod ? ` · ${data.topPeriod.start} → ${data.topPeriod.end}` : ""}`} rows={data.topPages} kind="page" host={hostOf(p.site_url)} />
        <TopTable title={`Top queries${data.topPeriod ? ` · ${data.topPeriod.start} → ${data.topPeriod.end}` : ""}`} rows={data.topQueries} kind="query" host={hostOf(p.site_url)} />
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
