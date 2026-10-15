"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { errorMessage, getSettings } from "@/lib/api";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setData).catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!data && !error && <Spinner />}
      {data && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="font-medium">Workspace</h2>
            <dl className="mt-3 grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-muted">Name</dt>
              <dd className="col-span-2">{data.workspace.name}</dd>
              <dt className="text-muted">Slug</dt>
              <dd className="col-span-2 font-mono text-xs">{data.workspace.slug}</dd>
            </dl>
          </Card>
          <Card className="p-6">
            <h2 className="font-medium">Search Console access</h2>
            <dl className="mt-3 grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-muted">Service account</dt>
              <dd className="col-span-2 break-all font-mono text-xs">{data.serviceAccountEmail}</dd>
              <dt className="text-muted">Mode</dt>
              <dd className="col-span-2">{data.mock ? "Fixtures (GSC_MOCK=1), no Google calls" : "Live Google Search Console API"}</dd>
              <dt className="text-muted">Access check</dt>
              <dd className="col-span-2">{data.schedule.accessCheck}</dd>
              <dt className="text-muted">Sync</dt>
              <dd className="col-span-2">{data.schedule.incrementalSync}</dd>
            </dl>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
