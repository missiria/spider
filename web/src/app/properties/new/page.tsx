"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { AppShell } from "@/components/AppShell";
import { Button, Card, ErrorBox } from "@/components/ui";
import { createProperty, errorMessage, getSettings } from "@/lib/api";

export default function NewPropertyPage() {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState("");
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setEmail(s.serviceAccountEmail)).catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await createProperty(siteUrl);
      toast.success(`${res.property.display_name} added. Share it in Search Console, then check access.`);
      router.push(`/properties/${res.property.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied");
    } catch {
      toast.info(email);
    }
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Add a property</h1>
      <p className="mt-1 text-sm text-muted">Spider reads Search Console with a Google service account. You share the property with it, Spider checks until the access is live.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <form onSubmit={submit}>
            <label className="block text-sm">
              <span className="font-medium">Property URL</span>
              <input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://www.example.com/  or  sc-domain:example.com"
                required
                className="mt-1 w-full rounded-md border border-border px-3 py-2 font-mono text-sm outline-none focus:border-primary"
              />
              <span className="mt-1 block text-xs text-muted">Exactly as it appears in Search Console: URL-prefix properties end with “/”, domain properties start with “sc-domain:”.</span>
            </label>
            {error && <div className="mt-4"><ErrorBox message={error} /></div>}
            <Button type="submit" disabled={busy} className="mt-5">{busy ? "Adding…" : "Add property"}</Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-medium">Share it with Spider</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>Open <a className="text-primary hover:underline" href="https://search.google.com/search-console/users" target="_blank" rel="noreferrer">Search Console → Settings → Users and permissions</a> for that property.</li>
            <li>
              Add user:
              <div className="mt-1 flex items-center gap-2">
                <code className="rounded bg-surface-muted px-2 py-1 text-xs">{email || "…"}</code>
                <Button variant="secondary" type="button" onClick={copy} disabled={!email}>Copy</Button>
              </div>
            </li>
            <li>Permission: <strong>Full</strong> (Restricted also works for reading performance data).</li>
            <li>Back here, press <strong>Check access</strong>. Spider also re-checks pending properties every 10 minutes and backfills 16 months of daily data as soon as the access appears.</li>
          </ol>
          <p className="mt-4 text-xs text-muted">Spider never writes to Search Console. Removing the user in Google stops the sync; data already stored stays until you remove the property.</p>
        </Card>
      </div>
    </AppShell>
  );
}
