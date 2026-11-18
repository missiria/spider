import type { OpportunityPriority, OpportunityRule, OpportunityStatus, OpportunitySubject } from "./types";

export const RULE_LABELS: Record<OpportunityRule, string> = {
  clicks_drop: "Clicks drop",
  impressions_drop: "Impressions drop",
  low_ctr: "Low CTR",
  near_page_one: "Near page one",
  cannibalization: "Cannibalization",
  indexing_new_reason: "New indexing issue",
  indexing_spike: "Indexing issue growing",
  indexed_drop: "Indexed pages drop",
  submitted_not_indexed: "Sitemap URLs not indexed",
  indexing_persistent: "Indexing issue not fixed",
};

/** Rules fed by Page indexing data (report exports, URL Inspection), not Search Analytics. */
export const INDEXING_RULES: OpportunityRule[] = ["indexing_new_reason", "indexing_spike", "indexed_drop", "submitted_not_indexed", "indexing_persistent"];
export const isIndexingRule = (rule: string): boolean => (INDEXING_RULES as string[]).includes(rule);

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
  // indexing rules key a property-level finding by the Google reason text
  if (subject === "property") return key && key !== "property" && !/^(sc-domain:|https?:\/\/)/.test(key) ? key : "Whole property";
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
