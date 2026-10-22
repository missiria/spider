"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Eye, EyeOff, Pause, Play, Send, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ExportMenu, type ExportMenuItem } from "@/components/ExportMenu";
import { ReportPreview } from "@/components/ReportPreview";
import { Button, Card, EmptyState, ErrorBox, Spinner } from "@/components/ui";
import {
  createReport,
  createSchedule,
  deleteReport,
  deleteSchedule,
  errorMessage,
  getProperties,
  getReportData,
  listReports,
  reportExportUrl,
  scheduleDeliveries,
  sendScheduleNow,
  updateSchedule,
} from "@/lib/api";
import {
  copyText,
  reportTables,
  toTsv,
  type ExportTable,
} from "@/lib/exportTable";
import { formatDateTime } from "@/lib/format";
import type {
  PropertyRow,
  ReportData,
  ReportDelivery,
  ReportSchedule,
  ReportSection,
  ReportTemplate,
} from "@/lib/types";

const SECTIONS: {
  value: ReportSection;
  label: string;
  fleet: boolean;
  property: boolean;
}[] = [
  {
    value: "overview",
    label: "Overview (KPIs, per-property table for fleet)",
    fleet: true,
    property: true,
  },
  { value: "pages", label: "Top pages", fleet: false, property: true },
  { value: "queries", label: "Top queries", fleet: false, property: true },
  { value: "countries", label: "Countries", fleet: false, property: true },
  { value: "devices", label: "Devices", fleet: false, property: true },
  {
    value: "search_appearance",
    label: "Search appearance",
    fleet: false,
    property: true,
  },
  {
    value: "opportunities",
    label: "Open opportunities",
    fleet: true,
    property: true,
  },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ScheduleRow({
  s,
  onChange,
}: {
  s: ReportSchedule;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [deliveries, setDeliveries] = useState<ReportDelivery[] | null>(null);
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await onChange();
      if (deliveries) setDeliveries((await scheduleDeliveries(s.id)).items);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const when =
    s.frequency === "weekly"
      ? `every ${DAYS[(s.day - 1) % 7]} at ${String(s.hour).padStart(2, "0")}:00`
      : `monthly on day ${s.day} at ${String(s.hour).padStart(2, "0")}:00`;
  const tone =
    s.last_status === "sent"
      ? "text-success"
      : s.last_status === "failed"
        ? "text-danger"
        : "text-muted";
  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${s.enabled ? "bg-success-soft text-success" : "bg-surface-muted text-muted"}`}
        >
          {s.enabled ? "Active" : "Paused"}
        </span>
        <span className="font-medium">{when}</span>
        <span className="text-muted">→ {s.recipients.join(", ")}</span>
        <span className="ml-auto flex gap-1">
          <button
            type="button"
            disabled={busy}
            title="Send now"
            aria-label="Send now"
            onClick={() =>
              act(
                () => sendScheduleNow(s.id),
                "Report sent (or recorded as skipped without SMTP)",
              )
            }
            className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <Send className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={busy}
            title={s.enabled ? "Pause" : "Resume"}
            aria-label={s.enabled ? "Pause schedule" : "Resume schedule"}
            onClick={() =>
              act(() => updateSchedule(s.id, { enabled: !s.enabled }))
            }
            className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            {s.enabled ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            disabled={busy}
            title="Delete"
            aria-label="Delete schedule"
            onClick={() =>
              window.confirm("Delete this schedule?") &&
              act(() => deleteSchedule(s.id), "Schedule deleted")
            }
            className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
        <span>Next {s.enabled ? formatDateTime(s.next_run_at) : "—"}</span>
        <span>
          Last {formatDateTime(s.last_run_at)}{" "}
          {s.last_status && (
            <span className={tone}>
              · {s.last_status}
              {s.last_error ? ` — ${s.last_error}` : ""}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={async () =>
            setDeliveries(
              deliveries ? null : (await scheduleDeliveries(s.id)).items,
            )
          }
          className="text-primary hover:underline"
        >
          {deliveries ? "Hide deliveries" : "Deliveries"}
        </button>
      </div>
      {deliveries && (
        <ul className="mt-2 space-y-1 text-xs">
          {deliveries.length === 0 && (
            <li className="text-muted">No deliveries yet.</li>
          )}
          {deliveries.map((d) => (
            <li key={d.id}>
              <span className="text-muted">{formatDateTime(d.created_at)}</span>{" "}
              · {d.period_key} ·{" "}
              <span
                className={
                  d.status === "sent"
                    ? "text-success"
                    : d.status === "failed"
                      ? "text-danger"
                      : "text-muted"
                }
              >
                {d.status}
              </span>
              {d.error && <span className="text-muted"> — {d.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ReportCard({
  r,
  properties,
  onChange,
}: {
  r: ReportTemplate;
  properties: Map<number, string>;
  onChange: () => Promise<void>;
}) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [sched, setSched] = useState({
    frequency: "weekly" as "weekly" | "monthly",
    day: 1,
    hour: 7,
    recipients: "",
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    data: ReportData;
    tables: ExportTable[];
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [announce, setAnnounce] = useState("");
  const periodLabel = r.config.period.start
    ? `${r.config.period.start} → ${r.config.period.end}`
    : `last ${r.config.period.days ?? 28} days`;
  const csvSections = r.config.sections;
  const sectionLabel = (s: string) =>
    SECTIONS.find((x) => x.value === s)?.label.split(" (")[0] ?? s;

  const togglePreview = async () => {
    if (previewOpen) {
      setPreviewOpen(false);
      return;
    }
    setPreviewOpen(true);
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const data = await getReportData(r.id);
      setPreview({ data, tables: reportTables(data) });
    } catch (err) {
      setPreview(null);
      setPreviewError(errorMessage(err));
    } finally {
      setLoadingPreview(false);
    }
  };

  const copyTable = async (t: ExportTable) => {
    const res = await copyText(toTsv(t));
    const message = res.ok
      ? `${t.title}: ${t.rows.length} row${t.rows.length === 1 ? "" : "s"} copied with headers`
      : `Could not copy ${t.title}. ${res.reason}`;
    setAnnounce(message);
    if (res.ok) toast.success(message);
    else toast.error(message);
  };

  const exportItems: ExportMenuItem[] = [
    {
      key: "pdf",
      group: "File",
      kind: "pdf",
      label: "PDF report",
      href: reportExportUrl(r.id, "pdf"),
    },
    ...csvSections.map((s): ExportMenuItem => ({
      key: `csv-${s}`,
      group: "CSV file",
      kind: "csv",
      label: sectionLabel(s),
      href: reportExportUrl(r.id, "csv", s),
    })),
    ...(previewOpen && preview
      ? preview.tables
          .filter((t) => t.rows.length > 0)
          .map((t, i): ExportMenuItem => ({
            key: `copy-${i}`,
            group: "Copy visible table",
            kind: "copy",
            label: t.title,
            onSelect: () => void copyTable(t),
          }))
      : []),
    {
      key: "json",
      group: "Automation",
      kind: "json",
      label: "JSON data",
      href: `/api/reports/${r.id}/data`,
    },
  ];

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createSchedule(r.id, sched);
      toast.success("Schedule created");
      setShowSchedule(false);
      setSched({ frequency: "weekly", day: 1, hour: 7, recipients: "" });
      await onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{r.name}</h2>
          <div className="text-sm text-muted">
            {r.scope === "fleet"
              ? "Whole fleet"
              : (properties.get(r.property_id ?? 0) ??
                `Property #${r.property_id}`)}{" "}
            · {periodLabel} · {r.config.sections.length} section
            {r.config.sections.length === 1 ? "" : "s"} · {r.config.limit} rows
            {r.config.filters &&
              Object.values(r.config.filters).some(Boolean) &&
              " · regex filters"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportMenu items={exportItems} />
          <Button
            variant="secondary"
            onClick={togglePreview}
            aria-expanded={previewOpen}
          >
            {previewOpen ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}{" "}
            {previewOpen ? "Hide preview" : "Preview"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowSchedule((v) => !v)}
          >
            Schedule
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (
                window.confirm(`Delete report "${r.name}" and its schedules?`)
              ) {
                await deleteReport(r.id);
                await onChange();
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      {!previewOpen && (
        <p className="mt-2 text-xs text-muted">
          Copy is available for the tables shown in the preview.
        </p>
      )}
      {previewOpen && loadingPreview && <Spinner label="Loading report…" />}
      {previewOpen && previewError && (
        <div className="mt-4">
          <ErrorBox message={previewError} />
        </div>
      )}
      {previewOpen && preview && !loadingPreview && (
        <ReportPreview
          data={preview.data}
          tables={preview.tables}
          csvHref={(s) => reportExportUrl(r.id, "csv", s)}
          onCopy={(t) => void copyTable(t)}
        />
      )}
      {showSchedule && (
        <form
          onSubmit={addSchedule}
          className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-muted/40 p-3 text-sm"
        >
          <label className="block">
            <span className="text-xs text-muted">Frequency</span>
            <select
              value={sched.frequency}
              onChange={(e) =>
                setSched({
                  ...sched,
                  frequency: e.target.value as "weekly" | "monthly",
                  day: 1,
                })
              }
              className="mt-1 block rounded-md border border-border bg-surface px-2 py-1.5"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted">
              {sched.frequency === "weekly" ? "Day" : "Day of month"}
            </span>
            {sched.frequency === "weekly" ? (
              <select
                value={sched.day}
                onChange={(e) =>
                  setSched({ ...sched, day: Number(e.target.value) })
                }
                className="mt-1 block rounded-md border border-border bg-surface px-2 py-1.5"
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={1}
                max={28}
                value={sched.day}
                onChange={(e) =>
                  setSched({ ...sched, day: Number(e.target.value) })
                }
                className="mt-1 block w-20 rounded-md border border-border px-2 py-1.5"
              />
            )}
          </label>
          <label className="block">
            <span className="text-xs text-muted">Hour</span>
            <input
              type="number"
              min={0}
              max={23}
              value={sched.hour}
              onChange={(e) =>
                setSched({ ...sched, hour: Number(e.target.value) })
              }
              className="mt-1 block w-20 rounded-md border border-border px-2 py-1.5"
            />
          </label>
          <label className="block flex-1">
            <span className="text-xs text-muted">
              Recipients (comma separated)
            </span>
            <input
              required
              value={sched.recipients}
              onChange={(e) =>
                setSched({ ...sched, recipients: e.target.value })
              }
              placeholder="client@company.com, you@agency.com"
              className="mt-1 block w-full rounded-md border border-border px-2 py-1.5"
            />
          </label>
          <Button type="submit" disabled={busy}>
            Add schedule
          </Button>
        </form>
      )}
      {r.schedules.length > 0 && (
        <ul className="mt-4 space-y-2">
          {r.schedules.map((s) => (
            <ScheduleRow key={s.id} s={s} onChange={onChange} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<{
    items: ReportTemplate[];
    mail_configured: boolean;
  } | null>(null);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    scope: "fleet" as "fleet" | "property",
    property_id: 0,
    days: 28,
    sections: ["overview", "opportunities"] as ReportSection[],
    limit: 50,
    exclude_query: "",
    include_query: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await listReports());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    getProperties()
      .then((r) => setProperties(r.items))
      .catch(() => undefined);
  }, [load]);

  const propertyName = new Map(properties.map((p) => [p.id, p.display_name]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createReport({
        name: form.name,
        scope: form.scope,
        property_id: form.scope === "property" ? form.property_id : undefined,
        config: {
          period: { days: form.days },
          sections: form.sections,
          limit: form.limit,
          filters:
            form.scope === "property"
              ? {
                  include_query: form.include_query || undefined,
                  exclude_query: form.exclude_query || undefined,
                }
              : undefined,
          notes: form.notes || undefined,
        },
      });
      toast.success("Report created");
      setCreating(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleSection = (s: ReportSection) =>
    setForm((f) => ({
      ...f,
      sections: f.sections.includes(s)
        ? f.sections.filter((x) => x !== s)
        : [...f.sections, s],
    }));

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted">
            Reusable templates → preview, PDF, CSV, copy, JSON, and weekly or
            monthly email schedules. Every export carries the period, the
            previous period, data freshness and coverage notes.
          </p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New report"}
        </Button>
      </div>
      {data && !data.mail_configured && (
        <div className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
          SMTP is not configured on this instance: scheduled reports are
          generated and recorded as “skipped” instead of emailed. Set SMTP_* in
          the API env to enable sending.
        </div>
      )}

      {creating && (
        <Card className="mt-4 p-5">
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-md border border-border px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted">Scope</span>
                <select
                  value={form.scope}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      scope: e.target.value as "fleet" | "property",
                      sections:
                        e.target.value === "fleet"
                          ? ["overview", "opportunities"]
                          : ["overview", "pages", "queries"],
                    })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-2"
                >
                  <option value="fleet">Whole fleet</option>
                  <option value="property">One property</option>
                </select>
              </label>
              {form.scope === "property" && (
                <label className="block text-sm">
                  <span className="text-muted">Property</span>
                  <select
                    required
                    value={form.property_id}
                    onChange={(e) =>
                      setForm({ ...form, property_id: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-2"
                  >
                    <option value={0}>Choose…</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="block text-sm">
              <span className="text-muted">
                Period (last N days, compared with the previous N)
              </span>
              <select
                value={form.days}
                onChange={(e) =>
                  setForm({ ...form, days: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-2"
              >
                <option value={7}>7 days</option>
                <option value={28}>28 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Rows per table</span>
              <input
                type="number"
                min={5}
                max={500}
                value={form.limit}
                onChange={(e) =>
                  setForm({ ...form, limit: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-md border border-border px-3 py-2"
              />
            </label>
            <fieldset className="md:col-span-2">
              <legend className="text-sm text-muted">Sections</legend>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {SECTIONS.filter((s) =>
                  form.scope === "fleet" ? s.fleet : s.property,
                ).map((s) => (
                  <label
                    key={s.value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.sections.includes(s.value)}
                      onChange={() => toggleSection(s.value)}
                      className="accent-primary"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {form.scope === "property" && (
              <>
                <label className="block text-sm">
                  <span className="text-muted">
                    Include queries matching (regex)
                  </span>
                  <input
                    value={form.include_query}
                    onChange={(e) =>
                      setForm({ ...form, include_query: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted">
                    Exclude queries matching (regex)
                  </span>
                  <input
                    value={form.exclude_query}
                    onChange={(e) =>
                      setForm({ ...form, exclude_query: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
                  />
                </label>
              </>
            )}
            <label className="block text-sm md:col-span-2">
              <span className="text-muted">
                Notes printed at the top of the report
              </span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-md border border-border px-3 py-2"
              />
            </label>
            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={
                  busy ||
                  form.sections.length === 0 ||
                  (form.scope === "property" && !form.property_id)
                }
              >
                Create report
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && !creating && (
        <div className="mt-6">
          <EmptyState title="No reports yet">
            Create a template, download it as PDF/CSV, or schedule it by email.
          </EmptyState>
        </div>
      )}
      {data && data.items.length > 0 && (
        <div className="mt-4 flex flex-col gap-4">
          {data.items.map((r) => (
            <ReportCard
              key={r.id}
              r={r}
              properties={propertyName}
              onChange={load}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
