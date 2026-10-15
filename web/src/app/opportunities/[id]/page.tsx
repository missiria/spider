"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, DeltaBadge, ErrorBox, KpiCard, Spinner } from "@/components/ui";
import { errorMessage, getOpportunity, getProperties, listUsers, updateOpportunity } from "@/lib/api";
import { formatDateTime, formatInt, formatPct, formatPosition } from "@/lib/format";
import { confidenceLabel, PRIORITY_LABELS, priorityTone, RULE_LABELS, STATUS_LABELS, statusTone, subjectLabel } from "@/lib/opportunities";
import type { MetricTotals, OpportunityDetail, OpportunityEvent, OpportunityPriority, OpportunityStatus, PropertyRow, User } from "@/lib/types";

function describeEvent(e: OpportunityEvent, users: Map<number, string>): string {
  const who = e.user_id ? (users.get(e.user_id) ?? `user #${e.user_id}`) : "Scanner";
  const p = e.payload ?? {};
  switch (e.type) {
    case "created":
      return `${who} created this opportunity (score ${String(p.score)})`;
    case "evidence_updated":
      return `${who} refreshed the evidence (score ${String(p.score)})`;
    case "status":
      return `${who} changed status ${String(p.from)} → ${String(p.to)}${p.reason ? ` (${String(p.reason)})` : ""}`;
    case "priority":
      return `${who} changed priority ${String(p.from)} → ${String(p.to)}`;
    case "assignee":
      return `${who} ${p.to ? `assigned to ${users.get(Number(p.to)) ?? `user #${String(p.to)}`}` : "removed the assignee"}`;
    case "due_date":
      return `${who} set the due date to ${p.to ? String(p.to) : "none"}`;
    case "note":
      return `${who}: ${String(p.text)}`;
  }
}

function Totals({ t }: { t: MetricTotals }) {
  return (
    <span className="tabular">
      {formatInt(t.clicks)} clicks · {formatInt(t.impressions)} impr. · {formatPct(t.ctr)} · pos {formatPosition(t.position)}
    </span>
  );
}

