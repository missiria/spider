"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { SignupsCard } from "@/components/SignupsCard";
import { Button, Card, ErrorBox, KpiCard, Spinner } from "@/components/ui";
import {
  errorMessage,
  getAdminOverview,
  getAdminSmtp,
  getMe,
  listAdminAccounts,
  listAdminWorkspaces,
  sendSmtpTest,
  setAccountActive,
  type AdminAccount,
  type AdminOverview,
  type AdminSmtp,
  type AdminWorkspace,
} from "@/lib/api";
import { formatDate } from "@/lib/format";

interface Data {
  overview: AdminOverview;
  accounts: AdminAccount[];
  workspaces: AdminWorkspace[];
  smtp: AdminSmtp;
  meId: number;
}

const STATUS: Record<AdminAccount["approval_status"], string> = {
  approved: "Approved",
  pending: "Waiting for approval",
  rejected: "Rejected",
};

export default function XDashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [overview, accounts, workspaces, smtp, me] = await Promise.all([
        getAdminOverview(),
        listAdminAccounts(),
        listAdminWorkspaces(),
        getAdminSmtp(),
        getMe(),
      ]);
      setData({ overview, accounts, workspaces, smtp, meId: me.id });
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (a: AdminAccount) => {
    if (
      a.is_active &&
      !window.confirm(
        `Deactivate ${a.email}? They are signed out everywhere and can no longer sign in.`,
      )
    )
      return;
    setBusyId(a.id);
    try {
      await setAccountActive(a.id, !a.is_active);
      toast.success(
        a.is_active ? `${a.email} deactivated` : `${a.email} reactivated`,
      );
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const testSmtp = async () => {
    setTesting(true);
    try {
      const r = await sendSmtpTest();
      if (r.sent) toast.success(`Test email sent to ${r.to}`);
      else toast.error(`Test email not sent: ${r.error ?? "unknown error"}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  const { overview, accounts, workspaces, smtp, meId } = data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Super admin</h1>
        <p className="mt-1 text-sm text-muted">
          Every Spider account and workspace, across all customers.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Accounts" value={String(overview.users)} />
        <KpiCard label="Active" value={String(overview.active)} />
        <KpiCard label="Waiting" value={String(overview.pending)} />
        <KpiCard label="Workspaces" value={String(overview.workspaces)} />
        <KpiCard label="Properties" value={String(overview.properties)} />
      </div>

      <SignupsCard />

      <Card className="overflow-hidden">
        <div className="p-5 pb-3">
          <h2 className="font-medium">Accounts</h2>
          <p className="mt-1 text-sm text-muted">
            Deactivating signs the person out on every device. Their data stays.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-surface-muted text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Workspace</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((a) => (
                <tr key={a.id} className={a.is_active ? "" : "text-muted"}>
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted">{a.email}</div>
                  </td>
                  <td className="px-3 py-2.5">{a.workspace_name ?? "None"}</td>
                  <td className="px-3 py-2.5 capitalize">{a.role}</td>
                  <td className="px-3 py-2.5">
                    {a.approval_status === "approved"
                      ? a.is_active
                        ? "Active"
                        : "Deactivated"
                      : STATUS[a.approval_status]}
                  </td>
                  <td className="tabular px-3 py-2.5">
                    {formatDate(a.created_at)}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {a.approval_status === "approved" && a.id !== meId && (
                      <Button
                        variant={a.is_active ? "secondary" : "primary"}
                        disabled={busyId === a.id}
                        onClick={() => toggle(a)}
                      >
                        {a.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <h2 className="p-5 pb-3 font-medium">Workspaces</h2>
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-surface-muted text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Members</th>
                <th className="px-5 py-2 text-right font-medium">Properties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {workspaces.map((w) => (
                <tr key={w.id}>
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted">{w.slug}</div>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">
                    {w.members}
                  </td>
                  <td className="tabular px-5 py-2.5 text-right">
                    {w.properties}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <h2 className="font-medium">Outgoing email</h2>
          <p className="mt-1 text-sm text-muted">
            Server settings come from the API environment file on the VPS.
            Credentials are never shown here.
          </p>
          <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Status</dt>
            <dd>{smtp.configured ? "Configured" : "Not configured"}</dd>
            <dt className="text-muted">Server</dt>
            <dd className="break-all">
              {smtp.host ? `${smtp.host}:${smtp.port}` : "None"}
            </dd>
            <dt className="text-muted">Encryption</dt>
            <dd>{smtp.secure ? "TLS" : smtp.starttls ? "STARTTLS" : "None"}</dd>
            <dt className="text-muted">Sign-in</dt>
            <dd>{smtp.authenticated ? "Yes" : "No"}</dd>
            <dt className="text-muted">Sender</dt>
            <dd className="break-all">
              {smtp.from ? `${smtp.from_name} <${smtp.from}>` : "None"}
            </dd>
          </dl>
          <Button
            className="mt-5"
            variant="secondary"
            disabled={testing || !smtp.configured}
            onClick={testSmtp}
          >
            {testing ? "Sending…" : "Send me a test email"}
          </Button>
          <Link
            href="/x-dashboard/email"
            className="mt-3 block text-sm font-medium text-primary"
          >
            Edit shared email branding →
          </Link>
        </Card>
      </div>
    </div>
  );
}
