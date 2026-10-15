"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, EmptyState, ErrorBox, Spinner } from "@/components/ui";
import { errorMessage, getProperties, listOpportunities, listUsers, scanOpportunities, updateOpportunity, type OpportunityFilter } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { confidenceLabel, isOverdue, PRIORITY_LABELS, priorityTone, RULE_LABELS, STATUS_LABELS, statusTone, SUBJECT_LABELS, subjectLabel } from "@/lib/opportunities";
import type { Opportunity, OpportunityList, OpportunityPriority, OpportunityStatus, PropertyRow, User } from "@/lib/types";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

export default function OpportunitiesPage() {
  const [filter, setFilter] = useState<OpportunityFilter>({ status: "active" });
  const [data, setData] = useState<OpportunityList | null>(null);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | "scan" | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listOpportunities(filter));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    getProperties().then((r) => setProperties(r.items)).catch(() => undefined);
    listUsers().then((r) => setUsers(r.items)).catch(() => undefined);
  }, []);

  const propertyName = useMemo(() => new Map(properties.map((p) => [p.id, p.display_name])), [properties]);
  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  const scan = async () => {
    setBusy("scan");
    try {
      const r = await scanOpportunities();
      toast.success(`Scanned ${r.properties} properties: ${r.created} new, ${r.updated} refreshed, ${r.findings} findings`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const patch = async (o: Opportunity, body: Parameters<typeof updateOpportunity>[1]) => {
    setBusy(o.id);
    try {
      await updateOpportunity(o.id, body);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const active = (data?.counts.open ?? 0) + (data?.counts.in_progress ?? 0);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
          <p className="mt-1 text-sm text-muted">Evidence-backed SEO work from your Search Console data. Findings are measured changes or heuristics, never diagnosed causes.</p>
        </div>
        <Button variant="secondary" onClick={scan} disabled={busy === "scan" || data?.scanning}>
          <RefreshCw className={`h-4 w-4 ${busy === "scan" || data?.scanning ? "animate-spin" : ""}`} aria-hidden />
          {busy === "scan" || data?.scanning ? "Scanning…" : "Scan now"}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-surface p-0.5" role="group" aria-label="Status">
          {STATUS_TABS.map((t) => (
            <button key={t.value} type="button" onClick={() => setFilter((f) => ({ ...f, status: t.value }))} aria-pressed={filter.status === t.value} className={`rounded px-3 py-1 text-sm ${filter.status === t.value ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>
              {t.label}
              {data && t.value !== "all" && t.value !== "active" && <span className="ml-1 text-xs opacity-70">{data.counts[t.value as OpportunityStatus]}</span>}
              {data && t.value === "active" && <span className="ml-1 text-xs opacity-70">{active}</span>}
            </button>
          ))}
        </div>
        <select value={filter.property_id ?? ""} onChange={(e) => setFilter((f) => ({ ...f, property_id: e.target.value ? Number(e.target.value) : undefined }))} aria-label="Property" className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary">
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <select value={filter.rule ?? ""} onChange={(e) => setFilter((f) => ({ ...f, rule: e.target.value || undefined }))} aria-label="Rule" className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary">
          <option value="">All rules</option>
          {Object.entries(RULE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={filter.priority ?? ""} onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value || undefined }))} aria-label="Priority" className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary">
          <option value="">Any priority</option>
          {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={filter.subject ?? ""} onChange={(e) => setFilter((f) => ({ ...f, subject: e.target.value || undefined }))} aria-label="Subject" className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary">
          <option value="">Any subject</option>
          {Object.entries(SUBJECT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={filter.assignee_id ?? ""} onChange={(e) => setFilter((f) => ({ ...f, assignee_id: e.target.value ? Number(e.target.value) : undefined }))} aria-label="Assignee" className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary">
          <option value="">Anyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {data && <span className="ml-auto text-xs text-muted">{data.items.length} item{data.items.length === 1 ? "" : "s"}</span>}
      </div>

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && (
        <div className="mt-6">
          <EmptyState title="Nothing here">
            {active === 0 && data.counts.done + data.counts.dismissed === 0 ? "Run a scan to evaluate the connected properties against the rules." : "No opportunity matches these filters."}
          </EmptyState>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {data.items.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-md px-1.5 py-0.5 font-medium ${priorityTone(o.priority)}`}>{PRIORITY_LABELS[o.priority]}</span>
                    <span className={`rounded-md px-1.5 py-0.5 font-medium ${statusTone(o.status)}`}>{STATUS_LABELS[o.status]}</span>
                    <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-muted">{RULE_LABELS[o.rule]}</span>
                    <span className="text-muted">{confidenceLabel(o.confidence)}</span>
                    <span className="text-muted">· score {o.score}</span>
                  </div>
                  <Link href={`/opportunities/${o.id}`} className="mt-1 block font-medium hover:text-primary">
                    {o.title}
                  </Link>
                  <div className="mt-0.5 text-sm text-muted">
                    <Link href={`/properties/${o.property_id}`} className="hover:text-primary">{propertyName.get(o.property_id) ?? `Property #${o.property_id}`}</Link>
                    {" · "}
                    <span title={o.key_text}>{subjectLabel(o.subject, o.key_text)}</span>
                  </div>
                  <p className="mt-2 text-sm">{o.suggested_action}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>First seen {formatDate(o.first_seen_at)}</span>
                    <span>Last seen {formatDateTime(o.last_seen_at)}</span>
                    {o.due_date && <span className={isOverdue(o.due_date, o.status) ? "text-danger" : ""}>Due {o.due_date}{isOverdue(o.due_date, o.status) ? " · overdue" : ""}</span>}
                    {o.assignee_id && <span>Assigned to {userName.get(o.assignee_id) ?? `user #${o.assignee_id}`}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 text-sm">
                  <select value={o.status} disabled={busy === o.id} onChange={(e) => patch(o, { status: e.target.value as OpportunityStatus })} aria-label="Status" className="rounded-md border border-border bg-surface px-2 py-1 outline-none focus:border-primary">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select value={o.priority} disabled={busy === o.id} onChange={(e) => patch(o, { priority: e.target.value as OpportunityPriority })} aria-label="Priority" className="rounded-md border border-border bg-surface px-2 py-1 outline-none focus:border-primary">
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select value={o.assignee_id ?? ""} disabled={busy === o.id} onChange={(e) => patch(o, { assignee_id: e.target.value ? Number(e.target.value) : null })} aria-label="Assignee" className="rounded-md border border-border bg-surface px-2 py-1 outline-none focus:border-primary">
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <input type="date" value={o.due_date ?? ""} disabled={busy === o.id} onChange={(e) => patch(o, { due_date: e.target.value || null })} aria-label="Due date" className="rounded-md border border-border px-2 py-1 outline-none focus:border-primary" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
