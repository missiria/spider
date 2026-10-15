"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { errorMessage, getRules, putRules } from "@/lib/api";
import type { RuleConfig } from "@/lib/types";
import { Button, Card, Spinner } from "./ui";

type NumField = { label: string; hint?: string; step?: number; pct?: boolean };

const FIELDS: Record<keyof Omit<RuleConfig, "window_days" | "regression_days">, { title: string; blurb: string; fields: Record<string, NumField> }> = {
  clicks_drop: {
    title: "Clicks drop",
    blurb: "Property or page whose clicks fell versus the previous window.",
    fields: { min_previous_clicks: { label: "Min. previous clicks" }, drop_ratio: { label: "Drop at least", pct: true } },
  },
  impressions_drop: {
    title: "Impressions drop",
    blurb: "Property or page whose impressions fell versus the previous window.",
    fields: { min_previous_impressions: { label: "Min. previous impressions" }, drop_ratio: { label: "Drop at least", pct: true } },
  },
  low_ctr: {
    title: "Low CTR",
    blurb: "Pages or queries ranking well but rarely clicked.",
    fields: { min_impressions: { label: "Min. impressions" }, max_ctr: { label: "CTR below", pct: true }, max_position: { label: "Position at most", step: 0.5 } },
  },
  near_page_one: {
    title: "Near page one",
    blurb: "Queries just outside the first results.",
    fields: { min_position: { label: "Position from", step: 0.5 }, max_position: { label: "Position to", step: 0.5 }, min_impressions: { label: "Min. impressions" } },
  },
  cannibalization: {
    title: "Cannibalization",
    blurb: "Several pages sharing one query (heuristic, low confidence).",
    fields: { min_impressions: { label: "Min. query impressions" }, min_share: { label: "Each page at least", pct: true } },
  },
};

export function RulesSettings() {
  const [rules, setRules] = useState<RuleConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRules().then(setRules).catch((err) => toast.error(errorMessage(err)));
  }, []);

  if (!rules) return <Spinner label="Loading rules…" />;

  const setRule = <K extends keyof typeof FIELDS>(rule: K, patch: Partial<RuleConfig[K]>) => setRules((r) => (r ? { ...r, [rule]: { ...r[rule], ...patch } } : r));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      setRules(await putRules(rules));
      toast.success("Rules saved. The next scan uses them.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 lg:col-span-2">
      <h2 className="font-medium">Opportunity rules</h2>
      <p className="mt-1 text-sm text-muted">Thresholds for the daily scan (07:30) and the Scan now button. Findings are deduplicated per rule and subject; a done item only comes back as a regression after the window below.</p>
      <form onSubmit={save} className="mt-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">Comparison window (days)</span>
            <input type="number" min={7} max={90} value={rules.window_days} onChange={(e) => setRules({ ...rules, window_days: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-primary" />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Regression window after completion (days)</span>
            <input type="number" min={0} max={365} value={rules.regression_days} onChange={(e) => setRules({ ...rules, regression_days: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-primary" />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(FIELDS) as (keyof typeof FIELDS)[]).map((rule) => {
            const meta = FIELDS[rule];
            const cfg = rules[rule] as unknown as Record<string, number | boolean>;
            return (
              <div key={rule} className={`rounded-lg border border-border p-4 ${cfg.enabled ? "" : "opacity-60"}`}>
                <label className="flex items-center justify-between gap-2">
                  <span className="font-medium">{meta.title}</span>
                  <input type="checkbox" checked={Boolean(cfg.enabled)} onChange={(e) => setRule(rule, { enabled: e.target.checked } as Partial<RuleConfig[typeof rule]>)} aria-label={`Enable ${meta.title}`} className="accent-primary" />
                </label>
                <p className="mt-1 text-xs text-muted">{meta.blurb}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {Object.entries(meta.fields).map(([key, f]) => {
                    const raw = Number(cfg[key]);
                    const shown = f.pct ? Math.round(raw * 1000) / 10 : raw;
                    return (
                      <label key={key} className="block text-xs">
                        <span className="text-muted">
                          {f.label}
                          {f.pct ? " (%)" : ""}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={f.pct ? 0.5 : (f.step ?? 1)}
                          value={shown}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setRule(rule, { [key]: f.pct ? v / 100 : v } as Partial<RuleConfig[typeof rule]>);
                          }}
                          className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm outline-none focus:border-primary"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save rules"}</Button>
      </form>
    </Card>
  );
}