function Evidence({ o, propertyUrl }: { o: OpportunityDetail; propertyUrl?: string }) {
  const ev = o.evidence as {
    period?: { start: string; end: string };
    previous?: { start: string; end: string };
    current?: Partial<MetricTotals> & { key?: string };
    previous_metrics?: unknown;
    drop?: number;
    potential_clicks?: number;
    query_impressions?: number;
    competing?: { page: string; clicks: number; impressions: number; share: number; position: number }[];
    threshold?: Record<string, unknown>;
  };
  const prev = (o.evidence as { previous?: unknown }).previous;
  const prevTotals = prev && typeof prev === "object" && "clicks" in (prev as object) ? (prev as MetricTotals) : null;
  const prevPeriod = ev.previous && "start" in ev.previous ? ev.previous : null;
  return (
    <div className="space-y-3 text-sm">
      {ev.period && (
        <div className="text-muted">
          Period <span className="tabular">{ev.period.start} → {ev.period.end}</span>
          {prevPeriod && <> vs <span className="tabular">{prevPeriod.start} → {prevPeriod.end}</span></>}
        </div>
      )}
      {ev.current && "clicks" in ev.current && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Clicks" value={formatInt(ev.current.clicks ?? 0)} delta={prevTotals && prevTotals.clicks ? ((ev.current.clicks ?? 0) - prevTotals.clicks) / prevTotals.clicks : undefined} hint={prevTotals ? `prev ${formatInt(prevTotals.clicks)}` : undefined} />
          <KpiCard label="Impressions" value={formatInt(ev.current.impressions ?? 0)} delta={prevTotals && prevTotals.impressions ? ((ev.current.impressions ?? 0) - prevTotals.impressions) / prevTotals.impressions : undefined} hint={prevTotals ? `prev ${formatInt(prevTotals.impressions)}` : undefined} />
          <KpiCard label="CTR" value={formatPct(ev.current.ctr ?? 0)} />
          <KpiCard label="Position" value={formatPosition(ev.current.position ?? 0)} />
        </div>
      )}
      {typeof ev.potential_clicks === "number" && <div>Potential: about <strong>{formatInt(ev.potential_clicks)}</strong> extra clicks per period if CTR reached 3%.</div>}
      {ev.competing && (
        <div>
          <div className="mb-1 font-medium">Pages competing for this query ({formatInt(ev.query_impressions ?? 0)} impressions)</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-1 pr-3 font-medium">Page</th>
                <th className="py-1 pr-3 text-right font-medium">Share</th>
                <th className="py-1 pr-3 text-right font-medium">Clicks</th>
                <th className="py-1 pr-3 text-right font-medium">Impr.</th>
                <th className="py-1 text-right font-medium">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {ev.competing.map((c) => (
                <tr key={c.page} className="border-b border-border/60">
                  <td className="break-all py-1 pr-3">
                    <a href={c.page} target="_blank" rel="noreferrer" className="hover:text-primary">{c.page}</a>
                  </td>
                  <td className="tabular py-1 pr-3 text-right">{formatPct(c.share, 0)}</td>
                  <td className="tabular py-1 pr-3 text-right">{formatInt(c.clicks)}</td>
                  <td className="tabular py-1 pr-3 text-right">{formatInt(c.impressions)}</td>
                  <td className="tabular py-1 text-right">{formatPosition(c.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ev.threshold && (
        <div className="text-xs text-muted">
          Threshold used: <code className="rounded bg-surface-muted px-1">{JSON.stringify(ev.threshold)}</code> — adjust in Settings → Opportunity rules.
        </div>
      )}
      {o.subject === "page" && (
        <a href={o.key_text} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          Open the page <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
      {o.subject === "query" && propertyUrl && (
        <a href={`https://www.google.com/search?q=${encodeURIComponent(`site:${propertyUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")} "${o.key_text}"`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          View in Google <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
    </div>
  );
}

export default function OpportunityPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<OpportunityDetail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getOpportunity(id);
      setData(d);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
    listUsers().then((r) => setUsers(r.items)).catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!data) return;
    getProperties().then((r) => setProperty(r.items.find((p) => p.id === data.property_id) ?? null)).catch(() => undefined);
  }, [data]);

  const patch = async (body: Parameters<typeof updateOpportunity>[1]) => {
    setBusy(true);
    try {
      setData(await updateOpportunity(id, body));
      if (body.note) setNote("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <AppShell><ErrorBox message={error} /></AppShell>;
  if (!data) return <AppShell><Spinner /></AppShell>;

  const userMap = new Map(users.map((u) => [u.id, u.name]));

  return (
    <AppShell>
      <Link href="/opportunities" className="text-sm text-muted hover:text-primary">← Opportunities</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-md px-1.5 py-0.5 font-medium ${priorityTone(data.priority)}`}>{PRIORITY_LABELS[data.priority]}</span>
            <span className={`rounded-md px-1.5 py-0.5 font-medium ${statusTone(data.status)}`}>{STATUS_LABELS[data.status]}</span>
            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-muted">{RULE_LABELS[data.rule]}</span>
            <span className="text-muted">{confidenceLabel(data.confidence)} · score {data.score}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{data.title}</h1>
          <div className="mt-1 text-sm text-muted">
            <Link href={`/properties/${data.property_id}`} className="hover:text-primary">{property?.display_name ?? `Property #${data.property_id}`}</Link>
            {" · "}
            <span title={data.key_text}>{subjectLabel(data.subject, data.key_text)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.status !== "done" && <Button onClick={() => patch({ status: "done" })} disabled={busy}>Mark done</Button>}
          {data.status !== "dismissed" && <Button variant="secondary" onClick={() => patch({ status: "dismissed" })} disabled={busy}>Dismiss</Button>}
          {(data.status === "done" || data.status === "dismissed") && <Button variant="secondary" onClick={() => patch({ status: "open" })} disabled={busy}>Reopen</Button>}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="font-medium">Why this was flagged</h2>
            <p className="mt-2 text-sm">{data.reason}</p>
            <h2 className="mt-4 font-medium">Suggested action</h2>
            <p className="mt-2 text-sm">{data.suggested_action}</p>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-medium">Evidence</h2>
            <Evidence o={data} propertyUrl={property?.site_url} />
          </Card>
          {data.impact && (
            <Card className="p-5">
              <h2 className="font-medium">Before / after completion ({data.impact.window_days} days each side of {data.impact.completed_on})</h2>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <span className="text-muted">Before ({data.impact.before.period.start} → {data.impact.before.period.end}): </span>
                  <Totals t={data.impact.before.totals} />
                </div>
                <div>
                  <span className="text-muted">After ({data.impact.after.period.start} → {data.impact.after.period.end}): </span>
                  {data.impact.after.totals ? (
                    <>
                      <Totals t={data.impact.after.totals} />{" "}
                      <DeltaBadge value={data.impact.before.totals.clicks ? (data.impact.after.totals.clicks - data.impact.before.totals.clicks) / data.impact.before.totals.clicks : null} />
                    </>
                  ) : (
                    <span className="text-muted">no data yet</span>
                  )}
                </div>
                {data.impact.note && <div className="text-xs text-muted">{data.impact.note}</div>}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-medium">Tracking</h2>
            <div className="mt-3 grid gap-3 text-sm">
              <label className="block">
                <span className="text-muted">Status</span>
                <select value={data.status} disabled={busy} onChange={(e) => patch({ status: e.target.value as OpportunityStatus })} className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 outline-none focus:border-primary">
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-muted">Priority</span>
                <select value={data.priority} disabled={busy} onChange={(e) => patch({ priority: e.target.value as OpportunityPriority })} className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 outline-none focus:border-primary">
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-muted">Assignee</span>
                <select value={data.assignee_id ?? ""} disabled={busy} onChange={(e) => patch({ assignee_id: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 outline-none focus:border-primary">
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-muted">Due date</span>
                <input type="date" value={data.due_date ?? ""} disabled={busy} onChange={(e) => patch({ due_date: e.target.value || null })} className="mt-1 w-full rounded-md border border-border px-2 py-1.5 outline-none focus:border-primary" />
              </label>
              <div className="text-xs text-muted">
                First seen {formatDateTime(data.first_seen_at)} · last seen {formatDateTime(data.last_seen_at)}
                {data.completed_at && <> · completed {formatDateTime(data.completed_at)}</>}
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-medium">Notes and history</h2>
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) void patch({ note });
              }}
            >
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add a note…" className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
              <Button type="submit" variant="secondary" disabled={busy || !note.trim()} className="mt-2">Add note</Button>
            </form>
            <ol className="mt-4 space-y-2 text-sm">
              {data.events.slice().reverse().map((e) => (
                <li key={e.id} className="border-l-2 border-border pl-3">
                  <div>{describeEvent(e, userMap)}</div>
                  <div className="text-xs text-muted">{formatDateTime(e.created_at)}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
