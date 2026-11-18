import type { IndexingScopeRef, ReasonGroup, ReasonIntent } from "./types";

/** Search Console exports list at most this many example URLs per reason. */
export const EXAMPLES_CAP = 1000;

export const ALL_KNOWN: IndexingScopeRef = { scope: "all_known", scope_detail: null };

export function scopeLabel(s: IndexingScopeRef): string {
  if (s.scope === "all_known") return "All known pages";
  if (s.scope === "submitted") return "All submitted pages";
  return s.scope_detail ? `Sitemap: ${s.scope_detail}` : "Sitemap";
}

export const scopeKey = (s: IndexingScopeRef): string => `${s.scope}|${s.scope_detail ?? ""}`;

export function scopeFromKey(key: string): IndexingScopeRef {
  const i = key.indexOf("|");
  const scope = (i < 0 ? key : key.slice(0, i)) as IndexingScopeRef["scope"];
  const detail = i < 0 ? "" : key.slice(i + 1);
  if (scope === "submitted") return { scope, scope_detail: null };
  if (scope === "sitemap") return { scope, scope_detail: detail || null };
  return ALL_KNOWN;
}

/** Query string carrying the scope between the indexing pages ("" for All known pages). */
export function scopeQuery(s: IndexingScopeRef): string {
  if (s.scope === "all_known") return "";
  const p = new URLSearchParams({ scope: s.scope });
  if (s.scope === "sitemap" && s.scope_detail) p.set("sitemap", s.scope_detail);
  return `?${p.toString()}`;
}

export function scopeFromSearch(search: string): IndexingScopeRef {
  const p = new URLSearchParams(search);
  const scope = p.get("scope");
  if (scope === "submitted") return { scope, scope_detail: null };
  if (scope === "sitemap") return { scope, scope_detail: p.get("sitemap") };
  return ALL_KNOWN;
}

export const INTENT_LABELS: Record<ReasonIntent, string> = {
  likely_defect: "Likely defect",
  intentional: "Usually intentional",
  review: "To review",
};

export const INTENT_HINTS: Record<ReasonIntent, string> = {
  likely_defect: "Pages Google could not index because of an error or a quality signal. Can raise an opportunity.",
  intentional: "Normal exclusion (canonical alternate, noindex, redirect, robots.txt). Never raised as a defect.",
  review: "Reason Spider does not classify. Shown as reported; only a first appearance raises an alert.",
};

export function intentTone(i: ReasonIntent): string {
  return i === "likely_defect" ? "bg-danger-soft text-danger" : i === "intentional" ? "bg-surface-muted text-muted" : "bg-warning-soft text-warning";
}

export const GROUP_LABELS: Record<ReasonGroup, string> = {
  not_indexed: "Not indexed",
  indexed: "Indexed",
  improvement: "Improve appearance",
};

/** Relative change, null when there is nothing to compare with. */
export function ratioDelta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}

/** Signed page difference for the reasons table: "+12", "−3", "0", or "—" without a previous report. */
export function pagesDelta(current: number, previous: number | null): string {
  if (previous === null) return "—";
  const d = current - previous;
  return d === 0 ? "0" : d > 0 ? `+${d.toLocaleString("en-US")}` : `−${Math.abs(d).toLocaleString("en-US")}`;
}

export function isIndexedCoverage(state: string | null | undefined): boolean {
  return !!state && /indexed/i.test(state) && !/not indexed|unknown/i.test(state);
}

export function verdictTone(verdict: string | null | undefined): string {
  return verdict === "PASS" ? "bg-success-soft text-success" : verdict === "FAIL" ? "bg-danger-soft text-danger" : verdict === "PARTIAL" ? "bg-warning-soft text-warning" : "bg-surface-muted text-muted";
}

export const STOP_REASON_LABELS: Record<string, string> = {
  quota: "Stopped: the daily URL Inspection quota was reached",
  permission_denied: "Stopped: Search Console refused access (permission denied)",
};

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

/** Search Console's URL Inspection screen for one URL: the only place to click "Request indexing". */
export function gscInspectUrl(siteUrl: string, url: string): string {
  return `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(siteUrl)}&id=${encodeURIComponent(url)}`;
}
