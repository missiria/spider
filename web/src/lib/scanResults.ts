import { PRIORITY_LABELS, RULE_LABELS } from "./opportunities";
import type { OpportunityPriority, OpportunityRule, ScanAssignmentResult, ScanJob, ScanNewItem, ScanResult } from "./types";

/** Display order of the post-scan modal (MISS-0203): the app's own priorities, most urgent first. */
export const PRIORITY_ORDER: OpportunityPriority[] = ["high", "medium", "low"];

export interface ScanGroup {
  priority: OpportunityPriority;
  label: string;
  items: ScanNewItem[];
  /** rule-type breakdown, most frequent first */
  rules: { rule: OpportunityRule; label: string; count: number }[];
}

/** Group a scan's new opportunities by priority; empty priorities are left out. */
export function groupScanItems(items: ScanNewItem[]): ScanGroup[] {
  return PRIORITY_ORDER.map((priority) => {
    const inGroup = items.filter((i) => i.priority === priority);
    const counts = new Map<OpportunityRule, number>();
    for (const i of inGroup) counts.set(i.rule, (counts.get(i.rule) ?? 0) + 1);
    const rules = [...counts]
      .map(([rule, count]) => ({ rule, label: RULE_LABELS[rule] ?? rule, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return { priority, label: PRIORITY_LABELS[priority], items: inGroup, rules };
  }).filter((g) => g.items.length > 0);
}

/** The request body for the groups that have a member chosen; the others stay unassigned. */
export function buildAssignment(groups: ScanGroup[], selection: Partial<Record<OpportunityPriority, number>>): { assignee_id: number; ids: number[] }[] {
  return groups.flatMap((g) => {
    const assignee = selection[g.priority];
    return assignee ? [{ assignee_id: assignee, ids: g.items.map((i) => i.id) }] : [];
  });
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One-line outcome of an assignment, for the toast and the modal. */
export function assignmentSummary(r: ScanAssignmentResult): string {
  const done = r.assigned.length + r.unchanged.length;
  const parts = [`${plural(done, "opportunity", "opportunities")} assigned`];
  if (r.conflicts.length) parts.push(`${r.conflicts.length} already assigned by someone else (kept)`);
  const closed = r.skipped.filter((s) => s.reason !== "not_in_scan").length;
  if (closed) parts.push(`${closed} closed or removed since the scan`);
  const outside = r.skipped.length - closed;
  if (outside) parts.push(`${outside} not from this scan (ignored)`);
  return parts.join(" · ");
}

/** Toast after a scan that created nothing: what it did see instead. */
export function noNewSummary(r: { properties: number; updated: number; reopened: number }): string {
  const parts = [`Scan complete: no new opportunities across ${plural(r.properties, "property", "properties")}`];
  if (r.updated) parts.push(`${r.updated} refreshed`);
  if (r.reopened) parts.push(`${r.reopened} reopened`);
  return parts.join(" · ");
}

/**
 * Start a background scan and poll it to the end (MISS-0203). A scan runs 25-60 s, longer
 * than one proxied request may last. A few failed polls in a row are tolerated (network
 * blip); a failed scan or a lost job rejects, so the caller never shows a false success.
 */
export async function pollScan(start: () => Promise<ScanJob>, get: (id: string) => Promise<ScanJob>, opts: { intervalMs?: number; timeoutMs?: number; maxErrors?: number } = {}): Promise<ScanResult> {
  const { intervalMs = 1500, timeoutMs = 10 * 60_000, maxErrors = 3 } = opts;
  let job = await start();
  const deadline = Date.now() + timeoutMs;
  let errors = 0;
  while (job.status === "running") {
    if (Date.now() > deadline) throw new Error("The scan is taking too long; check the list again in a few minutes");
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      job = await get(job.scan_id);
      errors = 0;
    } catch (err) {
      errors += 1;
      if (errors >= maxErrors) throw err;
    }
  }
  if (job.status === "failed" || !job.result) throw new Error(job.error ?? "The scan failed");
  return job.result;
}
