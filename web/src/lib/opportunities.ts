import type { OpportunityFilter } from "./api";
import { DEFAULT_PAGE_SIZE, isPageSize, type PageSize } from "./pagination";
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
  not_indexed_reason: "Pages not indexed",
};

/** Rules fed by Page indexing data (report exports, URL Inspection), not Search Analytics. */
export const INDEXING_RULES: OpportunityRule[] = ["indexing_new_reason", "indexing_spike", "indexed_drop", "submitted_not_indexed", "indexing_persistent", "not_indexed_reason"];
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

/** Status tabs of the list; "active" is open + in progress. */
export const STATUS_TABS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

export const DEFAULT_OPPORTUNITY_FILTER: OpportunityFilter = { status: "active" };

const positiveInt = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined);
const oneOf = (v: unknown, allowed: object): string | undefined => (typeof v === "string" && Object.hasOwn(allowed, v) ? v : undefined);

/**
 * Clean a remembered list filter (MISS-0189): unknown keys and values that no longer exist
 * are dropped, never shown as an empty list. Pass the loaded option ids to also drop a
 * property or assignee that was deleted since the filter was saved.
 */
export function sanitizeOpportunityFilter(raw: unknown, known: { propertyIds?: number[]; userIds?: number[] } = {}): OpportunityFilter {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const status = typeof r.status === "string" && STATUS_TABS.some((t) => t.value === r.status) ? r.status : "active";
  const out: OpportunityFilter = { status };
  const property = positiveInt(r.property_id);
  if (property && (!known.propertyIds || known.propertyIds.includes(property))) out.property_id = property;
  const rule = oneOf(r.rule, RULE_LABELS);
  if (rule) out.rule = rule;
  const priority = oneOf(r.priority, PRIORITY_LABELS);
  if (priority) out.priority = priority;
  const subject = oneOf(r.subject, SUBJECT_LABELS);
  if (subject) out.subject = subject;
  const assignee = positiveInt(r.assignee_id);
  if (assignee && (!known.userIds || known.userIds.includes(assignee))) out.assignee_id = assignee;
  return out;
}

/** Page and rows per page of the list, remembered with the filters (MISS-0197). */
export interface OpportunityPaging {
  page: number;
  page_size: PageSize;
}

export const DEFAULT_OPPORTUNITY_PAGING: OpportunityPaging = { page: 1, page_size: DEFAULT_PAGE_SIZE };

export function sanitizeOpportunityPaging(raw: unknown): OpportunityPaging {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { page: positiveInt(r.page) ?? 1, page_size: isPageSize(r.page_size) ? r.page_size : DEFAULT_PAGE_SIZE };
}
