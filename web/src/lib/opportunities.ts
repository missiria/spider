import type { OpportunityPriority, OpportunityRule, OpportunityStatus, OpportunitySubject } from "./types";

export const RULE_LABELS: Record<OpportunityRule, string> = {
  clicks_drop: "Clicks drop",
  impressions_drop: "Impressions drop",
  low_ctr: "Low CTR",
  near_page_one: "Near page one",
  cannibalization: "Cannibalization",
};

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  dismissed: "Dismissed",
};

export const PRIORITY_LABELS: Record<OpportunityPriority, string> = { high: "High", medium: "Medium", low: "Low" };

export const SUBJECT_LABELS: Record<OpportunitySubject, string> = { property: "Property", page: "Page", query: "Query" };

export function statusTone(s: OpportunityStatus): string {
  return s === "open" ? "bg-warning-soft text-warning" : s === "in_progress" ? "bg-primary-soft text-primary" : s === "done" ? "bg-success-soft text-success" : "bg-surface-muted text-muted";
}

export function priorityTone(p: OpportunityPriority): string {
  return p === "high" ? "bg-danger-soft text-danger" : p === "medium" ? "bg-warning-soft text-warning" : "bg-surface-muted text-muted";
}

export function confidenceLabel(c: "low" | "medium" | "high"): string {
  return c === "high" ? "High confidence" : c === "medium" ? "Medium confidence" : "Low confidence · heuristic";
}

/** Short subject label for lists: path for pages, quoted text for queries. */
export function subjectLabel(subject: OpportunitySubject, key: string): string {
  if (subject === "property") return "Whole property";
  if (subject === "page") {
    try {
      const u = new URL(key);
      return `${u.pathname}${u.search}` || "/";
    } catch {
      return key;
    }
  }
  return `“${key}”`;
}

export function isOverdue(due: string | null, status: OpportunityStatus): boolean {
  if (!due || status === "done" || status === "dismissed") return false;
  return due < new Date().toISOString().slice(0, 10);
}
