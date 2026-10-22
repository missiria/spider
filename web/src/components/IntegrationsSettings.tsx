"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  createAlert,
  createWebhook,
  deleteAlert,
  deleteWebhook,
  errorMessage,
  evaluateAlerts,
  getProperties,
  listAlerts,
  listWebhooks,
  testWebhook,
  updateAlert,
  updateWebhook,
  webhookDeliveries,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { RULE_LABELS } from "@/lib/opportunities";
import type {
  AlertEventRow,
  AlertRuleRow,
  PropertyRow,
  WebhookDelivery,
  WebhookRow,
} from "@/lib/types";
import { Button, Card } from "./ui";

const EVENTS = ["alert.triggered", "report.generated", "test"];

export function WebhooksSettings({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<WebhookRow[]>([]);
  const [form, setForm] = useState({
    name: "",
    url: "",
    events: ["alert.triggered", "report.generated"],
  });
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(
    null,
  );
  const [open, setOpen] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await listWebhooks()).items);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
      if (open) setDeliveries((await webhookDeliveries(open)).items);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const w = await createWebhook(form);
      setSecret({ name: w.name, secret: w.secret });
      setForm({
        name: "",
        url: "",
        events: ["alert.triggered", "report.generated"],
      });
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="font-medium">Webhooks</h2>
      <p className="mt-1 text-sm text-muted">
        Signed JSON POSTs for n8n, Make, scripts… Payloads and verification:{" "}
        <code className="rounded bg-surface-muted px-1">docs/WEBHOOKS.md</code>.
      </p>
      {isAdmin && (
        <form
          onSubmit={create}
          className="mt-4 grid gap-2 text-sm sm:grid-cols-2"
        >
          <input
            required
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-label="Webhook name"
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            required
            placeholder="https://…"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            aria-label="Webhook URL"
            className="rounded-md border border-border px-3 py-2 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            {EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={form.events.includes(ev)}
                  onChange={() =>
                    setForm({
                      ...form,
                      events: form.events.includes(ev)
                        ? form.events.filter((x) => x !== ev)
                        : [...form.events, ev],
                    })
                  }
                  className="accent-primary"
                />
                {ev}
              </label>
            ))}
            <Button
              type="submit"
              disabled={busy || !form.events.length}
              className="ml-auto"
            >
              Add webhook
            </Button>
          </div>
        </form>
      )}
      {secret && (
        <div className="mt-3 rounded-md border border-success/30 bg-success-soft p-3 text-sm">
          Secret for <strong>{secret.name}</strong> (shown once — store it in
          your receiver):
          <code className="mt-1 block select-all rounded bg-surface px-2 py-1 font-mono text-xs">
            {secret.secret}
          </code>
          <button
            type="button"
            onClick={() => setSecret(null)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            I have copied it
          </button>
        </div>
      )}
      <ul className="mt-4 divide-y divide-border text-sm">
        {items.length === 0 && (
          <li className="py-2 text-muted">No webhooks.</li>
        )}
        {items.map((w) => (
          <li key={w.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${w.enabled ? "bg-success-soft text-success" : "bg-surface-muted text-muted"}`}
              >
                {w.enabled ? "On" : "Off"}
              </span>
              <span className="font-medium">{w.name}</span>
              <code className="truncate text-xs text-muted" title={w.url}>
                {w.url}
              </code>
              {w.last_status && (
                <span
                  className={`text-xs ${w.last_status === "ok" ? "text-success" : "text-danger"}`}
                >
                  last {w.last_status} · {formatDateTime(w.last_delivery_at)}
                </span>
              )}
              <span className="ml-auto flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    if (open === w.id) {
                      setOpen(null);
                      return;
                    }
                    setOpen(w.id);
                    setDeliveries((await webhookDeliveries(w.id)).items);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  {open === w.id ? "Hide" : "Deliveries"}
                </button>
                {isAdmin && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => act(() => testWebhook(w.id), "Test sent")}
                  >
                    Send test
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(() => updateWebhook(w.id, { enabled: !w.enabled }))
                    }
                  >
                    {w.enabled ? "Disable" : "Enable"}
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      window.confirm(`Delete webhook "${w.name}"?`) &&
                      act(() => deleteWebhook(w.id), "Webhook deleted")
                    }
                  >
                    Delete
                  </Button>
                )}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted">
              events: {w.events.join(", ")} · secret {w.secret_hint}
            </div>
            {open === w.id && (
              <ul className="mt-2 space-y-1 text-xs">
                {deliveries.length === 0 && (
                  <li className="text-muted">No deliveries yet.</li>
                )}
                {deliveries.map((d) => (
                  <li key={d.id}>
                    <span className="text-muted">
                      {formatDateTime(d.created_at)}
                    </span>{" "}
                    · {d.event} ·{" "}
                    <span
                      className={
                        d.status === "ok"
                          ? "text-success"
                          : d.status === "failed"
                            ? "text-danger"
                            : "text-warning"
                      }
                    >
                      {d.status}
                    </span>{" "}
                    · HTTP {d.response_status ?? "—"} · {d.attempts} attempt
                    {d.attempts === 1 ? "" : "s"}
                    {d.error && (
                      <span className="text-muted"> — {d.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AlertsSettings() {
  const [data, setData] = useState<{
    items: AlertRuleRow[];
    recent: AlertEventRow[];
    mail_configured: boolean;
  } | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [form, setForm] = useState({
    name: "",
    channel: "email" as "email" | "webhook",
    target: "",
    webhook_id: 0,
    priorities: ["high"] as ("high" | "medium" | "low")[],
    rules: [] as string[],
    property_ids: [] as number[],
    sync_failed: true,
    property_revoked: true,
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, w, p] = await Promise.all([
        listAlerts(),
        listWebhooks(),
        getProperties(),
      ]);
      setData(a);
      setWebhooks(w.items);
      setProperties(p.items);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    void act(
      () =>
        createAlert({
          name: form.name,
          channel: form.channel,
          target: form.channel === "email" ? form.target : form.webhook_id,
          config: {
            opportunity_priorities: form.priorities,
            opportunity_rules: form.rules,
            property_ids: form.property_ids,
            sync_failed: form.sync_failed,
            property_revoked: form.property_revoked,
          },
        }),
      "Alert rule created",
    );
  };

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">Alerts</h2>
          <p className="mt-1 text-sm text-muted">
            Evaluated hourly and after each scan over the last 48 h: new
            opportunities, failed syncs, revoked access. One alert per finding
            per rule.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            act(async () => {
              const r = await evaluateAlerts();
              toast.info(
                `${r.rules} rules · ${r.sent} sent · ${r.skipped} skipped · ${r.failed} failed`,
              );
            })
          }
        >
          Evaluate now
        </Button>
      </div>
      {data && !data.mail_configured && (
        <div className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
          SMTP not configured: email alerts are recorded as “skipped”. Webhook
          alerts work.
        </div>
      )}
      <form
        onSubmit={create}
        className="mt-4 grid gap-3 text-sm md:grid-cols-2"
      >
        <input
          required
          placeholder="Rule name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          aria-label="Alert name"
          className="rounded-md border border-border px-3 py-2"
        />
        <div className="flex gap-2">
          <select
            value={form.channel}
            onChange={(e) =>
              setForm({
                ...form,
                channel: e.target.value as "email" | "webhook",
              })
            }
            aria-label="Channel"
            className="rounded-md border border-border bg-surface px-2 py-2"
          >
            <option value="email">Email</option>
            <option value="webhook">Webhook</option>
          </select>
          {form.channel === "email" ? (
            <input
              required
              placeholder="recipients, comma separated"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              aria-label="Recipients"
              className="flex-1 rounded-md border border-border px-3 py-2"
            />
          ) : (
            <select
              required
              value={form.webhook_id}
              onChange={(e) =>
                setForm({ ...form, webhook_id: Number(e.target.value) })
              }
              aria-label="Webhook"
              className="flex-1 rounded-md border border-border bg-surface px-2 py-2"
            >
              <option value={0}>Choose a webhook…</option>
              {webhooks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <fieldset>
          <legend className="text-xs text-muted">Opportunity priorities</legend>
          <div className="mt-1 flex gap-3">
            {(["high", "medium", "low"] as const).map((p) => (
              <label
                key={p}
                className="flex items-center gap-1.5 text-xs capitalize"
              >
                <input
                  type="checkbox"
                  checked={form.priorities.includes(p)}
                  onChange={() =>
                    setForm({ ...form, priorities: toggle(form.priorities, p) })
                  }
                  className="accent-primary"
                />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs text-muted">
            Only these rules (none = all)
          </legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {Object.entries(RULE_LABELS).map(([k, v]) => (
              <label key={k} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={form.rules.includes(k)}
                  onChange={() =>
                    setForm({ ...form, rules: toggle(form.rules, k) })
                  }
                  className="accent-primary"
                />
                {v}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="text-xs text-muted">
            Only these properties (none = all)
          </legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {properties.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={form.property_ids.includes(p.id)}
                  onChange={() =>
                    setForm({
                      ...form,
                      property_ids: toggle(form.property_ids, p.id),
                    })
                  }
                  className="accent-primary"
                />
                {p.display_name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-4 md:col-span-2">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={form.sync_failed}
              onChange={(e) =>
                setForm({ ...form, sync_failed: e.target.checked })
              }
              className="accent-primary"
            />
            Sync failures
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={form.property_revoked}
              onChange={(e) =>
                setForm({ ...form, property_revoked: e.target.checked })
              }
              className="accent-primary"
            />
            Access revoked
          </label>
          <Button
            type="submit"
            disabled={busy || (form.channel === "webhook" && !form.webhook_id)}
            className="ml-auto"
          >
            Add rule
          </Button>
        </div>
      </form>
      <ul className="mt-4 divide-y divide-border text-sm">
        {data?.items.length === 0 && (
          <li className="py-2 text-muted">No alert rules.</li>
        )}
        {data?.items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
            <span
              className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${r.enabled ? "bg-success-soft text-success" : "bg-surface-muted text-muted"}`}
            >
              {r.enabled ? "On" : "Off"}
            </span>
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted">
              {r.channel === "email"
                ? `→ ${(r.target as string[]).join(", ")}`
                : `→ webhook #${r.target}`}{" "}
              · priorities {r.config.opportunity_priorities.join("/") || "none"}
              {r.config.sync_failed ? " · sync failures" : ""}
              {r.config.property_revoked ? " · revocations" : ""} · last fired{" "}
              {formatDateTime(r.last_fired_at)}
            </span>
            <span className="ml-auto flex gap-1">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  act(() => updateAlert(r.id, { enabled: !r.enabled }))
                }
              >
                {r.enabled ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  window.confirm(`Delete rule "${r.name}"?`) &&
                  act(() => deleteAlert(r.id), "Rule deleted")
                }
              >
                Delete
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {data && data.recent.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-medium">Recent alerts</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {data.recent.slice(0, 15).map((e) => (
              <li key={e.id}>
                <span className="text-muted">
                  {formatDateTime(e.created_at)}
                </span>{" "}
                · {e.kind} ·{" "}
                <span
                  className={
                    e.status === "sent"
                      ? "text-success"
                      : e.status === "failed"
                        ? "text-danger"
                        : "text-muted"
                  }
                >
                  {e.status}
                </span>{" "}
                · {e.title}
                {e.error && <span className="text-muted"> — {e.error}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
