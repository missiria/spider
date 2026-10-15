"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { AppShell } from "@/components/AppShell";
import { RulesSettings } from "@/components/RulesSettings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, Card, ErrorBox, Spinner } from "@/components/ui";
import { errorMessage, getMe, getSettings, updateMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Settings, User } from "@/lib/types";

export default function SettingsPage() {
  const [data, setData] = useState<Settings | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSettings(), getMe()])
      .then(([s, u]) => {
        setData(s);
        setMe(u);
        setName(u.name);
        setEmail(u.email);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const dirty = me !== null && (name.trim() !== me.name || email.trim().toLowerCase() !== me.email);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateMe({ name: name.trim(), email: email.trim() });
      setMe(updated);
      setName(updated.name);
      setEmail(updated.email);
      toast.success("Account updated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!data && !error && <Spinner />}
      {data && me && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-6 lg:col-span-2">
            <h2 className="font-medium">General</h2>
            <p className="mt-1 text-sm text-muted">Your account and how Spider looks on this device.</p>
            <form onSubmit={save} className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="block text-sm">
                <span className="text-muted">Account name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-primary" />
              </label>
              <label className="block text-sm">
                <span className="text-muted">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-primary" />
                <span className="mt-1 block text-xs text-muted">Used to sign in. Changing it takes effect at the next login.</span>
              </label>
              <div className="text-sm">
                <span className="text-muted">Created at</span>
                <div className="mt-1 py-2">{formatDateTime(me.created_at)}</div>
              </div>
              <div className="text-sm">
                <span className="text-muted">Role</span>
                <div className="mt-1 py-2 capitalize">{me.role}</div>
              </div>
              <div className="text-sm md:col-span-2">
                <span className="text-muted">Theme</span>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <ThemeToggle />
                  <span className="text-xs text-muted">Auto follows your system setting. Saved in this browser only.</span>
                </div>
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</Button>
              </div>
            </form>
          </Card>

          <RulesSettings />

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
