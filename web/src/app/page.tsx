"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { FleetChart } from "@/components/FleetChart";
import { FleetTable } from "@/components/FleetTable";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Button, Card, EmptyState, ErrorBox, KpiCard, Spinner } from "@/components/ui";
import { errorMessage, getOverview, getSeries } from "@/lib/api";
import { formatDate, formatDateTime, formatInt, formatPct, formatPosition } from "@/lib/format";
import type { FleetOverview, FleetSeries } from "@/lib/types";

export default function OverviewPage() {
  const [days, setDays] = useState(28);
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [series, setSeries] = useState<FleetSeries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, s] = await Promise.all([getOverview({ days }), getSeries({ days })]);
      setOverview(o);
      setSeries(s);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const lastSync = overview?.items.reduce<string | null>((acc, p) => (p.last_sync_at && (!acc || p.last_sync_at > acc) ? p.last_sync_at : acc), null);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fleet overview</h1>
          <p className="mt-1 text-sm text-muted">Google Search Console, every connected property, current period vs the previous one.</p>
        </div>
        <PeriodPicker days={days} onChange={setDays} period={overview?.period} previous={overview?.previousPeriod} />
      </div>

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {loading && !overview && <Spinner />}

      {overview && overview.items.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No properties yet">
            Add a Search Console property to start pulling data.
            <div className="mt-4">
              <Link href="/properties/new"><Button>Add a property</Button></Link>
            </div>
          </EmptyState>
        </div>
      )}

      {overview && overview.items.length > 0 && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Clicks" value={formatInt(overview.totals.current.clicks)} delta={overview.totals.delta.clicks} hint={`prev ${formatInt(overview.totals.previous.clicks)}`} />
            <KpiCard label="Impressions" value={formatInt(overview.totals.current.impressions)} delta={overview.totals.delta.impressions} hint={`prev ${formatInt(overview.totals.previous.impressions)}`} />
            <KpiCard label="CTR" value={formatPct(overview.totals.current.ctr)} hint="Σ clicks / Σ impressions" />
            <KpiCard label="Avg. position" value={formatPosition(overview.totals.current.position)} hint="impressions-weighted" />
          </div>

          <Card className="mt-6 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">Daily clicks</h2>
              <span className="text-xs text-muted">Click a name to show or hide it</span>
            </div>
            {series && <FleetChart series={series} topIds={overview.items.map((p) => p.id)} />}
          </Card>

          <Card className="mt-6">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-medium">Per property</h2>
              <Link href="/properties" className="text-sm text-primary hover:underline">Manage properties</Link>
            </div>
            <FleetTable items={overview.items} />
            <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-xs text-muted">
              <span>
                {overview.coverage.connected} of {overview.coverage.properties} properties connected · {overview.coverage.syncedToday} synced today
              </span>
              <span>GSC data through {formatDate(overview.coverage.dataThrough)}</span>
              <span>Last sync {formatDateTime(lastSync)}</span>
              <span>Search Analytics may omit low-volume rows; totals are what Google reports for the property.</span>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
