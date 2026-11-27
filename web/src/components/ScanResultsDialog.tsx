"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button, ErrorBox } from "@/components/ui";
import { assignScanResults, errorMessage } from "@/lib/api";
import { priorityTone, subjectLabel } from "@/lib/opportunities";
import { assignmentSummary, buildAssignment, groupScanItems, plural } from "@/lib/scanResults";
import type { OpportunityPriority, ScanAssignmentResult, ScanResult, User } from "@/lib/types";

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Post-scan modal (MISS-0203): the opportunities this scan created, grouped by priority with
 * their rule types, and a member per group. Nothing is assigned until "Assign selected groups";
 * closing leaves every new item open and unassigned.
 */
export function ScanResultsDialog({
  result,
  users,
  propertyName,
  onClose,
  onAssigned,
  returnFocus,
}: {
  result: ScanResult;
  users: User[];
  propertyName: Map<number, string>;
  onClose: () => void;
  /** the list must be reloaded: assignments changed (fully or partly) */
  onAssigned: (outcome: ScanAssignmentResult) => void | Promise<void>;
  /** where focus goes back on close; the scan button was disabled (unfocusable) when this opened */
  returnFocus?: React.RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupScanItems(result.new_items), [result.new_items]);
  const [selection, setSelection] = useState<Partial<Record<OpportunityPriority, number>>>({});
  const [open, setOpen] = useState<OpportunityPriority | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ScanAssignmentResult | null>(null);
  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const title = useMemo(() => new Map(result.new_items.map((i) => [i.id, i.title])), [result.new_items]);
  const body = buildAssignment(groups, selection);

  // focus moves in, stays in, and goes back to what opened the dialog (the Scan now button)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    document.body.classList.add("overflow-hidden");
    const target = returnFocus;
    return () => {
      document.body.classList.remove("overflow-hidden");
      (target?.current ?? opener)?.focus();
    };
  }, [returnFocus]);

  const close = () => {
    if (!saving) onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const assign = async () => {
    if (!body.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      // same body on a retry: the server keeps what it already assigned and never rescans
      const r = await assignScanResults(result.scan_id, body);
      setOutcome(r);
      await onAssigned(r);
    } catch (err) {
      setError(`Assignment not saved: ${errorMessage(err)}. Nothing was lost; you can retry.`);
    } finally {
      setSaving(false);
    }
  };

  const others = [result.updated ? `${result.updated} refreshed` : null, result.reopened ? `${result.reopened} reopened` : null].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onKeyDown={onKeyDown}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-surface shadow-xl sm:max-w-2xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">
              New opportunities
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              This scan found <strong className="text-foreground">{plural(result.created, "new item")}</strong> across {plural(result.properties, "property", "properties")}.
              {others.length > 0 && <> Also {others.join(" and ")}: not included below.</>}
            </p>
            {result.failed > 0 && <p className="mt-1 text-xs text-warning">{plural(result.failed, "property", "properties")} could not be scanned; run the scan again later.</p>}
          </div>
          <button type="button" onClick={close} disabled={saving} aria-label="Close" className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {users.length === 0 && <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">No members to assign to. Invite members from Settings; the new items stay unassigned meanwhile.</p>}
          <div className="hidden grid-cols-[7rem_5rem_1fr] gap-3 border-b border-border pb-1 text-xs font-medium uppercase tracking-wide text-muted sm:grid" aria-hidden>
            <span>Priority</span>
            <span className="text-right">New items</span>
            <span>Assign to</span>
          </div>
          <ul className="divide-y divide-border">
            {groups.map((g) => {
              const selectId = `${titleId}-${g.priority}`;
              const listId = `${selectId}-items`;
              return (
                <li key={g.priority} className="py-3">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[7rem_5rem_1fr]">
                    <span className={`w-fit rounded-md px-1.5 py-0.5 text-sm font-medium ${priorityTone(g.priority)}`}>{g.label}</span>
                    <span className="text-right text-sm tabular-nums">
                      <strong>{g.items.length}</strong>
                      <span className="text-muted sm:hidden"> new</span>
                    </span>
                    <div className="col-span-2 sm:col-span-1">
                      <label htmlFor={selectId} className="sr-only">
                        Assign {g.label} priority items to
                      </label>
                      <select
                        id={selectId}
                        value={selection[g.priority] ?? ""}
                        disabled={saving || users.length === 0 || outcome !== null}
                        onChange={(e) => setSelection((s) => ({ ...s, [g.priority]: e.target.value ? Number(e.target.value) : undefined }))}
                        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
                      >
                        <option value="">Leave unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    {g.rules.map((r) => (
                      <span key={r.rule} className="rounded-md bg-surface-muted px-1.5 py-0.5 text-muted">
                        {r.label} · {r.count}
                      </span>
                    ))}
                    <button type="button" aria-expanded={open === g.priority} aria-controls={listId} onClick={() => setOpen((o) => (o === g.priority ? null : g.priority))} className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary">
                      {open === g.priority ? "Hide" : "View"} items
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open === g.priority ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                  </div>
                  {open === g.priority && (
                    <ul id={listId} className="mt-2 space-y-1.5 rounded-md bg-surface-muted p-2 text-sm">
                      {g.items.map((i) => (
                        <li key={i.id} className="min-w-0">
                          <Link href={`/opportunities/${i.id}`} className="block truncate font-medium hover:text-primary" title={i.title}>
                            {i.title}
                          </Link>
                          <span className="block truncate text-xs text-muted" title={i.key_text}>
                            {propertyName.get(i.property_id) ?? `Property #${i.property_id}`} · {subjectLabel(i.subject, i.key_text)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          {error && (
            <div className="mt-2">
              <ErrorBox message={error} />
            </div>
          )}
          {outcome && (
            <div className="mt-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm" role="status">
              <p className="font-medium">{assignmentSummary(outcome)}</p>
              {outcome.conflicts.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                  {outcome.conflicts.map((c) => (
                    <li key={c.id}>
                      {title.get(c.id) ?? `#${c.id}`}: kept with {userName.get(c.assignee_id) ?? `user #${c.assignee_id}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <Button variant="secondary" onClick={close} disabled={saving}>
            {outcome ? "Close" : "Not now"}
          </Button>
          {!outcome && (
            <Button onClick={assign} disabled={saving || body.length === 0}>
              {saving ? "Assigning…" : error ? "Retry assignment" : body.length ? `Assign selected groups (${body.reduce((n, g) => n + g.ids.length, 0)})` : "Assign selected groups"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
