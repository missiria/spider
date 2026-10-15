"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { AppShell } from "@/components/AppShell";
import { Button, Card, ErrorBox, Spinner } from "@/components/ui";
import { deactivateUser, errorMessage, getMe, getSyncHealth, inviteUser, listUsers, type SyncHealth } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { User } from "@/lib/types";

export default function SystemPage() {
  const [health, setHealth] = useState<SyncHealth | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState({ email: "", name: "", role: "member" as "member" | "admin" });
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, u, m] = await Promise.all([getSyncHealth(), listUsers(), getMe()]);
      setHealth(h);
      setUsers(u.items);
      setMe(m);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await inviteUser(invite);
      setIssued({ email: r.user.email, password: r.temporary_password });
      setInvite({ email: "", name: "", role: "member" });
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u: User) => {
    if (!window.confirm(`Deactivate ${u.email}? They can no longer sign in.`)) return;
    setBusy(true);
    try {
      await deactivateUser(u.id);
      toast.success("User deactivated");
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = me?.role === "admin";

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">System</h1>
      <p className="mt-1 text-sm text-muted">Sync health, failures and beta access. Refreshes every 30 s.</p>
      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!health && !error && <Spinner />}
      {health && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Sync health</h2>
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${health.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{health.ok ? "Healthy" : "Needs attention"}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-muted">Connected</dt><dd className="tabular">{health.properties.connected} / {health.properties.total}</dd>
              <dt className="text-muted">Pending</dt><dd className="tabular">{health.properties.pending}</dd>
              <dt className="text-muted">Revoked</dt><dd className="tabular">{health.properties.revoked}</dd>
              <dt className="text-muted">Error</dt><dd className="tabular">{health.properties.error}</dd>
            </dl>
            {health.mock && <div className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">GSC_MOCK=1 — this instance serves recorded fixtures, not live Google data.</div>}
            <h3 className="mt-4 text-sm font-medium">Stale (no sync in 36 h)</h3>
            {health.properties.stale.length === 0 ? <p className="text-sm text-muted">None.</p> : (
              <ul className="mt-1 text-sm">
                {health.properties.stale.map((p) => (
                  <li key={p.id}><Link href={`/properties/${p.id}`} className="hover:text-primary">{p.site_url}</Link> <span className="text-muted">last {formatDateTime(p.last_sync_at)}</span></li>
                ))}
              </ul>
            )}
            <h3 className="mt-4 text-sm font-medium">Properties with errors</h3>
            {health.properties.with_errors.length === 0 ? <p className="text-sm text-muted">None.</p> : (
              <ul className="mt-1 space-y-1 text-sm">
                {health.properties.with_errors.map((p) => (
                  <li key={p.id}><Link href={`/properties/${p.id}`} className="hover:text-primary">{p.site_url}</Link> <span className="text-danger">{p.last_error}</span></li>
                ))}
              </ul>
            )}
            <h3 className="mt-4 text-sm font-medium">Failed runs (last 20)</h3>
            {health.failed_runs.length === 0 ? <p className="text-sm text-muted">None.</p> : (
              <ul className="mt-1 space-y-1 text-sm">
                {health.failed_runs.map((r) => (
                  <li key={r.id}><span className="text-muted">{formatDateTime(r.started_at)}</span> · <Link href={`/properties/${r.property_id}`} className="hover:text-primary">property #{r.property_id}</Link> · {r.kind} · <span className="text-danger">{r.error}</span></li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-medium">Beta access</h2>
            <p className="mt-1 text-sm text-muted">Invite-only: an admin creates accounts here. The temporary password is shown once; send it through a separate channel.</p>
            {isAdmin ? (
              <form onSubmit={submitInvite} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="email" required placeholder="email@company.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} aria-label="Email" className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
                <input required placeholder="Name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} aria-label="Name" className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
                <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as "member" | "admin" })} aria-label="Role" className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <Button type="submit" disabled={busy}>Invite</Button>
              </form>
            ) : (
              <p className="mt-3 text-sm text-muted">Only admins can invite users.</p>
            )}
            {issued && (
              <div className="mt-4 rounded-md border border-success/30 bg-success-soft p-3 text-sm">
                <div>Account created for <strong>{issued.email}</strong>. Temporary password (shown once):</div>
                <code className="mt-1 block select-all rounded bg-surface px-2 py-1 font-mono">{issued.password}</code>
                <button type="button" onClick={() => setIssued(null)} className="mt-2 text-xs text-primary hover:underline">I have copied it</button>
              </div>
            )}
            <h3 className="mt-5 text-sm font-medium">Users</h3>
            <ul className="mt-2 divide-y divide-border text-sm">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <div>{u.name} <span className="text-xs text-muted">· {u.role}</span></div>
                    <div className="text-xs text-muted">{u.email} · since {formatDateTime(u.created_at)}</div>
                  </div>
                  {isAdmin && me?.id !== u.id && (
                    <Button variant="danger" disabled={busy} onClick={() => remove(u)}>Deactivate</Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
