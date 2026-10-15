"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { AppShell } from "@/components/AppShell";
import { Button, Card, EmptyState, ErrorBox, Spinner, StatusChip } from "@/components/ui";
import { checkProperty, deleteProperty, errorMessage, getProperties, resyncProperty } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import type { PropertyListResponse } from "@/lib/types";

export default function PropertiesPage() {
  const [data, setData] = useState<PropertyListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getProperties());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const check = async (id: number) => {
    setBusyId(id);
    try {
      const res = await checkProperty(id);
      toast[res.justConnected ? "success" : "info"](
        res.justConnected ? "Access confirmed. Backfill started." : `Status: ${res.property.status}`,
      );
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const resync = async (id: number) => {
    setBusyId(id);
    try {
      const res = await resyncProperty(id);
      toast[res.started ? "success" : "info"](res.started ? `${res.kind} sync started` : (res.reason ?? "Not started"));
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number, name: string) => {
    if (!window.confirm(`Remove ${name} and all its stored data?`)) return;
    setBusyId(id);
    try {
      await deleteProperty(id);
      toast.success("Property removed");
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Properties</h1>
          <p className="mt-1 text-sm text-muted">Search Console properties shared with the Spider service account.</p>
        </div>
        <Link href="/properties/new"><Button>Add a property</Button></Link>
      </div>

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!data && !error && <Spinner />}

      {data && data.items.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No properties yet">Add one, then share it in Search Console with <code className="rounded bg-surface-muted px-1">{data.serviceAccountEmail}</code>.</EmptyState>
        </div>
      )}

      {data && data.items.length > 0 && (
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Property</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Data since</th>
                <th className="px-4 py-2 font-medium">Last sync</th>
                <th className="px-4 py-2 font-medium">Last run</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="border-b border-border/60 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/properties/${p.id}`} className="font-medium hover:text-primary">{p.display_name}</Link>
                    <div className="text-xs text-muted">{p.site_url}</div>
                    {p.last_error && <div className="mt-1 text-xs text-danger">{p.last_error}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={p.status} />
                    {p.syncing && <div className="mt-1 text-xs text-muted">syncing…</div>}
                  </td>
                  <td className="tabular px-4 py-3 text-muted">{formatDate(p.data_since)}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(p.last_sync_at)}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {p.last_run ? (
                      <>
                        {p.last_run.kind} · {p.last_run.status}
                        {p.last_run.status === "ok" && ` · ${p.last_run.rows_upserted} rows`}
                        {p.last_run.error && <div className="text-danger">{p.last_run.error}</div>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" disabled={busyId === p.id} onClick={() => check(p.id)}>Check access</Button>
                      <Button variant="secondary" disabled={busyId === p.id || p.status !== "connected" || p.syncing} onClick={() => resync(p.id)}>Sync now</Button>
                      <Button variant="danger" disabled={busyId === p.id} onClick={() => remove(p.id, p.display_name)}>Remove</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
